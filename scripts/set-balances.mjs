#!/usr/bin/env node
// Record point-in-time balance snapshots into account_balances.
//
//   node scripts/set-balances.mjs               # reads ./drop/balances.json
//   node scripts/set-balances.mjs path.json     # reads a specific file
//   node scripts/set-balances.mjs --date 2026-07-25
//
// balances.json shape — a map of source NAME → balance, plus optional as_of:
//   { "as_of": "2026-07-25",
//     "Premier BK AC": 2471.26, "Current": 3123.81, "Savings 1": 0.07,
//     "Barclaycard Rewards": 2543.84, "Barclaycard Platinum Visa": 757.92 }
//
// One snapshot per source per day: re-running the same day overwrites, so it's
// safe to run daily. Credit-card balances are stored as the amount owed
// (positive), matching how the app already holds them.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { supabase, loadSources } from './lib/ingest.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const argv = process.argv.slice(2)
let dateArg = null
let file = join(ROOT, 'drop', 'balances.json')
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--date') dateArg = argv[++i]
  else file = argv[i]
}

const raw = JSON.parse(readFileSync(file, 'utf8'))
const asOf = dateArg || raw.as_of || new Date().toISOString().split('T')[0]

const sources = await loadSources()
const byName = new Map(sources.map(s => [s.name.toLowerCase(), s]))

const rows = []
const misses = []
for (const [name, balance] of Object.entries(raw)) {
  if (name === 'as_of') continue
  const s = byName.get(name.toLowerCase())
  if (!s) { misses.push(name); continue }
  // Credit-card balances are money OWED — stored negative so they subtract from
  // available cash / net worth. Type the amount as a positive number in
  // balances.json; the sign is applied here from the source type.
  const signed = s.type === 'credit_card' ? -Math.abs(balance) : balance
  rows.push({ source_id: s.id, balance: signed, as_of_date: asOf })
}

if (misses.length) console.log(`⚠ no source named: ${misses.join(', ')}`)
if (!rows.length) { console.log('Nothing to update.'); process.exit(0) }

// Overwrite any existing snapshot for the same source+date, then insert.
for (const r of rows) {
  await supabase.from('account_balances').delete().eq('source_id', r.source_id).eq('as_of_date', r.as_of_date)
}
const { error } = await supabase.from('account_balances').insert(rows)
if (error) { console.error('Failed:', error.message); process.exit(1) }

const fmt = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)
console.log(`Recorded ${rows.length} balance snapshot(s) as of ${asOf}:`)
for (const r of rows) {
  const s = sources.find(x => x.id === r.source_id)
  console.log(`  ${s.name}: ${fmt(r.balance)}`)
}
