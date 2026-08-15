#!/usr/bin/env node
// Data doctor: find out why the monthly numbers look wrong.
//
//   npm run doctor              # audit only — prints findings, changes nothing
//   npm run doctor -- --fix     # apply the high-confidence repairs it proposes
//
// Checks, in order:
//   1. Misfiled rows — a row whose Account column belongs to a different source
//      (the multi-account-CSV import bug). Fix: move, or delete if the correct
//      source already has that row.
//   2. Re-import duplicates — same (date, amount, memo) twice in one source,
//      once under an old bank row-number and once under a content hash.
//      Fix: delete the old-numbered copy.
//   3. Internal transfers counted as spend/income — card repayments, moves to
//      savings/Marcus, matched +/− pairs across sources. Fix: retag the
//      unambiguous ones as Transfer.
//   4. Poisoned category rules that keep re-applying a wrong category.
//   5. A month-by-month before/after table so you can see what the real
//      income/spend numbers become once the noise is stripped.
import { supabase, ACCOUNT_TO_SOURCE } from './lib/ingest.mjs'

const FIX = process.argv.includes('--fix')
const gbp = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)

// Memo patterns that are almost certainly the user's own-account moves.
const CARD_PAYMENT_RE = /(PAYMENT.{0,20}THANK\s*YOU)|(B\/?CARD.{0,30}(DDR|BBP))|(BARCLAYCARD.{0,30}(DDR|BBP|PYMT|PAYMENT))/i
const TRANSFERISH_RE = /MARCUS|GOLDMAN|\bSAGA\b|\bISA\b|WITHDRAWAL TO|TRANSFER (TO|FROM)|\bSAVINGS?\b/i

async function loadAll(table, order = 'id') {
  const pageSize = 1000
  const all = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select('*')
      .order(order, { ascending: true }).range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    all.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return all
}

function monthOf(dateStr) { return dateStr.slice(0, 7) }

const [transactions, sources, rules] = await Promise.all([
  loadAll('transactions'), loadAll('sources'), loadAll('category_rules').catch(() => []),
])
const sourceById = new Map(sources.map(s => [s.id, s]))
const sourceIdByName = new Map(sources.map(s => [s.name.toLowerCase(), s.id]))

console.log(`\n═══ LifeFlow data doctor ${FIX ? '(FIX MODE)' : '(audit only — run with --fix to repair)'} ═══`)
console.log(`\n${transactions.length} transactions across ${sources.length} sources:`)
for (const s of sources) {
  const rows = transactions.filter(t => t.source_id === s.id)
  if (!rows.length) { console.log(`  ${s.name}: 0 rows`); continue }
  const dates = rows.map(r => r.date).sort()
  console.log(`  ${s.name}: ${rows.length} rows, ${dates[0]} → ${dates[dates.length - 1]}`)
}

// Rows the proposed fixes would remove from spend/income maths
const dropIds = new Set()      // deleted rows
const retagIds = new Set()     // rows that become Transfer

// ── 1. Misfiled rows ─────────────────────────────────────────────────────────
console.log('\n── 1. Rows filed under the wrong source (multi-account CSV import bug)')
const misfiled = []
for (const t of transactions) {
  const rightName = ACCOUNT_TO_SOURCE[t.account?.trim()]
  if (!rightName) continue // account string we don't map (cards etc.) — can't judge
  const rightId = sourceIdByName.get(rightName.toLowerCase())
  if (rightId && t.source_id !== rightId) misfiled.push({ t, rightName, rightId })
}
if (!misfiled.length) console.log('  none found ✓')
else {
  const bySrc = new Map()
  for (const m of misfiled) {
    const key = `${sourceById.get(m.t.source_id)?.name ?? '?'} → should be ${m.rightName}`
    bySrc.set(key, (bySrc.get(key) ?? 0) + 1)
  }
  for (const [k, n] of bySrc) console.log(`  ${n} rows: ${k}`)
  const numbersBySource = new Map()
  for (const t of transactions) {
    const set = numbersBySource.get(t.source_id) ?? new Set()
    set.add(t.number); numbersBySource.set(t.source_id, set)
  }
  for (const m of misfiled) {
    const existsInRight = numbersBySource.get(m.rightId)?.has(m.t.number)
    if (existsInRight) {
      dropIds.add(m.t.id)
      if (FIX) await supabase.from('transactions').delete().eq('id', m.t.id)
    } else if (FIX) {
      await supabase.from('transactions').update({ source_id: m.rightId }).eq('id', m.t.id)
    }
  }
  const dupCount = [...misfiled].filter(m => dropIds.has(m.t.id)).length
  console.log(`  → ${dupCount} are duplicates of rows already in the right source (${FIX ? 'deleted' : 'would delete'})`)
  console.log(`  → ${misfiled.length - dupCount} would move to their correct source (${FIX ? 'moved' : 'run --fix to move'})`)
}

// ── 2. Re-import duplicates within a source ─────────────────────────────────
console.log('\n── 2. Same transaction imported twice in one source (old row-number + new content-hash)')
const byContent = new Map()
for (const t of transactions) {
  if (dropIds.has(t.id)) continue
  const key = `${t.source_id}|${t.date}|${Number(t.amount).toFixed(2)}|${(t.memo || '').trim()}`
  const arr = byContent.get(key) ?? []
  arr.push(t); byContent.set(key, arr)
}
let reimportDupes = 0, ambiguousDupes = 0, dupeValue = 0
for (const arr of byContent.values()) {
  if (arr.length < 2) continue
  const hashed = arr.filter(t => /^h[0-9a-z]+$/.test(t.number || ''))
  const banky = arr.filter(t => !/^h[0-9a-z]+$/.test(t.number || ''))
  if (hashed.length && banky.length) {
    // clearly the same statement imported under both numbering schemes — keep the hashed copy
    for (const t of banky) {
      reimportDupes++; dupeValue += Math.max(0, Number(t.amount)); dropIds.add(t.id)
      if (FIX) await supabase.from('transactions').delete().eq('id', t.id)
    }
  } else {
    ambiguousDupes += arr.length - 1 // could be two genuine identical purchases — flag only
  }
}
console.log(reimportDupes
  ? `  ${reimportDupes} duplicate rows (${gbp(dupeValue)} of phantom spend) ${FIX ? 'deleted ✓' : '— run --fix to delete'}`
  : '  no re-import duplicates ✓')
if (ambiguousDupes) console.log(`  ${ambiguousDupes} same-day identical rows left alone (could be genuine repeat purchases — check them in the Transactions tab)`)

// ── 3. Internal transfers counted as spend/income ────────────────────────────
console.log('\n── 3. Own-account moves not tagged Transfer (these inflate income AND spend)')
const live = transactions.filter(t => !dropIds.has(t.id))

// 3a. unambiguous card-payment memos
const cardPay = live.filter(t => t.category !== 'Transfer' && CARD_PAYMENT_RE.test(t.memo || ''))
let cardPayOut = 0
for (const t of cardPay) { if (t.amount > 0) cardPayOut += Number(t.amount); retagIds.add(t.id) }
console.log(cardPay.length
  ? `  3a. ${cardPay.length} credit-card repayment rows tagged as ${[...new Set(cardPay.map(t => t.category || '(none)'))].join('/')} — ${gbp(cardPayOut)} of fake "spend" ${FIX ? '→ retagged Transfer ✓' : ''}`
  : '  3a. no mis-tagged card repayments ✓')

// 3b. equal-and-opposite pairs across different sources within 3 days
const candidates = live.filter(t => Math.abs(t.amount) >= 50 && !retagIds.has(t.id))
const byAbs = new Map()
for (const t of candidates) {
  const key = Math.abs(Number(t.amount)).toFixed(2)
  const arr = byAbs.get(key) ?? []
  arr.push(t); byAbs.set(key, arr)
}
const paired = new Set()
const pairs = []
for (const arr of byAbs.values()) {
  const outs = arr.filter(t => t.amount > 0).sort((a, b) => a.date.localeCompare(b.date))
  const ins = arr.filter(t => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date))
  for (const o of outs) {
    if (paired.has(o.id)) continue
    const match = ins.find(i => !paired.has(i.id) && i.source_id !== o.source_id
      && Math.abs((new Date(i.date) - new Date(o.date)) / 86400000) <= 3)
    if (match) {
      paired.add(o.id); paired.add(match.id)
      if (o.category !== 'Transfer' || match.category !== 'Transfer') pairs.push([o, match])
    }
  }
}
let pairOut = 0
for (const [o, m] of pairs) {
  if (o.category !== 'Transfer') { retagIds.add(o.id); pairOut += Number(o.amount) }
  if (m.category !== 'Transfer') retagIds.add(m.id)
}
console.log(pairs.length
  ? `  3b. ${pairs.length} matched +/− pairs across accounts not tagged Transfer — ${gbp(pairOut)} of fake "spend" ${FIX ? '→ retagged Transfer ✓' : ''}`
  : '  3b. no untagged cross-account pairs ✓')
for (const [o, m] of pairs.slice(0, 12)) {
  console.log(`      ${o.date} ${gbp(o.amount)} "${(o.memo || '').slice(0, 40)}" [${o.category || '?'} @ ${sourceById.get(o.source_id)?.name}] ↔ [${m.category || '?'} @ ${sourceById.get(m.source_id)?.name}]`)
}
if (pairs.length > 12) console.log(`      … and ${pairs.length - 12} more`)

// 3c. transfer-ish memos with only one visible leg (Marcus etc.) — flag, don't auto-fix
const oneLegged = live.filter(t => !retagIds.has(t.id) && t.category !== 'Transfer'
  && TRANSFERISH_RE.test(t.memo || '') && Math.abs(t.amount) >= 100)
if (oneLegged.length) {
  const out = oneLegged.filter(t => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0)
  const inn = oneLegged.filter(t => t.amount < 0).reduce((s, t) => s - Number(t.amount), 0)
  console.log(`  3c. ${oneLegged.length} rows with transfer-looking memos NOT auto-fixed (one leg only — verify by eye): ${gbp(out)} counted as spend, ${gbp(inn)} counted as income`)
  for (const t of oneLegged.slice(0, 12)) {
    console.log(`      ${t.date} ${gbp(t.amount)} "${(t.memo || '').slice(0, 48)}" [${t.category || '(none)'} @ ${sourceById.get(t.source_id)?.name}]`)
  }
  if (oneLegged.length > 12) console.log(`      … and ${oneLegged.length - 12} more`)
  console.log('      → retag the real ones to Transfer in the Transactions tab (or add them to --fix by memo pattern)')
} else console.log('  3c. no suspicious one-legged transfer memos ✓')

if (FIX && retagIds.size) {
  const ids = [...retagIds]
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from('transactions')
      .update({ category: 'Transfer', recurring_item_id: null })
      .in('id', ids.slice(i, i + 100))
    if (error) throw new Error(`retag failed: ${error.message}`)
  }
}

// ── 4. Poisoned category rules ───────────────────────────────────────────────
console.log('\n── 4. Cached category rules that keep re-applying wrong categories')
const badRules = rules.filter(r => r.category !== 'Transfer'
  && (CARD_PAYMENT_RE.test(r.pattern) || /MARCUS|GOLDMAN|BARCLAYCARD|B\/?CARD/i.test(r.pattern)))
if (!badRules.length) console.log('  none found ✓')
for (const r of badRules) {
  console.log(`  "${r.pattern}" → ${r.category}${FIX ? '  (retagged to Transfer ✓)' : '  (would retag to Transfer)'}`)
  if (FIX) await supabase.from('category_rules').update({ category: 'Transfer' }).eq('id', r.id)
}

// ── 5. Month-by-month: before vs after ───────────────────────────────────────
console.log('\n── 5. Monthly income / spend — as shown today vs after the fixes above')
const months = [...new Set(transactions.map(t => monthOf(t.date)))].sort().slice(-6)
console.log('  month     |      income → fixed |       spend → fixed')
for (const m of months) {
  let inc = 0, sp = 0, incF = 0, spF = 0
  for (const t of transactions) {
    if (monthOf(t.date) !== m || t.category === 'Transfer') continue
    const a = Number(t.amount)
    if (a < 0) inc -= a; else sp += a
    if (dropIds.has(t.id) || retagIds.has(t.id)) continue
    if (a < 0) incF -= a; else spF += a
  }
  const flag = spF !== sp || incF !== inc ? '  ←' : ''
  console.log(`  ${m}   | ${gbp(inc).padStart(9)} → ${gbp(incF).padStart(8)} | ${gbp(sp).padStart(9)} → ${gbp(spF).padStart(8)}${flag}`)
}
console.log('  ("fixed" still includes 3c one-legged rows — retag those by hand and the spend drops further)')

// ── 6. Biggest spend rows, last 2 months — eyeball check ────────────────────
console.log('\n── 6. Largest spend rows in the last 2 months (after fixes) — do these look real?')
const cutoff = months.slice(-2)[0] ?? '0000-00'
const big = transactions
  .filter(t => monthOf(t.date) >= cutoff && t.amount > 0 && t.category !== 'Transfer' && !dropIds.has(t.id) && !retagIds.has(t.id))
  .sort((a, b) => b.amount - a.amount).slice(0, 12)
for (const t of big) {
  console.log(`  ${t.date} ${gbp(t.amount).padStart(8)}  ${(t.memo || '(no memo)').slice(0, 44).padEnd(44)} [${t.category || '(none)'} @ ${sourceById.get(t.source_id)?.name}]`)
}

console.log(FIX
  ? '\nDone. Refresh the app — the dashboard reads live data. Re-run `npm run doctor` to confirm everything is clean.\n'
  : '\nNothing was changed. Re-run with `npm run doctor -- --fix` to apply the repairs marked above.\n')
