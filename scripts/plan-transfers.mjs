#!/usr/bin/env node
// Detect internal transfers (money moving between Joe's own accounts) and write
// a reviewable plan to drop/transfer-plan.json. READ-ONLY — writes no DB changes.
// Apply with scripts/apply-transfers.mjs after review.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { supabase, loadSources } from './lib/ingest.mjs'

const sources = await loadSources()
const nameOf = new Map(sources.map(s => [s.id, s.name]))
const cardIds = new Set(sources.filter(s => s.type === 'credit_card').map(s => s.id))

const tx = []
for (let f = 0; ; f += 1000) {
  const { data } = await supabase.from('transactions').select('*').order('date').range(f, f + 999)
  tx.push(...(data || [])); if (!data || data.length < 1000) break
}
const num = t => Number(t.amount)
const gbp = n => '£' + Math.round(n).toLocaleString('en-GB')
const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000)

// CONFIDENT one-sided internal-movement patterns — unambiguous by memo.
const CONFIDENT = [
  { re: /withdrawal to \d/i, why: 'Savings→current withdrawal' },
  { re: /transfer to savin/i, why: 'Transfer to savings' },
  { re: /transfer (to|from) \d{6,}/i, why: 'Transfer to/from own account' },
  { re: /\bMR J D HARFORD\b.*transfer/i, why: 'Self transfer' },
  { re: /MOBILE-CHANNEL FT/i, why: 'Internal move between own accounts' },
  // Paying a Barclaycard from the current account (DDR/BBP to a B/CARD payee,
  // or a 16-digit card number followed by the BBP/DDR bank code).
  { re: /(B\/CARD|BARCLAYCARD).*(BBP|DDR|VISA|REWARDS|PLAT)/i, why: 'Credit-card payment (from current)' },
  { re: /\d{15,16}\s*(BBP|DDR)/i, why: 'Credit-card payment (from current)' },
]
// Money INTO a credit card = the card side of an internal payment.
const isCardSide = t => cardIds.has(t.source_id) && /payment, thank you|payment by direct debit/i.test(t.memo)
// The £15k LEND/PADEL round-trips specifically (amount-guarded so real small
// padel payments to friends are NOT swept in).
const isRoundTrip = t => Math.abs(num(t)) >= 5000 && /LEND|PADEL|PADEEEEEL/i.test(t.memo)

const flagged = new Map()   // confident → auto-plan
const uncertain = new Map() // matched-pair-only → needs review
const add = (map, t, reason) => { if (!flagged.has(t.id) && !uncertain.has(t.id)) map.set(t.id, reason) }

// 1) Already tagged Transfer — formalise (no category change needed)
for (const t of tx) if (t.category === 'Transfer') add(flagged, t, 'Already tagged Transfer')

// 2) Confident patterns
for (const t of tx) {
  if (isCardSide(t)) { add(flagged, t, 'Credit-card payment (card side)'); continue }
  if (isRoundTrip(t)) { add(flagged, t, '£15k round-trip (nets to zero)'); continue }
  for (const p of CONFIDENT) if (p.re.test(t.memo)) { add(flagged, t, p.why); break }
}

// 3) UNCERTAIN — matched pair only (opposite sign, equal |amount|>=50, <=5 days),
//    not already confident, not payroll. Some may be real external payments
//    that happen to equal a transfer nearby (e.g. a bill funded by a transfer).
const isSalary = t => /salary|payroll|wages/i.test(t.memo)
const byAmt = new Map()
for (const t of tx) {
  if (Math.abs(num(t)) < 50 || isSalary(t)) continue
  const k = Math.abs(num(t)).toFixed(2)
  byAmt.set(k, [...(byAmt.get(k) || []), t])
}
for (const [, arr] of byAmt) {
  const pos = arr.filter(t => num(t) > 0), neg = arr.filter(t => num(t) < 0)
  for (const p of pos) for (const n of neg) {
    if (dayDiff(p.date, n.date) <= 5) { add(uncertain, p, 'Matched pair (review)'); add(uncertain, n, 'Matched pair (review)') }
  }
}

// Debatable — surfaced separately, NOT auto-included in the plan.
const debatableRe = /joint account sto|money owed|macbook|drone case/i
const debatable = tx.filter(t => !flagged.has(t.id) && !uncertain.has(t.id) && debatableRe.test(t.memo))

const toRow = (id, reason) => {
  const t = tx.find(x => x.id === id)
  return {
    id: t.id, date: t.date, amount: num(t), source: nameOf.get(t.source_id),
    memo: t.memo.replace(/\s+/g, ' ').trim().slice(0, 44), from_category: t.category || '(none)', reason,
  }
}
// Plan = CONFIDENT only, excluding rows already tagged Transfer (no write needed)
const planRows = [...flagged.entries()].map(([id, r]) => toRow(id, r))
  .filter(r => r.from_category !== 'Transfer').sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
const uncertainRows = [...uncertain.entries()].map(([id, r]) => toRow(id, r))
  .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))

const ROOT = fileURLToPath(new URL('..', import.meta.url))
writeFileSync(join(ROOT, 'drop', 'transfer-plan.json'), JSON.stringify({ confident: planRows, uncertain: uncertainRows }, null, 2))

const sumAbs = rows => rows.reduce((s, r) => s + Math.abs(r.amount), 0)
console.log(`\n${flagged.size} confident + ${uncertain.size} uncertain internal transfers found.`)
console.log(`Plan = ${planRows.length} confident retags (£${Math.round(sumAbs(planRows)).toLocaleString('en-GB')} gross).\n`)

const byReason = {}
for (const r of planRows) { byReason[r.reason] ??= { n: 0, v: 0 }; byReason[r.reason].n++; byReason[r.reason].v += Math.abs(r.amount) }
console.log('CONFIDENT → will retag to Transfer:')
for (const [r, v] of Object.entries(byReason).sort((a, b) => b[1].v - a[1].v)) console.log(`  ${r.padEnd(36)} ${String(v.n).padStart(3)}  ${gbp(v.v).padStart(10)}`)
console.log('\n  Largest confident items:')
for (const r of planRows.slice(0, 18)) console.log(`    ${r.date} ${(r.amount > 0 ? 'OUT' : 'IN ')} ${gbp(Math.abs(r.amount)).padStart(9)} [${r.from_category.padEnd(11)}] ${r.source?.slice(0,10).padEnd(10)} ${r.memo}`)

console.log(`\n── UNCERTAIN — matched pairs, may include REAL external payments. Your call: ──`)
for (const r of uncertainRows) console.log(`  ${r.date} ${(r.amount > 0 ? 'OUT' : 'IN ')} ${gbp(Math.abs(r.amount)).padStart(9)} [${r.from_category.padEnd(11)}] ${r.source?.slice(0,10).padEnd(10)} ${r.memo}`)

console.log(`\n── DEBATABLE (reimbursements / Charley's STO — Income? Transfer? leave?) ──`)
for (const t of debatable) console.log(`  ${t.date} IN  ${gbp(Math.abs(num(t))).padStart(9)} [${(t.category||'-').padEnd(11)}] ${t.memo.replace(/\s+/g,' ').slice(0,44)}`)

// Impact of applying CONFIDENT plan only
let inB = 0, outB = 0, inA = 0, outA = 0
const planIds = new Set(planRows.map(r => r.id))
for (const t of tx) {
  const a = num(t)
  if (a < 0) { inB += -a; if (!planIds.has(t.id)) inA += -a }
  else { outB += a; if (!planIds.has(t.id)) outA += a }
}
console.log(`\n── IMPACT of confident plan ──`)
console.log(`  money in:  ${gbp(inB)} → ${gbp(inA)}   (removes ${gbp(inB - inA)})`)
console.log(`  money out: ${gbp(outB)} → ${gbp(outA)}   (removes ${gbp(outB - outA)})`)
console.log(`\nWritten to drop/transfer-plan.json (confident + uncertain). I apply the confident set on your OK.`)
