import { useState } from 'react'
import { format, parseISO, startOfWeek } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Flame, Pause, Pencil, Play, Plus, Trash2, Trophy } from 'lucide-react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Goal, GoalEntry } from '@/types'
import {
  bestStreak, currentStreak, daysSinceStart, entriesForGoal, heatmapRangeLabel,
  moneySaved, nextMilestone, personalBest, slipCount, targetProgress,
  thisWeekCount, totalDone, unitsAvoided,
} from '@/lib/goal-stats'
import { GoalHeatmap } from './goal-heatmap'
import { GoalFormDialog, type GoalFormValues } from './goal-form-dialog'
import { GOAL_ICONS, GOAL_TYPE_LABELS, goalColor } from './goal-meta'

interface GoalsTabProps {
  goals: Goal[]
  entries: GoalEntry[]
  createGoal: (goal: Omit<Goal, 'id' | 'created_at'>) => Promise<void>
  updateGoal: (id: string, updates: Partial<Omit<Goal, 'id' | 'created_at'>>) => Promise<void>
  removeGoal: (id: string) => Promise<void>
}

export function GoalsTab({ goals, entries, createGoal, updateGoal, removeGoal }: GoalsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)

  const activeGoals = goals.filter(g => g.is_active)
  const pausedGoals = goals.filter(g => !g.is_active)

  const handleSave = async (values: GoalFormValues) => {
    if (editingGoal) {
      await updateGoal(editingGoal.id, values)
    } else {
      await createGoal({ ...values, is_active: true, sort_order: goals.length })
    }
  }

  const openCreate = () => { setEditingGoal(null); setDialogOpen(true) }
  const openEdit = (goal: Goal) => { setEditingGoal(goal); setDialogOpen(true) }

  const handleDelete = async (goal: Goal) => {
    if (window.confirm(`Delete "${goal.name}" and all its history? This can't be undone.`)) {
      await removeGoal(goal.id)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">Goals</h2>
          <p className="text-sm text-muted-foreground">Everything you're working towards</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> New goal
        </Button>
      </div>

      {goals.length === 0 && (
        <Card className="py-10 px-6 flex flex-col items-center gap-2 text-center">
          <Trophy className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No goals yet. Create one to start tracking.</p>
        </Card>
      )}

      <div className="space-y-3">
        {activeGoals.map(goal => (
          <GoalCard
            key={goal.id}
            goal={goal}
            goalEntries={entriesForGoal(entries, goal.id)}
            onEdit={() => openEdit(goal)}
            onTogglePause={() => updateGoal(goal.id, { is_active: false })}
            onDelete={() => handleDelete(goal)}
          />
        ))}
      </div>

      {pausedGoals.length > 0 && (
        <>
          <Separator />
          <p className="text-sm font-medium text-muted-foreground">Paused</p>
          <div className="space-y-3">
            {pausedGoals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                goalEntries={entriesForGoal(entries, goal.id)}
                paused
                onEdit={() => openEdit(goal)}
                onTogglePause={() => updateGoal(goal.id, { is_active: true })}
                onDelete={() => handleDelete(goal)}
              />
            ))}
          </div>
        </>
      )}

      <GoalFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        goal={editingGoal}
        onSave={handleSave}
      />
    </div>
  )
}

interface GoalCardProps {
  goal: Goal
  goalEntries: GoalEntry[]
  paused?: boolean
  onEdit: () => void
  onTogglePause: () => void
  onDelete: () => void
}

function GoalCard({ goal, goalEntries, paused = false, onEdit, onTogglePause, onDelete }: GoalCardProps) {
  const color = goalColor(goal.color)
  const Icon = GOAL_ICONS[goal.icon] ?? GOAL_ICONS.target

  return (
    <Card className={`py-4 px-4 gap-3 ${paused ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${color.soft}`}>
          <Icon className={`w-4.5 h-4.5 ${color.text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{goal.name}</span>
            <Badge variant="secondary" className="text-[10px] shrink-0 hidden sm:inline-flex">{GOAL_TYPE_LABELS[goal.goal_type]}</Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {goal.description || `Since ${format(parseISO(goal.start_date), 'd MMM yyyy')}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title={paused ? 'Resume' : 'Pause'} onClick={onTogglePause}>
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Delete" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <GoalStats goal={goal} goalEntries={goalEntries} />

      {goal.goal_type === 'target'
        ? <TargetChart goal={goal} goalEntries={goalEntries} />
        : goal.goal_type === 'record'
        ? <RecordChart goal={goal} goalEntries={goalEntries} />
        : (
          <div className="space-y-1">
            <GoalHeatmap goal={goal} goalEntries={goalEntries} />
            <p className="text-[10px] text-muted-foreground">{heatmapRangeLabel()}</p>
          </div>
        )}
    </Card>
  )
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className={`text-sm font-semibold ${highlight ? 'text-orange-600' : ''}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  )
}

function GoalStats({ goal, goalEntries }: { goal: Goal; goalEntries: GoalEntry[] }) {
  if (goal.goal_type === 'abstinence') {
    const streak = currentStreak(goalEntries)
    const best = bestStreak(goalEntries)
    const clean = totalDone(goalEntries)
    const slips = slipCount(goalEntries)
    const saved = moneySaved(goal, goalEntries)
    const units = unitsAvoided(goal, goalEntries)
    const milestone = nextMilestone(streak)
    return (
      <div className="space-y-2 sm:pl-12">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-center gap-1">
            <Flame className="w-4 h-4 text-orange-500" />
            <Stat label="Current streak" value={`${streak}d`} highlight />
          </div>
          <Stat label="Best streak" value={`${best}d`} />
          <Stat label="Clean days" value={String(clean)} />
          <Stat label="Slips" value={String(slips)} />
          {saved !== null && <Stat label="Money saved" value={formatGBP(saved)} highlight />}
          {units !== null && <Stat label="Units avoided" value={String(Math.round(units))} />}
        </div>
        {milestone && streak > 0 && (
          <p className="text-xs text-muted-foreground">
            Next milestone: <span className="font-medium text-foreground">{milestone.at} days</span> — {milestone.daysToGo} to go
          </p>
        )}
      </div>
    )
  }

  if (goal.goal_type === 'habit') {
    const daily = goal.daily_target && goal.daily_target > 1 ? goal.daily_target : null
    // Count-per-day habits: a day only counts once it hits the daily target
    const week = daily
      ? goalEntries.filter(e => {
          const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
          return e.date >= weekStart && Number(e.value) >= daily
        }).length
      : thisWeekCount(goalEntries)
    const target = goal.frequency_per_week || 7
    const total = daily
      ? goalEntries.filter(e => Number(e.value) >= daily).length
      : totalDone(goalEntries)
    const days = daysSinceStart(goal)
    const perWeekAvg = days >= 7 ? (total / (days / 7)).toFixed(1) : String(total)
    return (
      <div className="flex flex-wrap gap-x-6 gap-y-2 sm:pl-12">
        <Stat label={daily ? 'Full days this week' : 'This week'} value={`${week}/${target}`} highlight={week >= target} />
        <Stat label={daily ? 'Full days' : 'Total done'} value={String(total)} />
        <Stat label="Avg / week" value={perWeekAvg} />
      </div>
    )
  }

  if (goal.goal_type === 'record') {
    const pb = personalBest(goal, goalEntries)
    const sorted = [...goalEntries].sort((a, b) => b.date.localeCompare(a.date))
    const last = sorted[0]
    return (
      <div className="flex flex-wrap gap-x-6 gap-y-2 sm:pl-12">
        <Stat label="Personal best" value={pb !== null ? `${pb}${goal.unit}` : '—'} highlight />
        <Stat label="Last attempt" value={last ? `${Number(last.value)}${goal.unit}` : '—'} />
        <Stat label="Days logged" value={String(goalEntries.length)} />
        <Stat label="Counts as better" value={goal.record_direction === 'higher' ? 'Higher' : 'Lower'} />
      </div>
    )
  }

  const progress = targetProgress(goal, goalEntries)
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 sm:pl-12">
      <Stat label="Current" value={`${goal.unit}${progress.current.toLocaleString()}`} highlight />
      {goal.target_value !== null && (
        <>
          <Stat label="Target" value={`${goal.unit}${Number(goal.target_value).toLocaleString()}`} />
          <Stat label="Progress" value={`${Math.round(progress.pct)}%`} />
        </>
      )}
      {progress.daysLeft !== null && <Stat label="Days left" value={String(Math.max(0, progress.daysLeft))} />}
    </div>
  )
}

// Attempts over time, with the PB as a dashed reference line
function RecordChart({ goal, goalEntries }: { goal: Goal; goalEntries: GoalEntry[] }) {
  const color = goalColor(goal.color)
  const pb = personalBest(goal, goalEntries)
  const data = [...goalEntries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, value: Number(e.value) }))
  if (data.length < 2) {
    return <p className="text-xs text-muted-foreground sm:pl-12">Log a couple of attempts to see the trend.</p>
  }
  return (
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
          <XAxis
            dataKey="date"
            tickFormatter={d => format(parseISO(d), 'd MMM')}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            formatter={(v) => [`${Number(v)}${goal.unit}`, goal.name]}
            labelFormatter={d => format(parseISO(String(d)), 'd MMM yyyy')}
            contentStyle={{ fontSize: 12 }}
          />
          {pb !== null && (
            <ReferenceLine y={pb} stroke={color.hex} strokeDasharray="4 4" strokeOpacity={0.6} />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color.hex}
            strokeWidth={2}
            dot={{ r: 2.5, fill: color.hex, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount)
}

function TargetChart({ goal, goalEntries }: { goal: Goal; goalEntries: GoalEntry[] }) {
  const color = goalColor(goal.color)
  const data = [
    { date: goal.start_date, value: Number(goal.start_value) },
    ...[...goalEntries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => ({ date: e.date, value: Number(e.value) })),
  ]
  if (data.length < 2) {
    return <p className="text-xs text-muted-foreground pl-12">Log a value to start the progress chart.</p>
  }

  return (
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
          <XAxis
            dataKey="date"
            tickFormatter={d => format(parseISO(d), 'd MMM')}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            formatter={(v) => [`${goal.unit}${Number(v).toLocaleString()}`, goal.name]}
            labelFormatter={d => format(parseISO(String(d)), 'd MMM yyyy')}
            contentStyle={{ fontSize: 12 }}
          />
          {goal.target_value !== null && (
            <ReferenceLine
              y={Number(goal.target_value)}
              stroke={color.hex}
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color.hex}
            strokeWidth={2}
            dot={{ r: 2.5, fill: color.hex, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
