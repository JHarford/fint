// One-shot backfill: link already-imported transactions to recurring items via LLM.
// Reads VITE_ANTHROPIC_API_KEY from .env. Safe to re-run — only targets rows
// where recurring_item_id is null.

import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...rest]) => [k, rest.join('=')])
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_KEY = env.VITE_ANTHROPIC_API_KEY

if (!ANTHROPIC_KEY) {
  console.error('Missing VITE_ANTHROPIC_API_KEY in .env')
  process.exit(1)
}

const sb = (path, init = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: {
    apikey: SUPABASE_KEY,
    authorization: `Bearer ${SUPABASE_KEY}`,
    'content-type': 'application/json',
    ...(init.headers ?? {}),
  },
})

const [txsRes, recRes] = await Promise.all([
  sb('transactions?select=id,memo,amount,category,subcategory,recurring_item_id&recurring_item_id=is.null'),
  sb('recurring_items?select=id,name,amount,frequency,category,is_active&is_active=eq.true'),
])
const txs = await txsRes.json()
const recurring = await recRes.json()

if (txs.length === 0) {
  console.log('Nothing to backfill — all transactions are already linked or there are none.')
  process.exit(0)
}

console.log(`Linking ${txs.length} transactions against ${recurring.length} active recurring items…`)

const SYSTEM = `You link UK personal-finance transactions to recurring obligations.
For each transaction return: {id, recurring_item_id, category, subcategory}.
- recurring_item_id: id of the matching recurring obligation, or null. Match by merchant name + roughly matching amount (within ~15%). Salary, one-offs, irregular spend = null. Never invent ids.
- category: ONE of [Income, Tax, Housing, Debt, Utilities, Insurance, Savings, Subscriptions, Health, Budget, Business, Transport, Education]. Preserve the existing category from the input unless it is clearly wrong.
- subcategory: short, specific label (1-3 words). Preserve existing unless empty.`

const userBlock = JSON.stringify(txs.map(t => ({
  id: t.id, memo: t.memo, amount: t.amount,
  current_category: t.category, current_subcategory: t.subcategory,
})), null, 2)

const recurringBlock = JSON.stringify(recurring.map(r => ({
  id: r.id, name: r.name, amount: r.amount, frequency: r.frequency, category: r.category,
})), null, 2)

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Link these transactions. Return ONLY a JSON array.\n\nTransactions:\n${userBlock}\n\nActive recurring obligations:\n${recurringBlock}`,
    }],
  }),
})

if (!res.ok) {
  console.error(`Anthropic error ${res.status}: ${await res.text()}`)
  process.exit(1)
}

const json = await res.json()
const text = json.content.find(b => b.type === 'text')?.text ?? ''
const start = text.indexOf('[')
const end = text.lastIndexOf(']')
const parsed = JSON.parse(text.slice(start, end + 1))

const validIds = new Set(recurring.map(r => r.id))
let linked = 0, updated = 0
for (const r of parsed) {
  if (typeof r.id !== 'string') continue
  const patch = {}
  if (r.recurring_item_id && validIds.has(r.recurring_item_id)) {
    patch.recurring_item_id = r.recurring_item_id
    linked++
  }
  if (r.category) patch.category = r.category
  if (r.subcategory) patch.subcategory = r.subcategory
  if (Object.keys(patch).length === 0) continue
  const upd = await sb(`transactions?id=eq.${r.id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (!upd.ok) {
    console.warn(`Failed to update ${r.id}: ${upd.status}`)
    continue
  }
  updated++
}

console.log(`Updated ${updated}/${parsed.length}, linked ${linked} to recurring items.`)
