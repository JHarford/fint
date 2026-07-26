# Data import scripts

Keep Fint's Supabase in sync with your bank statements.

## Daily workflow (the "drop folder")

1. Export the latest CSVs from online banking (Barclays "headered" format:
   `Number,Date,Account,Amount,Subcategory,Memo`).
2. Drop them into `drop/` (this folder is gitignored — it holds personal data).
3. Run:

   ```bash
   npm run import
   ```

   Every CSV in `drop/` is parsed, deduped, imported and auto-categorised, then
   moved to `drop/processed/`. Re-importing the same file is safe — rows are
   deduped by a content hash, so only genuinely new transactions are added.

The source (which account a file belongs to) is auto-detected from the CSV's
`Account` column via `ACCOUNT_TO_SOURCE` in `scripts/lib/ingest.mjs`. Add new
sort-code → source-name entries there as you add accounts.

### Importing specific files

```bash
npm run import -- ~/Downloads/data.csv                 # one file, auto-detect account
npm run import -- ~/Downloads/x.csv --source "Current" # force the source
npm run import -- ~/Downloads/x.csv --no-categorise    # skip the AI pass
```

Files passed as arguments are **not** moved (only drop-folder mode archives).

## Balances

Transaction CSVs don't carry account balances, so record those separately.
Edit `drop/balances.json` (a map of source name → balance) and run:

```bash
npm run balances
```

```json
{
  "as_of": "2026-07-25",
  "Premier BK AC": 2471.26,
  "Current": 3123.81,
  "Barclaycard Rewards": 2543.84,
  "Barclaycard Platinum Visa": 757.92,
  "Savings 1": 0.07
}
```

Type every balance as the **positive** number shown in your banking app. For
credit cards the script stores it **negative** automatically (a card balance is
money owed, so it subtracts from available cash and net worth) — it keys off the
source's type, so you never manage the sign yourself.

One snapshot per account per day; re-running the same day overwrites, so it's
safe to run daily. These snapshots feed the "Available cash / Net worth" line on
the dashboard's Cashflow & Balance chart.

## Notes

- **Sign convention:** banks use negative = money out; Fint flips this on import
  so **positive = money out, negative = money in** (matches the rest of the app).
- Categorisation uses the same rule-cache + Claude Haiku pass as the in-app CSV
  upload, so a CLI import and an in-app upload produce identical rows.
- Requires `.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
  `VITE_ANTHROPIC_API_KEY`.
