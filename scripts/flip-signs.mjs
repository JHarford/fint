// One-shot: flip the sign on existing transactions so they match Fint's
// internal convention (positive = expense, negative = income). Idempotent
// per-row guard: only flips rows whose absolute value we haven't already moved.
//
// Use this ONCE after importing pre-fix data, then delete.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...rest]) => [k, rest.join('=')])
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY

const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?select=id,amount`, {
  headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
})
const txs = await res.json()
console.log(`Flipping ${txs.length} transactions…`)

let flipped = 0
for (const t of txs) {
  const upd = await fetch(`${SUPABASE_URL}/rest/v1/transactions?id=eq.${t.id}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ amount: -t.amount }),
  })
  if (upd.ok) flipped++
  else console.warn(`Failed ${t.id}: ${upd.status}`)
}
console.log(`Flipped ${flipped}/${txs.length}.`)
