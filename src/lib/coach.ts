import { differenceInCalendarDays, format, getISODay, parseISO } from 'date-fns'
import type { Goal, GoalEntry } from '@/types'
import {
  currentStreak, dateKey, entriesForGoal, STREAK_MILESTONES, targetProgress, thisWeekCount,
} from './goal-stats'

// A coaching insight derived locally from goal data — no API needed.
export interface CoachInsight {
  goalId: string
  goalName: string
  kind: 'slip' | 'missed_days' | 'behind_week' | 'behind_target' | 'milestone'
  tone: 'support' | 'nudge' | 'celebrate'
  summary: string
}

export function detectInsights(goals: Goal[], allEntries: GoalEntry[]): CoachInsight[] {
  const insights: CoachInsight[] = []

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
      const done = thisWeekCount(entries)
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
      if (progress.onTrack === false) {
        insights.push({
          goalId: goal.id,
          goalName: goal.name,
          kind: 'behind_target',
          tone: 'nudge',
          summary: `${goal.name} is at ${Math.round(progress.pct)}% and slightly behind pace for ${goal.target_date ? format(parseISO(goal.target_date), 'd MMM') : 'the target'}. A small extra push this month gets it back on track.`,
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

export async function generateCoaching(
  goals: Goal[],
  allEntries: GoalEntry[],
  insights: CoachInsight[],
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

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system:
      'You are the personal coach inside LifeFlow, a life-planning app. You know the user\'s goals and recent record. ' +
      'Write a short, warm, personal coaching note (under 120 words). Be specific to their actual data — reference real streaks, slips, and numbers. ' +
      'Never shame or lecture. If they slipped, normalise it and focus on the next small step. If they\'re doing well, say so plainly. ' +
      'End with one concrete, doable suggestion for today. Plain prose, no headings or bullet lists.',
    messages: [{
      role: 'user',
      content: `Today is ${format(new Date(), 'EEEE d MMMM yyyy')} (${dateKey(new Date())}).\n\nMy goals:\n${goalLines}\n\nWhat's currently flagged:\n${insightLines || '- Nothing flagged; things are broadly on track.'}${noteLines ? `\n\nMy own notes from recent check-ins (use these — they're what actually happened):\n${noteLines}` : ''}\n\nWrite my coaching note for today.`,
    }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  return textBlock?.text ?? ''
}
