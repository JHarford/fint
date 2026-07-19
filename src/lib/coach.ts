import { differenceInCalendarDays, format, getISODay, parseISO, subDays } from 'date-fns'
import type { CalPalSettings, Chore, ChoreLog, FoodLog, Goal, GoalEntry, JournalDay } from '@/types'
import {
  currentStreak, dateKey, entriesForGoal, STREAK_MILESTONES, targetProgress, thisWeekCount,
} from './goal-stats'
import { dailyTarget, macrosOn, proteinTarget } from './calpal'

// Everything beyond goals that the coach can see
export interface LifeContext {
  foodLogs: FoodLog[]
  calpalSettings: CalPalSettings
  chores: Chore[]
  choreLogs: ChoreLog[]
}

// A coaching insight derived locally from goal data — no API needed.
export interface CoachInsight {
  goalId: string
  goalName: string
  kind: 'slip' | 'missed_days' | 'behind_week' | 'behind_target' | 'milestone'
  tone: 'support' | 'nudge' | 'celebrate'
  summary: string
}

export function detectInsights(goals: Goal[], allEntries: GoalEntry[], life?: LifeContext): CoachInsight[] {
  const insights: CoachInsight[] = []

  // Cal Pal: consecutive fully-logged days over the calorie target
  if (life && life.foodLogs.length > 0) {
    const target = dailyTarget(life.calpalSettings)
    let overDays = 0
    for (let i = 1; i <= 7; i++) {
      const day = dateKey(subDays(new Date(), i))
      const m = macrosOn(life.foodLogs, day)
      if (m.calories === 0) break // unlogged day — stop counting
      if (m.calories > target) overDays++
      else break
    }
    if (overDays >= 2) {
      insights.push({
        goalId: 'calpal',
        goalName: 'Cal Pal',
        kind: 'behind_target',
        tone: 'support',
        summary: `${overDays} days in a row over the ${target.toLocaleString()} kcal target. No drama — plan today's meals now, before hunger does it for you.`,
      })
    }
  }

  for (const goal of goals.filter(g => g.is_active)) {
    const entries = entriesForGoal(allEntries, goal.id)

    if (goal.goal_type === 'abstinence') {
      // Recent slip: an explicit value-0 entry in the last 3 days
      const recentSlip = entries.find(e => e.value <= 0 && differenceInCalendarDays(new Date(), parseISO(e.date)) <= 3)
      if (recentSlip) {
        insights.push({
          goalId: goal.id,
          goalName: goal.name,
          kind: 'slip',
          tone: 'support',
          summary: `Logged a slip on ${goal.name} on ${format(parseISO(recentSlip.date), 'EEEE d MMM')}. One slip doesn't erase the progress — the next clean day starts the streak again.`,
        })
        continue
      }

      // Unlogged gap: nothing recorded for 2+ days (excluding today, which is still open)
      const lastLogged = entries.length > 0
        ? entries.reduce((max, e) => e.date > max ? e.date : max, entries[0].date)
        : goal.start_date
      const gapDays = differenceInCalendarDays(new Date(), parseISO(lastLogged)) - 1
      if (gapDays >= 2) {
        insights.push({
          goalId: goal.id,
          goalName: goal.name,
          kind: 'missed_days',
          tone: 'nudge',
          summary: `${goal.name} hasn't been logged for ${gapDays} days. Tap the missed days on the Today screen to backfill them.`,
        })
        continue
      }

      const streak = currentStreak(entries)
      if (STREAK_MILESTONES.includes(streak)) {
        insights.push({
          goalId: goal.id,
          goalName: goal.name,
          kind: 'milestone',
          tone: 'celebrate',
          summary: `${streak} days on ${goal.name} — a real milestone. Worth marking with something you enjoy (that isn't the thing you quit).`,
        })
      }
    }

    if (goal.goal_type === 'habit') {
      const target = goal.frequency_per_week || 7
      // Count-per-day habits: a day only counts once the daily target is hit
      const daily = goal.daily_target && goal.daily_target > 1 ? goal.daily_target : null
      const done = daily
        ? entries.filter(e => {
            const weekStart = dateKey(subDays(new Date(), getISODay(new Date()) - 1))
            return e.date >= weekStart && Number(e.value) >= daily
          }).length
        : thisWeekCount(entries)
      const isoDay = getISODay(new Date()) // Mon=1 .. Sun=7
      const daysLeftInWeek = 8 - isoDay // including today
      const needed = target - done
      if (needed > daysLeftInWeek) {
        insights.push({
          goalId: goal.id,
          goalName: goal.name,
          kind: 'behind_week',
          tone: 'support',
          summary: `${goal.name} is at ${done}/${target} with ${daysLeftInWeek} day${daysLeftInWeek === 1 ? '' : 's'} left this week — the full target is out of reach, but every session still counts. Aim to close the week strong.`,
        })
      } else if (needed > 0 && needed === daysLeftInWeek) {
        insights.push({
          goalId: goal.id,
          goalName: goal.name,
          kind: 'behind_week',
          tone: 'nudge',
          summary: `${goal.name} needs a session every remaining day (${needed} in ${daysLeftInWeek}) to hit ${target} this week. Today would be a good day.`,
        })
      }
    }

    if (goal.goal_type === 'target') {
      const progress = targetProgress(goal, entries)
      const unit = goal.unit || ''
      if (entries.length === 0) {
        // Nothing logged since the goal was set up — that's a logging nudge,
        // not "behind pace" (progress is simply unknown, not 0)
        if (differenceInCalendarDays(new Date(), parseISO(goal.start_date)) >= 5) {
          insights.push({
            goalId: goal.id,
            goalName: goal.name,
            kind: 'missed_days',
            tone: 'nudge',
            summary: `${goal.name} has no updates logged yet — it's still at its starting value of ${unit}${Number(goal.start_value).toLocaleString()}. Log the latest number on the Today screen whenever it changes and the chart will track the trend.`,
          })
        }
      } else if (progress.onTrack === false) {
        insights.push({
          goalId: goal.id,
          goalName: goal.name,
          kind: 'behind_target',
          tone: 'nudge',
          summary: `${goal.name} is at ${unit}${progress.current.toLocaleString()}, aiming for ${unit}${Number(goal.target_value).toLocaleString()}${goal.target_date ? ` by ${format(parseISO(goal.target_date), 'd MMM')}` : ''} — slightly behind pace. A small extra push this month gets it back on track.`,
        })
      }
    }
  }

  // Celebrations last so problems surface first
  return insights.sort((a, b) => (a.tone === 'celebrate' ? 1 : 0) - (b.tone === 'celebrate' ? 1 : 0))
}

// ---- AI coaching via the Anthropic API (optional, needs VITE_ANTHROPIC_API_KEY) ----

export function hasAnthropicKey(): boolean {
  return Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY)
}

function describeGoal(goal: Goal, entries: GoalEntry[]): string {
  if (goal.goal_type === 'abstinence') {
    const streak = currentStreak(entries)
    const slips = entries.filter(e => e.value <= 0).length
    return `- "${goal.name}" (quit/avoid, started ${goal.start_date}): current streak ${streak} days, ${slips} slip(s) recorded.`
  }
  if (goal.goal_type === 'habit') {
    const done = thisWeekCount(entries)
    return `- "${goal.name}" (habit, target ${goal.frequency_per_week || 7}x/week): ${done} done so far this week.`
  }
  const progress = targetProgress(goal, entries)
  return `- "${goal.name}" (numeric target, ${goal.unit}${goal.start_value} → ${goal.unit}${goal.target_value ?? '?'}${goal.target_date ? ` by ${goal.target_date}` : ''}): currently ${goal.unit}${progress.current} (${Math.round(progress.pct)}%).`
}

// Last 7 logged days of eating vs targets, for the coaching prompt
function describeCalPal(life: LifeContext): string {
  const target = dailyTarget(life.calpalSettings)
  const pTarget = proteinTarget(life.calpalSettings)
  const lines: string[] = []
  for (let i = 0; i < 7; i++) {
    const day = dateKey(subDays(new Date(), i))
    const m = macrosOn(life.foodLogs, day)
    if (m.calories === 0) continue
    lines.push(`- ${day}${i === 0 ? ' (today so far)' : ''}: ${m.calories} kcal, ${Math.round(m.protein)}g protein`)
  }
  if (lines.length === 0) return ''
  return `\n\nMy eating (Cal Pal — daily target ${target} kcal${life.calpalSettings.adjustment !== 0 ? ` (${life.calpalSettings.adjustment > 0 ? 'surplus for muscle gain' : 'deficit'})` : ''}, protein target ${pTarget}g):\n${lines.join('\n')}`
}

function describeChores(life: LifeContext): string {
  if (life.chores.length === 0) return ''
  const weekAgo = dateKey(subDays(new Date(), 7))
  const nameById = new Map(life.chores.map(c => [c.id, c.name]))
  const counts = new Map<string, number>()
  for (const l of life.choreLogs) {
    if (l.date < weekAgo) continue
    const name = nameById.get(l.chore_id)
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  if (counts.size === 0) return ''
  const line = Array.from(counts.entries()).map(([n, c]) => `${n} ×${c}`).join(', ')
  return `\n\nHouse jobs done this week: ${line}.`
}

export async function generateCoaching(
  goals: Goal[],
  allEntries: GoalEntry[],
  insights: CoachInsight[],
  journal: JournalDay[] = [],
  life?: LifeContext,
): Promise<string> {
  // Loaded on demand so the SDK stays out of the main bundle
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  })

  const activeGoals = goals.filter(g => g.is_active)
  const goalLines = activeGoals
    .map(g => describeGoal(g, entriesForGoal(allEntries, g.id)))
    .join('\n')
  const insightLines = insights.map(i => `- ${i.summary}`).join('\n')

  // Personal notes from recent check-ins are the richest coaching signal
  const goalNameById = new Map(activeGoals.map(g => [g.id, g.name]))
  const noteLines = allEntries
    .filter(e => e.note && goalNameById.has(e.goal_id) && differenceInCalendarDays(new Date(), parseISO(e.date)) <= 14)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map(e => `- ${e.date} (${goalNameById.get(e.goal_id)}, ${e.value > 0 ? 'done' : 'slipped'}): "${e.note}"`)
    .join('\n')

  // Daily diary lines from the calendar journal (last week)
  const diaryLines = journal
    .filter(j => j.note && differenceInCalendarDays(new Date(), parseISO(j.day)) <= 7)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 7)
    .map(j => `- ${j.day}: "${j.note}"`)
    .join('\n')

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system:
      'You are the personal coach inside LifeFlow, a life-planning app. You know the user\'s goals, eating record and recent activity. ' +
      'Write a short, warm, personal coaching note (under 120 words). Be specific to their actual data — reference real streaks, slips, and numbers. ' +
      'Never shame or lecture. If they slipped, normalise it and focus on the next small step. If they\'re doing well, say so plainly. ' +
      'Connect threads when they\'re related (protein and gym days, drinking and calories) but only mention food or house jobs when there\'s something worth saying. ' +
      'End with one concrete, doable suggestion for today. Plain prose, no headings or bullet lists.',
    messages: [{
      role: 'user',
      content: `Today is ${format(new Date(), 'EEEE d MMMM yyyy')} (${dateKey(new Date())}).\n\nMy goals:\n${goalLines}\n\nWhat's currently flagged:\n${insightLines || '- Nothing flagged; things are broadly on track.'}${noteLines ? `\n\nMy own notes from recent check-ins (use these — they're what actually happened):\n${noteLines}` : ''}${diaryLines ? `\n\nMy diary entries this week:\n${diaryLines}` : ''}${life ? describeCalPal(life) : ''}${life ? describeChores(life) : ''}\n\nWrite my coaching note for today.`,
    }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  return textBlock?.text ?? ''
}
