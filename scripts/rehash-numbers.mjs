// One-shot: rewrite existing transactions' `number` to the content-hash format
// so they match what new imports produce. Idempotent — running twice is safe.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...rest]) => [k, rest.join('=')])
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY

function rowHash(date, amount, memo) {
  const s = `${date}|${Number(amount).toFixed(2)}|${String(memo).trim()}`
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return `h${(h >>> 0).toString(36)}`
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?select=id,number,date,amount,memo`, {
  headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
})
const txs = await res.json()
console.log(`Re-hashing ${txs.length} transactions…`)

let changed = 0
for (const t of txs) {
  const newNum = rowHash(t.date, t.amount, t.memo)
  if (newNum === t.number) continue
  const upd = await fetch(`${SUPABASE_URL}/rest/v1/transactions?id=eq.${t.id}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ number: newNum }),
  })
  if (upd.ok) changed++
  else console.warn(`Failed ${t.id}: ${upd.status} ${await upd.text()}`)
}
console.log(`Rewrote ${changed}/${txs.length}.`)
