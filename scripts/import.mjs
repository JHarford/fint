#!/usr/bin/env node
// Import bank-statement CSVs into Supabase.
//
//   node scripts/import.mjs                     # process every CSV in ./drop
//   node scripts/import.mjs a.csv b.csv         # process specific files
//   node scripts/import.mjs a.csv --source "Current"   # force the source
//   node scripts/import.mjs --no-categorise     # skip the LLM pass
//
// Source is auto-detected from the CSV's Account column (sort code + number)
// via ACCOUNT_TO_SOURCE in scripts/lib/ingest.mjs. In drop-folder mode,
// successfully processed files are moved to ./drop/processed/.
import { readFileSync, readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseHeaderedCsv, loadSources, existingNumbers, upsertTransactions,
  categoriseNew, ACCOUNT_TO_SOURCE,
} from './lib/ingest.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DROP_DIR = join(ROOT, 'drop')
const PROCESSED_DIR = join(DROP_DIR, 'processed')

const argv = process.argv.slice(2)
const flags = { source: null, categorise: true }
const files = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--source') flags.source = argv[++i]
  else if (a === '--no-categorise') flags.categorise = false
  else files.push(a)
}

const fmt = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)

async function importFile(path, sources) {
  const text = readFileSync(path, 'utf8')
  const rows = parseHeaderedCsv(text)
  if (!rows.length) { console.log(`  ${basename(path)}: no parseable rows, skipping`); return null }

  // A Barclays export can contain SEVERAL accounts in one file. Split rows by
  // their Account column and import each group into its own source — dumping
  // everything into the first-detected source misfiles rows and, because
  // dedupe is per-source, re-importing a per-account export later would then
  // duplicate every one of them.
  const groups = new Map() // source name -> rows
  const unknownAccounts = new Set()
  if (flags.source) {
    const accounts = new Set(rows.map(r => r.account).filter(Boolean))
    if (accounts.size > 1) {
      console.log(`  ${basename(path)}: contains ${accounts.size} accounts (${[...accounts].join('; ')}) — refusing to force them all into "${flags.source}". Drop the --source flag to auto-split.`)
      return null
    }
    groups.set(flags.source, rows)
  } else {
    for (const r of rows) {
      const name = ACCOUNT_TO_SOURCE[r.account?.trim()]
      if (!name) { unknownAccounts.add(r.account || '(blank)'); continue }
      const arr = groups.get(name) ?? []
      arr.push(r)
      groups.set(name, arr)
    }
    if (unknownAccounts.size) {
      console.log(`  ${basename(path)}: skipping rows for unknown account(s) ${[...unknownAccounts].join('; ')} — add them to ACCOUNT_TO_SOURCE or pass --source.`)
    }
    if (!groups.size) return null
  }

  const results = []
  for (const [sourceName, groupRows] of groups) {
    const source = sources.find(s => s.name.toLowerCase() === sourceName.toLowerCase())
    if (!source) { console.log(`  ${basename(path)}: no source named "${sourceName}". Skipping that group.`); continue }

    const existing = await existingNumbers(source.id)
    const fresh = groupRows.filter(r => !existing.has(r.number))
    const dates = fresh.map(r => r.date).sort()
    console.log(`  ${basename(path)} → ${source.name}: ${groupRows.length} rows, ${fresh.length} new` +
      (fresh.length ? ` (${dates[0]} → ${dates[dates.length - 1]})` : ''))

    if (!fresh.length) { results.push({ source: source.name, inserted: 0, cached: 0, llm: 0 }); continue }

    const inserted = await upsertTransactions(source.id, fresh)
    let cat = { cached: 0, llm: 0 }
    if (flags.categorise && inserted.length) {
      process.stdout.write(`    categorising ${inserted.length}…`)
      cat = await categoriseNew(inserted)
      console.log(` ${cat.cached} from cache, ${cat.llm} via AI`)
    }
    results.push({ source: source.name, inserted: inserted.length, ...cat })
  }
  return results.length ? results : null
}

async function main() {
  const sources = await loadSources()

  let targets = files
  let dropMode = false
  if (!targets.length) {
    dropMode = true
    if (!existsSync(DROP_DIR)) { console.log(`No files given and ${DROP_DIR} does not exist.`); return }
    targets = readdirSync(DROP_DIR).filter(f => f.toLowerCase().endsWith('.csv')).map(f => join(DROP_DIR, f))
    if (!targets.length) { console.log(`No CSVs in ${DROP_DIR}.`); return }
    console.log(`Scanning drop folder: ${targets.length} CSV(s)`)
  }

  const summary = []
  for (const t of targets) {
    const res = await importFile(t, sources)
    if (res) {
      summary.push(...res)
      if (dropMode) {
        mkdirSync(PROCESSED_DIR, { recursive: true })
        renameSync(t, join(PROCESSED_DIR, basename(t)))
      }
    }
  }

  console.log('\n── Summary ──')
  let totalNew = 0
  for (const s of summary) { console.log(`  ${s.source}: +${s.inserted} new`); totalNew += s.inserted }
  console.log(`  Total: ${totalNew} new transactions imported`)
  if (dropMode && summary.length) console.log(`  Processed files moved to drop/processed/`)
}

main().catch(e => { console.error('\nImport failed:', e.message); process.exit(1) })
