// Check that the Supabase schema matches what the app expects, and report
// which migration to run if anything is missing.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<anon or service key> \
//     node scripts/check-schema.mjs

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_KEY environment variables.')
  process.exit(1)
}

// Each check: [what we probe, columns, which migration provides it]
const CHECKS = [
  ['sources', 'id,name,type', 'migration.sql'],
  ['transactions', 'id,date,amount,category', 'migration.sql / 002'],
  ['recurring_items', 'id,name,amount', 'migration.sql'],
  ['account_balances', 'id,balance', 'migration.sql'],
  ['debts', 'id,current_balance', 'migration.sql'],
  ['assets', 'id,current_value', 'migration-003/004'],
  ['future_obligations', 'id,name,amount', 'migration-005.sql'],
  ['category_budgets', 'id,category,monthly_amount', 'migration-005.sql'],
  ['goals', 'id,name,goal_type,icon,color,start_date,frequency_per_week,start_value,target_value,unit,target_date,is_active,sort_order', 'migration-006.sql'],
  ['goal_entries', 'id,goal_id,date,value,note', 'migration-006.sql'],
  ['calendar_entries', 'id,title,date,entry_type,notes,recurs_annually,is_done,source', 'migration-007.sql'],
  ['coach_messages', 'id,message,context,goal_id,source,is_read', 'migration-007.sql'],
  ['goals', 'weekly_spend,weekly_units', 'migration-008.sql'],
  ['calendar_entries', 'event_time', 'migration-008.sql'],
]

let failures = 0
for (const [table, columns, migration] of CHECKS) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${columns}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (res.ok) {
    console.log(`ok      ${table} (${columns.split(',').length} cols)`)
  } else {
    failures++
    const body = await res.json().catch(() => ({}))
    console.log(`MISSING ${table} [${columns}]`)
    console.log(`        → ${body.message ?? res.statusText}`)
    console.log(`        → run supabase/${migration}`)
  }
}

// Row counts for a quick health picture
console.log('\nRow counts:')
for (const table of ['goals', 'goal_entries', 'calendar_entries', 'coach_messages']) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' },
  })
  const count = res.headers.get('content-range')?.split('/')[1] ?? '?'
  console.log(`  ${table}: ${res.ok ? count : 'n/a'}`)
}

console.log(failures === 0 ? '\nSchema is fully up to date ✔' : `\n${failures} check(s) failed — run the migrations listed above in the Supabase SQL editor.`)
process.exit(failures === 0 ? 0 : 1)
