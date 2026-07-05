#!/usr/bin/env node
// Send a Web Push notification to every device subscribed in LifeFlow.
//
// Setup (once):   cd droplet && npm install
// Usage:          node send-push.mjs --title "LifeFlow" --body "3 goals waiting" [--url /] [--tag checkin]
//
// Required env vars:
//   SUPABASE_URL          https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_KEY  service_role key (droplet only, never in the app)
//   VAPID_PUBLIC_KEY      from `npx web-push generate-vapid-keys`
//   VAPID_PRIVATE_KEY     same pair — private half stays on the droplet
//   VAPID_SUBJECT         optional, defaults to mailto:joe@harford.dev

import webpush from 'web-push'

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY })) {
  if (!v) { console.error(`Missing env var ${k}`); process.exit(1) }
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:joe@harford.dev', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map(s => { const i = s.indexOf(' '); return [s.slice(0, i), s.slice(i + 1).trim()] }),
)
if (!args.title || !args.body) {
  console.error('Usage: node send-push.mjs --title "..." --body "..." [--url /] [--tag checkin]')
  process.exit(1)
}
const payload = JSON.stringify({ title: args.title, body: args.body, url: args.url || '/', tag: args.tag || 'lifeflow' })

const headers = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`, { headers })
if (!res.ok) { console.error('Failed to read subscriptions:', res.status, await res.text()); process.exit(1) }
const subs = await res.json()
if (subs.length === 0) { console.log('No subscribed devices.'); process.exit(0) }

let sent = 0, pruned = 0
for (const s of subs) {
  try {
    await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload,
    )
    sent++
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      // Subscription is gone (app uninstalled / permission revoked) — prune it
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
        method: 'DELETE', headers,
      })
      pruned++
    } else {
      console.error('Send failed:', e.statusCode ?? '', e.body ?? e.message)
    }
  }
}
console.log(`Sent to ${sent}/${subs.length} device(s)${pruned ? `, pruned ${pruned} dead subscription(s)` : ''}.`)
