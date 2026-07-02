import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Flame, Pencil, Plus, Trophy, X } from 'lucide-react'
import type { Goal, GoalEntry } from '@/types'
import {
  currentStreak, entriesForGoal, entryByDate, lastNDays, latestValue,
  targetProgress, thisWeekCount, todayKey,
} from '@/lib/goal-stats'
import { GOAL_ICONS, goalColor } from './goal-meta'

interface TodayTabProps {
  goals: Goal[]
  entries: GoalEntry[]
  log: (goalId: string, date: string, value: number, note?: string) => Promise<void>
  removeEntry: (goalId: string, date: string) => Promise<void>
  onManageGoals: () => void
}

export function TodayTab({ goals, entries, log, removeEntry, onManageGoals }: TodayTabProps) {
  const activeGoals = goals.filter(g => g.is_active)
  const today = todayKey()

  const doneToday = activeGoals.filter(g => {
    const entry = entriesForGoal(entries, g.id).find(e => e.date === today)
    return entry && (g.goal_type === 'target' || entry.value > 0)
  }).length

  if (activeGoals.length === 0) {
    return (
      <Card className="py-12 px-6 flex flex-col items-center gap-3 text-center">
        <Trophy className="w-8 h-8 text-muted-foreground" />
        <div>
          <p className="font-medium">No goals yet</p>
          <p className="text-sm text-muted-foreground">Set up your first goal — no alcohol, fitness, savings, anything you want to stick to.</p>
        </div>
        <Button onClick={onManageGoals}>
          <Plus className="w-4 h-4 mr-1" /> Create a goal
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold">{format(new Date(), 'EEEE, d MMMM')}</h2>
          <p className="text-sm text-muted-foreground">
            {doneToday} of {activeGoals.length} goals checked in today
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onManageGoals}>Manage goals</Button>
      </div>

      <div className="space-y-3">
        {activeGoals.map(goal => (
          <GoalRow
            key={goal.id}
            goal={goal}
            goalEntries={entriesForGoal(entries, goal.id)}
            log={log}
            removeEntry={removeEntry}
          />
        ))}
      </div>
    </div>
  )
}

interface GoalRowProps {
  goal: Goal
  goalEntries: GoalEntry[]
  log: TodayTabProps['log']
  removeEntry: TodayTabProps['removeEntry']
}

function GoalRow({ goal, goalEntries, log, removeEntry }: GoalRowProps) {
  const color = goalColor(goal.color)
  const Icon = GOAL_ICONS[goal.icon] ?? GOAL_ICONS.target
  const byDate = entryByDate(goalEntries)
  const today = todayKey()
  const todayEntry = byDate.get(today)

  // Tap a day to cycle its state. Abstinence has an explicit "slipped" state so a
  // bad day can be recorded honestly; habits are just done/not done.
  const cycle = async (date: string) => {
    const entry = byDate.get(date)
    if (!entry) await log(goal.id, date, 1)
    else if (goal.goal_type === 'abstinence' && entry.value > 0) await log(goal.id, date, 0)
    else await removeEntry(goal.id, date)
  }

  return (
    <Card className="py-3 px-4 gap-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <div className="flex items-center gap-3 min-w-0 flex-1 basis-52">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${color.soft}`}>
            <Icon className={`w-4.5 h-4.5 ${color.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{goal.name}</span>
              <StatBadge goal={goal} goalEntries={goalEntries} />
            </div>
            {goal.description && (
              <p className="text-xs text-muted-foreground truncate">{goal.description}</p>
            )}
          </div>
        </div>

        {/* On phones this pair wraps onto its own full-width row: strip left, action right */}
        {goal.goal_type !== 'target' ? (
          <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
            <WeekStrip goal={goal} byDate={byDate} onCycle={cycle} />
            <CheckButton goal={goal} todayEntry={todayEntry} onCycle={() => cycle(today)} />
          </div>
        ) : (
          <TargetLogger goal={goal} todayEntry={todayEntry} goalEntries={goalEntries} log={log} />
        )}
      </div>

      {goal.goal_type === 'target' && <TargetProgressBar goal={goal} goalEntries={goalEntries} />}
    </Card>
  )
}

function StatBadge({ goal, goalEntries }: { goal: Goal; goalEntries: GoalEntry[] }) {
  if (goal.goal_type === 'abstinence') {
    const streak = currentStreak(goalEntries)
    if (streak === 0) return null
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-orange-600 shrink-0">
        <Flame className="w-3.5 h-3.5" /> {streak} day{streak === 1 ? '' : 's'}
      </span>
    )
  }
  if (goal.goal_type === 'habit') {
    const done = thisWeekCount(goalEntries)
    const target = goal.frequency_per_week || 7
    return (
      <span className={`text-xs font-medium shrink-0 ${done >= target ? 'text-green-600' : 'text-muted-foreground'}`}>
        {done}/{target} this week
      </span>
    )
  }
  return null
}

// Last 7 days as tappable dots — makes it easy to backfill a missed check-in
function WeekStrip({ goal, byDate, onCycle }: {
  goal: Goal
  byDate: Map<string, GoalEntry>
  onCycle: (date: string) => void
}) {
  const color = goalColor(goal.color)
  const days = lastNDays(7)
  return (
    <div className="flex items-center gap-1.5 sm:gap-1 shrink-0">
      {days.map(date => {
        const entry = byDate.get(date)
        const beforeStart = date < goal.start_date
        let cls = 'bg-muted hover:bg-muted-foreground/30'
        if (entry && entry.value > 0) cls = `${color.solid} hover:opacity-80`
        else if (entry) cls = 'bg-red-500 hover:opacity-80'
        return (
          <button
            key={date}
            disabled={beforeStart}
            title={`${format(parseISO(date), 'EEE d MMM')}${entry ? (entry.value > 0 ? ' — done' : ' — slipped') : ''}`}
            onClick={() => onCycle(date)}
            className={`w-4 h-4 sm:w-3.5 sm:h-3.5 rounded-full transition-colors ${beforeStart ? 'bg-muted/30 cursor-default' : cls}`}
          />
        )
      })}
    </div>
  )
}

function CheckButton({ goal, todayEntry, onCycle }: {
  goal: Goal
  todayEntry: GoalEntry | undefined
  onCycle: () => void
}) {
  const isAbstinence = goal.goal_type === 'abstinence'
  if (todayEntry && todayEntry.value > 0) {
    return (
      <Button size="sm" className="shrink-0 bg-green-600 hover:bg-green-700 text-white" onClick={onCycle}>
        <Check className="w-4 h-4 mr-1" /> {isAbstinence ? 'Clean day' : 'Done'}
      </Button>
    )
  }
  if (todayEntry) {
    return (
      <Button size="sm" variant="destructive" className="shrink-0" onClick={onCycle}>
        <X className="w-4 h-4 mr-1" /> Slipped
      </Button>
    )
  }
  return (
    <Button size="sm" variant="outline" className="shrink-0" onClick={onCycle}>
      {isAbstinence ? 'Mark clean day' : 'Mark done'}
    </Button>
  )
}

function TargetLogger({ goal, todayEntry, goalEntries, log }: {
  goal: Goal
  todayEntry: GoalEntry | undefined
  goalEntries: GoalEntry[]
  log: TodayTabProps['log']
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  const save = async () => {
    const n = parseFloat(value)
    if (!isNaN(n)) {
      await log(goal.id, todayKey(), n)
      setEditing(false)
    }
  }

  if (!editing && todayEntry) {
    return (
      <Button variant="ghost" size="sm" className="shrink-0 text-sm font-medium" onClick={() => { setValue(String(todayEntry.value)); setEditing(true) }}>
        {goal.unit}{Number(todayEntry.value).toLocaleString()} <Pencil className="w-3 h-3 ml-1 text-muted-foreground" />
      </Button>
    )
  }
  if (!editing) {
    return (
      <Button size="sm" variant="outline" className="shrink-0" onClick={() => { setValue(String(latestValue(goal, goalEntries) || '')); setEditing(true) }}>
        Log {goal.unit ? goal.unit : 'value'}
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Input
        type="number"
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        className="w-24 h-8 text-sm"
        placeholder={goal.unit || '0'}
      />
      <Button size="sm" className="h-8" onClick={save}>Save</Button>
    </div>
  )
}

function TargetProgressBar({ goal, goalEntries }: { goal: Goal; goalEntries: GoalEntry[] }) {
  const color = goalColor(goal.color)
  const progress = targetProgress(goal, goalEntries)
  if (goal.target_value === null) return null

  return (
    <div className="flex items-center gap-3 sm:pl-12">
      <div className={`flex-1 h-2 rounded-full overflow-hidden ${color.soft}`}>
        <div className={`h-full rounded-full ${color.solid}`} style={{ width: `${progress.pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {goal.unit}{progress.current.toLocaleString()} / {goal.unit}{Number(goal.target_value).toLocaleString()}
        {progress.daysLeft !== null && progress.daysLeft >= 0 && ` · ${progress.daysLeft}d left`}
        {progress.onTrack !== null && (
          <span className={progress.onTrack ? 'text-green-600' : 'text-amber-600'}>
            {' '}· {progress.onTrack ? 'on track' : 'behind'}
          </span>
        )}
      </span>
    </div>
  )
}
