#!/usr/bin/env node
// Apply the transfer retag plan (drop/transfer-plan.json) — sets category='Transfer'
// on the CONFIDENT rows. Records a reversible undo log to drop/transfer-undo.json.
//
//   node scripts/apply-transfers.mjs                 # apply confident set
//   node scripts/apply-transfers.mjs --include-uncertain
//   node scripts/apply-transfers.mjs --undo          # revert from undo log
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { supabase } from './lib/ingest.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const planPath = join(ROOT, 'drop', 'transfer-plan.json')
const undoPath = join(ROOT, 'drop', 'transfer-undo.json')
const argv = process.argv.slice(2)

if (argv.includes('--undo')) {
  if (!existsSync(undoPath)) { console.log('No undo log found.'); process.exit(0) }
  const undo = JSON.parse(readFileSync(undoPath, 'utf8'))
  for (const u of undo) await supabase.from('transactions').update({ category: u.from_category === '(none)' ? '' : u.from_category }).eq('id', u.id)
  console.log(`Reverted ${undo.length} transactions to their previous categories.`)
  process.exit(0)
}

const plan = JSON.parse(readFileSync(planPath, 'utf8'))
const rows = [...plan.confident, ...(argv.includes('--include-uncertain') ? plan.uncertain : [])]
if (!rows.length) { console.log('Nothing to apply.'); process.exit(0) }

writeFileSync(undoPath, JSON.stringify(rows.map(r => ({ id: r.id, from_category: r.from_category })), null, 2))

let done = 0
for (const r of rows) {
  const { error } = await supabase.from('transactions').update({ category: 'Transfer' }).eq('id', r.id)
  if (error) { console.error(`  failed ${r.id}: ${error.message}`); continue }
  done++
}
console.log(`Retagged ${done}/${rows.length} transactions → Transfer.`)
console.log(`Undo log written to drop/transfer-undo.json (run with --undo to revert).`)
