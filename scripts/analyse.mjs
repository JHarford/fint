#!/usr/bin/env node
// Monthly surplus/deficit analysis: is the money pot growing or shrinking,
// and where is it heading?
//
//   npm run analyse
//
// Reads live data (needs .env). Prints:
//   - data-freshness warnings (a stale card source hides recent spend)
//   - per-month income / spend / net / cumulative net
//   - committed vs discretionary split of spend
//   - trend over the last 3 full months
//   - 6-month projection under three scenarios
import { supabase } from './lib/ingest.mjs'

const gbp = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
const pad = (s, n) => String(s).padStart(n)

// Categories that are commitments (bills you can't easily skip) vs lifestyle.
const COMMITTED = new Set(['Tax', 'Housing', 'Debt', 'Utilities', 'Insurance', 'Subscriptions', 'Education'])

async function loadAll(table) {
  const pageSize = 1000
  const all = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select('*')
      .order('id', { ascending: true }).range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    all.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return all
}

const [transactions, sources, balances] = await Promise.all([
  loadAll('transactions'), loadAll('sources'), loadAll('account_balances').catch(() => []),
])

const today = new Date().toISOString().slice(0, 10)
const thisMonth = today.slice(0, 7)

// ── freshness ────────────────────────────────────────────────────────────────
console.log('\n═══ Fint monthly analysis ═══\n')
let staleWarning = false
for (const s of sources) {
  const rows = transactions.filter(t => t.source_id === s.id)
  if (!rows.length) continue
  const last = rows.map(r => r.date).sort().at(-1)
  const ageDays = Math.round((new Date(today) - new Date(last)) / 86400000)
  if (ageDays > 21) {
    console.log(`⚠ ${s.name}: newest transaction is ${last} (${ageDays} days old) — spend since then is INVISIBLE to this analysis. Import a fresh statement.`)
    staleWarning = true
  }
}
if (staleWarning) console.log('')

// ── monthly aggregates (Transfer + Payout excluded, accrual-adjusted) ────────
// Transfer = internal shuffling; Payout = one-off non-operating cash-in
// (insurance settlements, windfalls) — real cash, but not income or spend.
// accrual_date, when set, recognises a row in the month it was earned rather
// than its bank date (e.g. salary runs that drifted across month boundaries),
// so each month shows one month's pay.
const byMonth = new Map()
for (const t of transactions) {
  if (t.category === 'Transfer' || t.category === 'Payout') continue
  const m = (t.accrual_date ?? t.date).slice(0, 7)
  const e = byMonth.get(m) ?? { income: 0, spend: 0, committed: 0, discretionary: 0 }
  const a = Number(t.amount)
  if (a < 0) e.income -= a
  else {
    e.spend += a
    if (COMMITTED.has(t.category)) e.committed += a
    else e.discretionary += a
  }
  byMonth.set(m, e)
}
const months = [...byMonth.keys()].sort()
const fullMonths = months.filter(m => m < thisMonth)

console.log('month     |    income |     spend |       net | cumulative   (spend = committed + lifestyle)')
let cum = 0
for (const m of months) {
  const e = byMonth.get(m)
  const net = e.income - e.spend
  cum += net
  const partial = m === thisMonth ? '  ← month in progress' : ''
  console.log(`${m}   | ${pad(gbp(e.income), 9)} | ${pad(gbp(e.spend), 9)} | ${pad((net >= 0 ? '+' : '') + gbp(net), 9)} | ${pad((cum >= 0 ? '+' : '') + gbp(cum), 10)}   (${gbp(e.committed)} + ${gbp(e.discretionary)})${partial}`)
}

// ── trend ────────────────────────────────────────────────────────────────────
const last3 = fullMonths.slice(-3)
const nets = fullMonths.map(m => byMonth.get(m).income - byMonth.get(m).spend)
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1)

if (last3.length >= 2) {
  const r3 = last3.map(m => byMonth.get(m))
  const avgNet3 = avg(r3.map(e => e.income - e.spend))
  const avgIncome3 = avg(r3.map(e => e.income))
  const avgSpend3 = avg(r3.map(e => e.spend))
  console.log(`\n── Recent trend (${last3.join(', ')})`)
  console.log(`  average income ${gbp(avgIncome3)}/mo, average spend ${gbp(avgSpend3)}/mo`)
  console.log(`  → running at ${avgNet3 >= 0 ? 'a SURPLUS of ' : 'a DEFICIT of '}${gbp(Math.abs(avgNet3))}/month`)

  const incomes = fullMonths.map(m => byMonth.get(m).income)
  const spread = Math.max(...incomes) - Math.min(...incomes)
  if (spread > median(incomes) * 0.8) {
    console.log(`  note: income is lumpy (${gbp(Math.min(...incomes))} to ${gbp(Math.max(...incomes))}/mo) — the big months are doing the heavy lifting.`)
  }
}

// ── cash on hand ─────────────────────────────────────────────────────────────
let cashNow = null
if (balances.length) {
  const latestBySource = new Map()
  for (const b of balances) {
    const cur = latestBySource.get(b.source_id)
    if (!cur || b.as_of_date > cur.as_of_date) latestBySource.set(b.source_id, b)
  }
  cashNow = [...latestBySource.values()].reduce((s, b) => s + Number(b.balance), 0)
  const asOf = [...latestBySource.values()].map(b => b.as_of_date).sort().at(-1)
  console.log(`\n── Cash position\n  latest recorded balances sum to ${gbp(cashNow)} (as of ${asOf})`)
}

// ── projection ───────────────────────────────────────────────────────────────
if (fullMonths.length >= 3) {
  const window = fullMonths.slice(-6)
  const wIncomes = window.map(m => byMonth.get(m).income)
  const wSpends = window.map(m => byMonth.get(m).spend)
  const commit3 = avg(last3.map(m => byMonth.get(m).committed))

  const scenarios = [
    { name: 'If the last 3 months repeat  ', net: avg(last3.map(m => byMonth.get(m).income)) - avg(last3.map(m => byMonth.get(m).spend)) },
    { name: 'Typical month (6-mo medians) ', net: median(wIncomes) - median(wSpends) },
    { name: 'Belt-tightened (median income, bills + half lifestyle)', net: median(wIncomes) - commit3 - avg(last3.map(m => byMonth.get(m).discretionary)) / 2 },
  ]
  console.log('\n── Next 6 months, three ways')
  for (const s of scenarios) {
    const runway = cashNow != null && s.net < 0 ? `  (cash lasts ~${Math.floor(cashNow / -s.net)} months)` : ''
    console.log(`  ${s.name}: ${s.net >= 0 ? '+' : ''}${gbp(s.net)}/mo → ${s.net >= 0 ? '+' : ''}${gbp(s.net * 6)} over 6 months${runway}`)
  }
  console.log(`\n  committed bills are running at ${gbp(commit3)}/month — that's the floor your income has to clear before any lifestyle spend.`)
}
console.log('')
