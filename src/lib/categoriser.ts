import { CATEGORIES, type Category } from './categories'
import type { CategoryRule, RecurringItem } from '@/types'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
const MODEL = 'claude-haiku-4-5'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export const LLM_BATCH_SIZE = 40
export const LLM_CONCURRENCY = 5

export interface CategoriserInput {
  id: string
  memo: string
  amount: number
}

export interface CategoriserResult {
  id: string
  category: Category
  subcategory: string
  pattern: string                       // canonical merchant key for caching
  recurring_item_id: string | null      // matched recurring item, if any
}

const SYSTEM_PROMPT = `You categorise UK personal-finance transactions and link them to recurring obligations.

For each transaction, return:
- category: ONE of [${CATEGORIES.join(', ')}, Transfer]
- subcategory: a short, specific label (e.g. "Groceries", "Eating Out", "Fuel", "Coffee", "Streaming", "Mortgage", "Salary"). 1-3 words.
- pattern: the canonical merchant/payee key you would use to cache this rule. Strip transaction IDs, dates, branch numbers. Examples: "TESCO STORES 1234 HEREFORD" -> "TESCO STORES"; "AMZN MKTPLACE B12345" -> "AMAZON"; "OCTOPUS ENERGY DD" -> "OCTOPUS ENERGY". Uppercase, no punctuation noise.
- recurring_item_id: if this transaction is clearly the realised payment of one of the active recurring obligations (provided in the user message), return its id. Otherwise null. Match by merchant name + roughly matching amount (within ~15%). One-off purchases, irregular spend, salary deposits = null.

Category guidance:
- Income: money arriving from OUTSIDE (salary, client payments, interest, refunds over £100). NOT money the user moved in from their own other accounts (savings, Marcus/Goldman, ISA withdrawals) — that is Transfer.
- Tax: HMRC, VAT, council tax (council tax may also be Housing — prefer Housing for direct debits to councils labelled "council tax")
- Housing: mortgage, rent, council tax DDs, ground rent, home maintenance
- Debt: repayments to EXTERNAL lenders only (personal loans, car finance, someone else's money). The user's own credit-card repayments are Transfer, never Debt — the card's purchases are already the spend.
- Utilities: gas, electric, water, broadband, mobile, TV licence
- Insurance: any insurance premium
- Savings: almost never correct for a bank row — moving money into the user's own savings/ISA/investments is Transfer, not spend. Reserve Savings for payments into a product that isn't the user's own account (e.g. a child's fund held elsewhere)
- Subscriptions: streaming, software, news, gym membership
- Health: pharmacy, dentist, GP, supplements, therapy, pet insurance for vet
- Budget: day-to-day spending (groceries, eating out, coffee, shopping, leisure) — this is the catch-all for variable lifestyle spend
- Business: anything business expense related, supplier paid by Joe personally for company use
- Transport: fuel, parking, train, taxi, Uber, car finance, car insurance is Insurance not Transport
- Education: schools, courses, books for learning
- Transfer: money moving between the user's OWN accounts — current↔savings, paying off their own credit card (memos like "Payment, Thank You", "B/CARD ... DDR/BBP", a 16-digit card number + BBP/DDR), moving to an ISA/investment, "Withdrawal to <account>", "Transfer to/from <account>". This includes the user's accounts at OTHER banks not visible here (e.g. Marcus / Goldman Sachs / Saga savings) — in either direction. This is internal shuffling, NOT external spend or income. When in doubt between Transfer and Income/Savings/Debt for an account-to-account move, choose Transfer. Do NOT use Transfer for payments to other people or companies (a real supplier, a friend, a creditor like a loan company) — those keep their real category (Debt/Budget/etc).

Be decisive. If genuinely ambiguous, prefer Budget. Never invent categories outside the list. Never invent recurring_item_ids — only use ids exactly as provided.`

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>
  usage?: { input_tokens: number; output_tokens: number }
}

export async function categoriseTransactions(
  txs: CategoriserInput[],
  recurringItems: RecurringItem[] = [],
): Promise<CategoriserResult[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Missing VITE_ANTHROPIC_API_KEY — set it in .env')
  }
  if (txs.length === 0) return []

  const activeRecurring = recurringItems
    .filter(r => r.is_active)
    .map(r => ({
      id: r.id,
      name: r.name,
      amount: r.amount,
      frequency: r.frequency,
      category: r.category,
      subcategory: r.subcategory,
    }))

  // Pull preferred subcategory labels from budget items so the LLM uses the
  // exact same string the user budgeted under (otherwise "Coffee"/"Eating Out"/
  // "Cafe" all end up as different subcategories and the budget match misses).
  const preferredSubcategories = Array.from(new Set(
    recurringItems
      .filter(r => r.is_active && r.subcategory && r.subcategory.trim() !== '')
      .map(r => ({ category: r.category, subcategory: r.subcategory })),
  ))

  const userBlock = JSON.stringify(
    txs.map(t => ({ id: t.id, memo: t.memo, amount: t.amount })),
    null,
    2,
  )

  const recurringBlock = activeRecurring.length > 0
    ? `\n\nActive recurring obligations (use these ids verbatim for recurring_item_id):\n${JSON.stringify(activeRecurring, null, 2)}`
    : '\n\nNo recurring obligations to match against — return recurring_item_id: null for every transaction.'

  const preferredBlock = preferredSubcategories.length > 0
    ? `\n\nPreferred subcategory labels (when a transaction fits one of these category+subcategory combos, use the EXACT subcategory string so it matches the user's budget tracking):\n${JSON.stringify(preferredSubcategories, null, 2)}`
    : ''

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: `Categorise these transactions. Return ONLY a JSON array, no prose. Each element: {"id":"...","category":"...","subcategory":"...","pattern":"...","recurring_item_id":"..."|null}.\n\n${userBlock}${recurringBlock}${preferredBlock}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${text}`)
  }

  const json = (await res.json()) as AnthropicResponse
  const text = json.content.find(b => b.type === 'text')?.text ?? ''
  const parsed = extractJsonArray(text)
  const validRecurringIds = new Set(recurringItems.map(r => r.id))
  return parsed.filter((r): r is CategoriserResult => {
    if (typeof r !== 'object' || r === null) return false
    const o = r as Record<string, unknown>
    if (
      typeof o.id !== 'string' ||
      typeof o.category !== 'string' ||
      !((CATEGORIES as readonly string[]).includes(o.category) || o.category === 'Transfer') ||
      typeof o.subcategory !== 'string' ||
      typeof o.pattern !== 'string'
    ) return false
    // recurring_item_id may be missing, null, or a valid id
    if (o.recurring_item_id != null && typeof o.recurring_item_id !== 'string') return false
    if (typeof o.recurring_item_id === 'string' && !validRecurringIds.has(o.recurring_item_id)) {
      o.recurring_item_id = null  // strip hallucinated ids
    }
    if (o.recurring_item_id === undefined) o.recurring_item_id = null
    return true
  }) as CategoriserResult[]
}

function extractJsonArray(text: string): unknown[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Run an array of jobs with bounded concurrency. Each job gets dispatched as
// soon as a slot frees up — preserves throughput without overwhelming the API.
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

// Match a memo against existing rules using substring containment.
// Returns the best matching rule (longest pattern wins) or null.
export function matchRule(memo: string, rules: CategoryRule[]): CategoryRule | null {
  const m = memo.toUpperCase()
  let best: CategoryRule | null = null
  for (const r of rules) {
    if (m.includes(r.pattern.toUpperCase())) {
      if (!best || r.pattern.length > best.pattern.length) best = r
    }
  }
  return best
}
