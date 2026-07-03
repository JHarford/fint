# LifeFlow

A personal planner for running your life: goal streaks, habits, savings
targets, a calendar, personal finance, and AI coaching — in one installable
web app backed by Supabase.

## Features

- **Today** — daily check-ins: mark clean days on quit-goals (no alcohol, no
  smoking), tick off habits, log numeric targets. Tappable 7-day strip for
  backfilling missed days, and per-day notes ("work drinks — stuck to soda
  water") that feed the coach.
- **Goals** — streaks (current/best), slips, GitHub-style heatmaps, habit
  pace vs weekly target, progress charts with on-track pacing. Abstinence
  goals can track money saved and units avoided, with milestone countdowns.
- **Coach** — rule-based insights (slips, missed days, weeks falling behind,
  off-track targets, milestones) plus optional AI coaching notes via the
  Anthropic API, personalised from your actual data and notes.
- **Calendar** — month view showing which goals you achieved each day,
  alongside birthdays (yearly recurring), events with optional times,
  reminders, and tasks. "Coming up" list for the next 60 days.
- **Finance** — the original Fint dashboard: net worth, account forecasting,
  transaction categorisation, budgets, debts, and assets.
- **External pushes** — a droplet/agent can insert calendar entries, coaching
  messages, and goal check-ins straight into Supabase (see `DROPLET.md`).
- **Installable PWA** — add to your phone's home screen; app shell is cached
  by a service worker.

## Setup

1. Create a [Supabase](https://supabase.com) project and run the migrations
   in `supabase/` **in order** (`migration.sql`, then `migration-002.sql` …
   `migration-008.sql`) in the SQL editor.
2. Configure `.env`:

   ```sh
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   # Optional — enables the in-app "Coach me" button.
   # Note: this key ships in the built bundle; for anything shared,
   # generate coaching from the droplet instead (DROPLET.md).
   VITE_ANTHROPIC_API_KEY=<anthropic key>
   ```

3. Install and run:

   ```sh
   npm install
   npm run dev       # local dev
   npm run build     # production build (includes PWA service worker)
   npm run preview   # serve the production build
   ```

## Notes

- Single-user app: row level security is disabled on the tables. Don't post
  the deployed URL publicly, and keep the service key on the droplet only.
- The service worker only precaches the app shell; Supabase and Anthropic
  requests always go to the network.
- `DROPLET.md` documents the REST calls for pushing events, coaching, and
  check-ins from an external agent.

## Stack

React 19 · Vite 7 · Tailwind 4 · shadcn/ui · Supabase · Recharts ·
`@anthropic-ai/sdk` (lazy-loaded) · vite-plugin-pwa
