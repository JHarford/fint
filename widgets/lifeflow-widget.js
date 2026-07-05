// LifeFlow home-screen widget for iOS, via the Scriptable app.
//
// PWAs can't provide native iOS widgets, but Scriptable (free, App Store)
// runs JavaScript and renders real home-screen widgets. This script reads
// your Supabase directly (anon key — same one baked into the app) and shows
// current streaks + what's on today.
//
// Setup:
//   1. Install "Scriptable" from the App Store.
//   2. New script → paste this file → fill in SUPABASE_URL + ANON_KEY.
//   3. Long-press home screen → add a Scriptable widget (medium) →
//      choose this script. It refreshes roughly every 15–30 min (iOS decides).
//   4. Optional: set the widget's "When Interacting" to open your LifeFlow URL.

const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co'
const ANON_KEY = 'YOUR-ANON-KEY'
const APP_URL = 'https://YOUR-LIFEFLOW.vercel.app'

// Anthropic-ish palette to match the app
const BG = new Color('#faf9f5')
const INK = new Color('#3d3929')
const MUTED = new Color('#83827d')
const ACCENT = new Color('#c96442')

async function sb(path) {
  const req = new Request(`${SUPABASE_URL}/rest/v1/${path}`)
  req.headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
  return await req.loadJSON()
}

function dateKey(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Streak of consecutive days with value > 0, counting back from today/yesterday
function currentStreak(entries) {
  const ok = new Set(entries.filter(e => e.value > 0).map(e => e.date))
  const bad = new Set(entries.filter(e => e.value <= 0).map(e => e.date))
  let streak = 0
  const d = new Date()
  if (!ok.has(dateKey(d)) && !bad.has(dateKey(d))) d.setDate(d.getDate() - 1) // today not logged yet
  while (ok.has(dateKey(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

const today = dateKey(new Date())
const [goals, entries, events] = await Promise.all([
  sb('goals?is_active=eq.true&select=id,name,icon,goal_type&order=sort_order'),
  sb('goal_entries?select=goal_id,date,value&order=date.desc&limit=800'),
  sb(`calendar_entries?select=title,event_time,date,end_date&or=(date.eq.${today},and(date.lte.${today},end_date.gte.${today}))&order=event_time`),
])

const w = new ListWidget()
w.backgroundColor = BG
w.setPadding(14, 16, 14, 16)
w.url = APP_URL

const header = w.addText('LifeFlow')
header.font = new Font('Georgia-Bold', 15)
header.textColor = ACCENT
w.addSpacer(6)

// Streaks for abstinence/habit goals
const streakGoals = goals.filter(g => g.goal_type === 'abstinence' || g.goal_type === 'habit').slice(0, 3)
for (const g of streakGoals) {
  const mine = entries.filter(e => e.goal_id === g.id)
  const s = currentStreak(mine)
  const row = w.addStack()
  row.centerAlignContent()
  const name = row.addText(g.name)
  name.font = Font.systemFont(13)
  name.textColor = INK
  name.lineLimit = 1
  row.addSpacer()
  const val = row.addText(s > 0 ? `${s} day${s === 1 ? '' : 's'} 🔥` : '—')
  val.font = Font.boldSystemFont(13)
  val.textColor = s > 0 ? ACCENT : MUTED
  w.addSpacer(3)
}

w.addSpacer(4)

// Today's calendar
if (events.length === 0) {
  const t = w.addText('Nothing on today')
  t.font = Font.systemFont(11)
  t.textColor = MUTED
} else {
  for (const e of events.slice(0, 2)) {
    const t = w.addText(`${e.event_time ? e.event_time + '  ' : ''}${e.title}`)
    t.font = Font.systemFont(11)
    t.textColor = MUTED
    t.lineLimit = 1
  }
}

Script.setWidget(w)
Script.complete()
if (config.runsInApp) w.presentMedium()
