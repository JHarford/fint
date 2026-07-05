# Pushing updates into LifeFlow from your droplet

LifeFlow reads everything from Supabase, so anything that can make an HTTPS
request can push data into the app — no app server needed. Your droplet (or a
Claude agent running on it) writes rows to Supabase tables; the app picks them
up on next load or refetch.

## Credentials

From your Supabase project settings (Settings → API), you need:

```sh
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_KEY="<service_role key>"   # keep secret — droplet only, never in the app
```

Every request below uses the same headers:

```sh
alias sb-post='curl -sS -X POST \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation"'
```

## 1. Add calendar entries (events, birthdays, reminders)

Use case: your droplet reads your email, spots an appointment or a birthday,
and adds it to the LifeFlow calendar. Set `source` to `droplet` so the app
labels it as coming from your assistant.

```sh
sb-post "$SUPABASE_URL/rest/v1/calendar_entries" -d '{
  "title": "Dentist",
  "date": "2026-07-15",
  "event_time": "14:30",
  "entry_type": "event",
  "notes": "From email: confirmation #8841",
  "source": "droplet"
}'

# A birthday that repeats every year:
sb-post "$SUPABASE_URL/rest/v1/calendar_entries" -d '{
  "title": "Sarah'\''s birthday",
  "date": "2026-09-03",
  "entry_type": "birthday",
  "recurs_annually": true,
  "source": "droplet"
}'
```

Fields: `title` (required), `date` (required, YYYY-MM-DD), `event_time`
("HH:MM", empty = all-day), `entry_type` (`event` | `birthday` | `reminder` |
`task`), `notes`, `recurs_annually`, `is_done`, `source` (`user` | `droplet` | `ai`).

## 2. Send coaching messages

Use case: the droplet reviews your goal data on a schedule (or notices
something in your email/life) and pushes a personalised note. It appears in
the Coach card on the Today screen until dismissed.

```sh
sb-post "$SUPABASE_URL/rest/v1/coach_messages" -d '{
  "message": "You said Fridays are your danger zone for drinking — tomorrow is Friday. Plan tonight what you'\''ll order instead.",
  "context": "weekly pattern check",
  "source": "droplet"
}'
```

Fields: `message` (required), `context` (what triggered it), `goal_id`
(optional uuid to tie it to a goal), `source` (`rule` | `ai` | `droplet`).

## 3. Log goal check-ins remotely

Use case: you tell your assistant "log today as a clean day" from anywhere.
`goal_entries` upserts on `(goal_id, date)`:

```sh
# Look up the goal id once:
curl -sS "$SUPABASE_URL/rest/v1/goals?select=id,name&is_active=eq.true" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"

# Mark today done (value 1 = done/clean; 0 = slip; for target goals use the measured number):
sb-post "$SUPABASE_URL/rest/v1/goal_entries?on_conflict=goal_id,date" \
  -H "Prefer: resolution=merge-duplicates" -d '{
  "goal_id": "<uuid>",
  "date": "2026-07-02",
  "value": 1
}'
```

## 4. Generating coach messages with the Claude API on the droplet

If the droplet generates the coaching itself, gather the state first, then ask
Claude, then insert the result into `coach_messages`:

```sh
STATE=$(curl -sS "$SUPABASE_URL/rest/v1/goal_entries?select=goal_id,date,value&order=date.desc&limit=60" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY")

NOTE=$(curl -sS https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$(jq -n --arg state "$STATE" '{
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: "You are a warm, practical personal coach. Write a short note (under 120 words) based on the goal check-in data. No shaming; end with one concrete suggestion.",
    messages: [{role: "user", content: ("Recent goal entries (value 1=done, 0=slip):\n" + $state)}]
  }')" | jq -r '.content[0].text')

sb-post "$SUPABASE_URL/rest/v1/coach_messages" \
  -d "$(jq -n --arg m "$NOTE" '{message: $m, context: "scheduled droplet review", source: "ai"}')"
```

## 5. Push notifications to the phone

The app supports Web Push (migration-012): the user enables notifications on
the Input tab, which stores a subscription per device in `push_subscriptions`.
The droplet sends the actual pushes — they arrive even when the app is closed.

One-time setup:

```sh
npx web-push generate-vapid-keys
# → public key:  set as VITE_VAPID_PUBLIC_KEY in Vercel env vars + redeploy
# → private key: stays on the droplet, never in the app

cd droplet && npm install     # installs the web-push library

export VAPID_PUBLIC_KEY="<public key>"
export VAPID_PRIVATE_KEY="<private key>"
# SUPABASE_URL and SUPABASE_SERVICE_KEY as above
```

Send a push (payload keys: title, body, optional url + tag):

```sh
node droplet/send-push.mjs --title "LifeFlow" --body "3 goals waiting for today's check-in" --url /
```

Dead subscriptions (uninstalled app, revoked permission) are pruned
automatically when a send returns 404/410. Typical cron:

```cron
# morning nudge at 08:00
0 8 * * *  cd /path/to/fint && node droplet/send-push.mjs --title "Good morning" --body "Check in on today's goals" --tag checkin
```

Combine with section 4 to push the generated coach note:
write it to `coach_messages`, then send the same text with `send-push.mjs`
so it lands as a notification and is waiting in the app.

On iPhone, Web Push only works from the home-screen-installed app (iOS 16.4+),
which is how LifeFlow is normally used anyway.

## In-app AI coaching (alternative to the droplet)

The app can also generate coaching directly: set `VITE_ANTHROPIC_API_KEY` in
the app's `.env` and a "Coach me" button appears on the Today screen. Note the
key is embedded in the built app — fine for a personal deployment behind a
login, but the droplet approach keeps keys off the client entirely, so prefer
the droplet for anything shared.

## Notes

- The tables have row level security disabled (single-user app), so the
  `anon` key can also write. Still prefer the `service_role` key on the
  droplet and keep both keys out of git.
- The app doesn't subscribe to realtime changes; pushed rows show up on the
  next app load or data refresh.
