// Shared ingestion library: parse bank CSVs, dedupe, upsert, categorise.
// Mirrors the browser logic in src/lib/csv-parser.ts and src/lib/categoriser.ts
// so a CLI import produces byte-identical rows to an in-app upload (same
// content-hash `number`, same sign convention, same categories).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ---- env -------------------------------------------------------------------
function readEnv() {
  const env = {}
  try {
    const raw = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2]
    }
  } catch { /* fall back to process.env */ }
  return { ...env, ...process.env }
}

const env = readEnv()
export const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
)
const ANTHROPIC_API_KEY = env.VITE_ANTHROPIC_API_KEY

// ---- CSV parsing (ported from src/lib/csv-parser.ts) -----------------------
export function rowHash(date, amount, memo) {
  const s = `${date}|${amount.toFixed(2)}|${memo.trim()}`
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return `h${(h >>> 0).toString(36)}`
}

function parseRow(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) { result.push(current); current = '' }
    else current += char
  }
  result.push(current)
  return result
}

function normalizeDate(dateStr) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const uk = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (uk) { const [, d, m, y] = uk; return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` }
  const bc = dateStr.match(/^(\d{1,2})\s([A-Za-z]{3})\s(\d{2})$/)
  if (bc) {
    const [, d, mon, yy] = bc
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
    const m = months[mon.toLowerCase()]
    if (m) return `20${yy}-${m}-${d.padStart(2, '0')}`
  }
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return dateStr
}

// Headered Barclays export: Number,Date,Account,Amount,Subcategory,Memo
// Banks use negative = money out; LifeFlow flips so positive = money out.
export function parseHeaderedCsv(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const header = parseRow(lines[0]).map(h => h.toLowerCase().trim())
  const idx = (names) => header.findIndex(h => names.includes(h))
  const dateIdx = idx(['date'])
  const accountIdx = idx(['account'])
  const amountIdx = idx(['amount'])
  const categoryIdx = idx(['category'])
  const subcategoryIdx = idx(['subcategory'])
  const memoIdx = idx(['memo', 'description', 'details'])
  if (dateIdx === -1 || amountIdx === -1) throw new Error('CSV must have Date and Amount columns')

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseRow(line)
    const amount = parseFloat((cols[amountIdx] || '0').replace(/[£$,]/g, ''))
    if (isNaN(amount)) continue
    const date = normalizeDate((cols[dateIdx] || '').trim())
    const memo = memoIdx >= 0 ? (cols[memoIdx] || '').trim() : ''
    const flipped = -amount
    rows.push({
      number: rowHash(date, flipped, memo),
      date,
      account: accountIdx >= 0 ? (cols[accountIdx] || '').trim() : '',
      amount: flipped,
      category: categoryIdx >= 0 ? (cols[categoryIdx] || '').trim() : '',
      subcategory: subcategoryIdx >= 0 ? (cols[subcategoryIdx] || '').trim() : '',
      memo,
    })
  }
  return rows
}

// ---- source resolution -----------------------------------------------------
// Map a bank Account string (sort code + number) to a source NAME.
export const ACCOUNT_TO_SOURCE = {
  '20-26-78 70993905': 'Premier BK AC',
  '20-98-68 40250589': 'Current',
  '20-98-68 73681882': 'Savings 1',
}

export async function loadSources() {
  const { data, error } = await supabase.from('sources').select('*')
  if (error) throw error
  return data || []
}

// ---- upsert ----------------------------------------------------------------
export async function existingNumbers(sourceId) {
  const set = new Set()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('transactions').select('number')
      .eq('source_id', sourceId)
      .order('id', { ascending: true })   // stable order — unordered range pagination can skip/repeat rows
      .range(from, from + pageSize - 1)
    if (error) throw error
    for (const t of data) set.add(t.number)
    if (data.length < pageSize) break
  }
  return set
}

export async function upsertTransactions(sourceId, rows) {
  const seen = new Set()
  const deduped = rows.filter(r => { if (seen.has(r.number)) return false; seen.add(r.number); return true })
  const records = deduped.map(r => ({
    source_id: sourceId, number: r.number, date: r.date, account: r.account,
    amount: r.amount, category: r.category, subcategory: r.subcategory, memo: r.memo,
  }))
  const inserted = []
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500)
    const { data, error } = await supabase
      .from('transactions')
      .upsert(batch, { onConflict: 'source_id,number', ignoreDuplicates: true })
      .select()
    if (error) throw error
    if (data) inserted.push(...data)
  }
  return inserted
}

// ---- categorisation (ported from src/lib/categoriser.ts) -------------------
const CATEGORIES = ['Income', 'Tax', 'Housing', 'Debt', 'Utilities', 'Insurance', 'Savings', 'Subscriptions', 'Health', 'Budget', 'Business', 'Transport', 'Education']

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
- Transfer: money moving between the user's OWN accounts — current↔savings, paying off their own credit card (memos like "Payment, Thank You", "B/CARD ... DDR/BBP", a 16-digit card number + BBP/DDR), moving to an ISA/investment, "Withdrawal to <account>", "Transfer to/from <account>". This includes the user's accounts at OTHER banks not visible here (e.g. Marcus / Goldman Sachs / Saga savings) — in either direction. Internal shuffling, NOT external spend or income. When in doubt between Transfer and Income/Savings/Debt for an account-to-account move, choose Transfer. Do NOT use Transfer for payments to other people or companies — those keep their real category (Debt/Budget/etc).

Be decisive. If genuinely ambiguous, prefer Budget. Never invent categories outside the list. Never invent recurring_item_ids — only use ids exactly as provided.`

function extractJsonArray(text) {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try { const p = JSON.parse(text.slice(start, end + 1)); return Array.isArray(p) ? p : [] }
  catch { return [] }
}

export function matchRule(memo, rules) {
  const m = memo.toUpperCase()
  let best = null
  for (const r of rules) {
    if (m.includes(r.pattern.toUpperCase())) {
      if (!best || r.pattern.length > best.pattern.length) best = r
    }
  }
  return best
}

async function categoriseBatch(txs, recurringItems) {
  if (!ANTHROPIC_API_KEY) throw new Error('Missing VITE_ANTHROPIC_API_KEY in .env')
  const activeRecurring = recurringItems.filter(r => r.is_active).map(r => ({
    id: r.id, name: r.name, amount: r.amount, frequency: r.frequency, category: r.category, subcategory: r.subcategory,
  }))
  const preferred = Array.from(new Set(recurringItems
    .filter(r => r.is_active && r.subcategory && r.subcategory.trim() !== '')
    .map(r => JSON.stringify({ category: r.category, subcategory: r.subcategory })))).map(s => JSON.parse(s))

  const userBlock = JSON.stringify(txs.map(t => ({ id: t.id, memo: t.memo, amount: t.amount })), null, 2)
  const recurringBlock = activeRecurring.length
    ? `\n\nActive recurring obligations (use these ids verbatim for recurring_item_id):\n${JSON.stringify(activeRecurring, null, 2)}`
    : '\n\nNo recurring obligations to match against — return recurring_item_id: null for every transaction.'
  const preferredBlock = preferred.length
    ? `\n\nPreferred subcategory labels (use the EXACT subcategory string when a transaction fits):\n${JSON.stringify(preferred, null, 2)}`
    : ''

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 8192,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Categorise these transactions. Return ONLY a JSON array, no prose. Each element: {"id":"...","category":"...","subcategory":"...","pattern":"...","recurring_item_id":"..."|null}.\n\n${userBlock}${recurringBlock}${preferredBlock}` }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`)
  const json = await res.json()
  const text = json.content.find(b => b.type === 'text')?.text ?? ''
  const validIds = new Set(recurringItems.map(r => r.id))
  return extractJsonArray(text).filter(o => {
    if (!o || typeof o !== 'object') return false
    if (typeof o.id !== 'string' || !(CATEGORIES.includes(o.category) || o.category === 'Transfer') || typeof o.subcategory !== 'string' || typeof o.pattern !== 'string') return false
    if (o.recurring_item_id != null && !validIds.has(o.recurring_item_id)) o.recurring_item_id = null
    if (o.recurring_item_id === undefined) o.recurring_item_id = null
    return true
  })
}

async function runWithConcurrency(items, concurrency, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) { const i = cursor++; if (i >= items.length) return; await worker(items[i]) }
  })
  await Promise.all(runners)
}

// Categorise freshly-inserted transactions: rule-cache pass first, then LLM.
export async function categoriseNew(inserted) {
  const toDo = inserted.filter(t => !t.category)
  if (!toDo.length) return { cached: 0, llm: 0 }

  const [{ data: rules }, { data: recurring }] = await Promise.all([
    supabase.from('category_rules').select('*'),
    supabase.from('recurring_items').select('*'),
  ])

  let cached = 0, llm = 0
  const needsLlm = []
  const ruleUpdates = []
  for (const t of toDo) {
    const m = matchRule(t.memo, rules || [])
    if (m) { ruleUpdates.push({ id: t.id, category: m.category, subcategory: m.subcategory }); cached++ }
    else needsLlm.push(t)
  }
  for (const u of ruleUpdates) {
    await supabase.from('transactions').update({ category: u.category, subcategory: u.subcategory }).eq('id', u.id)
  }

  const batches = []
  for (let i = 0; i < needsLlm.length; i += 40) batches.push(needsLlm.slice(i, i + 40))
  await runWithConcurrency(batches, 5, async (batch) => {
    const results = await categoriseBatch(batch, recurring || [])
    for (const r of results) {
      await supabase.from('transactions')
        .update({ category: r.category, subcategory: r.subcategory, recurring_item_id: r.recurring_item_id ?? null })
        .eq('id', r.id)
      if (r.pattern && r.pattern.length >= 3) {
        await supabase.from('category_rules')
          .upsert({ pattern: r.pattern.toUpperCase().trim(), category: r.category, subcategory: r.subcategory, source: 'llm' }, { onConflict: 'pattern', ignoreDuplicates: true })
      }
    }
    llm += results.length
  })
  return { cached, llm }
}
