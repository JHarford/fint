import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Minus, Plus, X } from 'lucide-react'
import type { Goal } from '@/types'
import { useGoals } from '@/hooks/use-goals'
import { useGoalEntries } from '@/hooks/use-goal-entries'
import { dateKey } from '@/lib/goal-stats'
import { GOAL_ICONS, goalColor } from './goal-meta'

// Backfill editor for the calendar day detail: fix or fill in any goal for a
// past day — a forgotten clean day, yesterday's pints, an unlogged golf round.
// Same value semantics as the Today tab: abstinence 1 = clean / 0 = slip /
// no entry = unrecorded; count habits store the day's count; target and
// record goals store the day's measured value.
export function GoalsOnDay({ day }: { day: string }) {
  const { goals } = useGoals()
  const { entries, log, remove } = useGoalEntries()
  const today = dateKey(new Date())
  if (day > today) return null
  const active = goals.filter(g => g.is_active && g.start_date <= day)
  if (active.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Goals that day</p>
      <div className="space-y-1">
        {active.map(goal => {
          const entry = entries.find(e => e.goal_id === goal.id && e.date === day)
          return (
            <GoalDayRow
              key={goal.id}
              goal={goal}
              value={entry ? Number(entry.value) : null}
              onSet={v => log(goal.id, day, v)}
              onClear={() => remove(goal.id, day)}
            />
          )
        })}
      </div>
    </div>
  )
}

function GoalDayRow({ goal, value, onSet, onClear }: {
  goal: Goal
  value: number | null
  onSet: (v: number) => void
  onClear: () => void
}) {
  const color = goalColor(goal.color)
  const Icon = GOAL_ICONS[goal.icon] ?? GOAL_ICONS.target
  const daily = goal.goal_type === 'habit' && goal.daily_target && goal.daily_target > 1
    ? goal.daily_target
    : null

  return (
    <div className="flex items-center gap-2 min-h-9">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${color.soft}`}>
        <Icon className={`w-3 h-3 ${color.text}`} />
      </div>
      <span className="text-sm truncate flex-1 min-w-0">{goal.name}</span>

      {daily ? (
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={!value}
            onClick={() => (value && value > 1 ? onSet(value - 1) : onClear())}>
            <Minus className="w-3 h-3" />
          </Button>
          <span className="text-xs tabular-nums w-8 text-center">{value ?? 0}/{daily}</span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0"
            onClick={() => onSet((value ?? 0) + 1)}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      ) : goal.goal_type === 'abstinence' ? (
        <div className="flex items-center gap-1 shrink-0">
          <StateChip active={value !== null && value > 0} tone="good" label="Clean"
            onClick={() => (value !== null && value > 0 ? onClear() : onSet(1))} />
          <StateChip active={value === 0} tone="bad" label="Slip"
            onClick={() => (value === 0 ? onClear() : onSet(0))} />
        </div>
      ) : goal.goal_type === 'habit' ? (
        <StateChip active={value !== null && value > 0} tone="good" label="Done"
          onClick={() => (value !== null && value > 0 ? onClear() : onSet(1))} />
      ) : (
        <ValueEditor unit={goal.unit} value={value} onSet={onSet} onClear={onClear} />
      )}
    </div>
  )
}

function StateChip({ active, tone, label, onClick }: {
  active: boolean
  tone: 'good' | 'bad'
  label: string
  onClick: () => void
}) {
  const activeCls = tone === 'good'
    ? 'bg-emerald-600 text-white border-emerald-600'
    : 'bg-red-500 text-white border-red-500'
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs rounded-full border px-2 py-1 transition-colors ${
        active ? activeCls : 'border-border text-muted-foreground hover:border-foreground/40'
      }`}
    >
      {tone === 'good' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </button>
  )
}

// Number entry for target/record goals (a golf round, a rowing time)
function ValueEditor({ unit, value, onSet, onClear }: {
  unit: string
  value: number | null
  onSet: (v: number) => void
  onClear: () => void
}) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  if (!editing && value !== null) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button className="text-xs font-medium tabular-nums underline decoration-dotted"
          onClick={() => { setDraft(String(value)); setEditing(true) }}>
          {value}{unit}
        </button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" title="Remove" onClick={onClear}>
          <X className="w-3 h-3" />
        </Button>
      </div>
    )
  }
  if (!editing) {
    return (
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setDraft(''); setEditing(true) }}>
        <Plus className="w-3 h-3 mr-0.5" /> Log
      </Button>
    )
  }
  return (
    <form
      className="flex items-center gap-1 shrink-0"
      onSubmit={e => {
        e.preventDefault()
        const n = parseFloat(draft)
        if (!isNaN(n)) { onSet(n); setEditing(false) }
      }}
    >
      <input
        autoFocus
        inputMode="decimal"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder={unit || '0'}
        className="w-16 h-7 rounded-md border border-input bg-transparent px-2 text-xs text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <Button type="submit" size="sm" className="h-7 text-xs" disabled={!draft.trim()}>Set</Button>
    </form>
  )
}
