import { differenceInCalendarDays, format, parseISO, startOfWeek, subDays, subWeeks } from 'date-fns'
import type { Goal, GoalEntry } from '@/types'

export function dateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function todayKey(): string {
  return dateKey(new Date())
}

// Last n calendar days ending today, oldest first
export function lastNDays(n: number): string[] {
  const today = new Date()
  return Array.from({ length: n }, (_, i) => dateKey(subDays(today, n - 1 - i)))
}

export function entriesForGoal(entries: GoalEntry[], goalId: string): GoalEntry[] {
  return entries.filter(e => e.goal_id === goalId)
}

// date -> entry for a single goal's entries
export function entryByDate(goalEntries: GoalEntry[]): Map<string, GoalEntry> {
  return new Map(goalEntries.map(e => [e.date, e]))
}

// Consecutive success days ending today (or yesterday — today still counts as pending
// until it's logged). A slip entry (value 0) or a missing day breaks the run.
export function currentStreak(goalEntries: GoalEntry[]): number {
  const byDate = entryByDate(goalEntries)
  let day = new Date()
  const today = byDate.get(dateKey(day))
  if (!today) day = subDays(day, 1)
  else if (today.value <= 0) return 0

  let streak = 0
  for (;;) {
    const entry = byDate.get(dateKey(day))
    if (!entry || entry.value <= 0) break
    streak++
    day = subDays(day, 1)
  }
  return streak
}

export function bestStreak(goalEntries: GoalEntry[]): number {
  const successDates = goalEntries
    .filter(e => e.value > 0)
    .map(e => parseISO(e.date))
    .sort((a, b) => a.getTime() - b.getTime())
  let best = 0
  let run = 0
  for (let i = 0; i < successDates.length; i++) {
    if (i > 0 && differenceInCalendarDays(successDates[i], successDates[i - 1]) === 1) run++
    else run = 1
    if (run > best) best = run
  }
  return best
}

// Check-ins in the current week (Monday-based) for habit goals
export function thisWeekCount(goalEntries: GoalEntry[]): number {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const startKey = dateKey(weekStart)
  return goalEntries.filter(e => e.value > 0 && e.date >= startKey).length
}

export function totalDone(goalEntries: GoalEntry[]): number {
  return goalEntries.filter(e => e.value > 0).length
}

export function slipCount(goalEntries: GoalEntry[]): number {
  return goalEntries.filter(e => e.value <= 0).length
}

// Latest logged value for a target goal, falling back to its start value
export function latestValue(goal: Goal, goalEntries: GoalEntry[]): number {
  const sorted = [...goalEntries].sort((a, b) => b.date.localeCompare(a.date))
  return sorted.length > 0 ? Number(sorted[0].value) : Number(goal.start_value)
}

export interface TargetProgress {
  current: number
  pct: number // 0-100, clamped
  remaining: number
  daysLeft: number | null
  onTrack: boolean | null // null when there's no target date to pace against
}

export function targetProgress(goal: Goal, goalEntries: GoalEntry[]): TargetProgress {
  const current = latestValue(goal, goalEntries)
  const start = Number(goal.start_value)
  const target = goal.target_value !== null ? Number(goal.target_value) : null
  if (target === null || target === start) {
    return { current, pct: 0, remaining: 0, daysLeft: null, onTrack: null }
  }
  const pct = Math.min(100, Math.max(0, ((current - start) / (target - start)) * 100))
  const remaining = target - current
  let daysLeft: number | null = null
  let onTrack: boolean | null = null
  if (goal.target_date) {
    daysLeft = differenceInCalendarDays(parseISO(goal.target_date), new Date())
    const totalDays = differenceInCalendarDays(parseISO(goal.target_date), parseISO(goal.start_date))
    if (totalDays > 0) {
      const elapsed = Math.min(totalDays, Math.max(0, differenceInCalendarDays(new Date(), parseISO(goal.start_date))))
      const expectedPct = (elapsed / totalDays) * 100
      onTrack = pct >= expectedPct - 1 // small grace margin
    }
  }
  return { current, pct, remaining, daysLeft, onTrack }
}

export function heatmapRangeLabel(weeks = 16): string {
  const start = startOfWeek(subWeeks(new Date(), weeks - 1), { weekStartsOn: 1 })
  return `${format(start, 'd MMM')} – today`
}

export function daysSinceStart(goal: Goal): number {
  return Math.max(0, differenceInCalendarDays(new Date(), parseISO(goal.start_date)))
}
