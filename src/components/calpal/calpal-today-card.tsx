import { Card } from '@/components/ui/card'
import { UtensilsCrossed } from 'lucide-react'
import { useFoodLogs } from '@/hooks/use-food-logs'
import { useCalPalSettings } from '@/hooks/use-calpal-settings'
import { dailyTarget, macrosOn, proteinTarget } from '@/lib/calpal'
import { todayKey } from '@/lib/goal-stats'
import { FoodLogForm } from './food-log-form'

// Compact Cal Pal card for the Today screen: what's left today + quick log.
export function CalPalTodayCard({ onOpen }: { onOpen: () => void }) {
  const { logs, loading, add } = useFoodLogs()
  const { settings } = useCalPalSettings()
  const today = todayKey()

  if (loading) return null

  const target = dailyTarget(settings)
  const macros = macrosOn(logs, today)
  const eaten = macros.calories
  const remaining = target - eaten
  const proteinGoal = proteinTarget(settings)
  const todayCount = logs.filter(l => l.date === today).length

  return (
    <Card className="py-3 px-4 gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <button className="flex items-center gap-2 min-w-0 text-left" onClick={onOpen} title="Open Cal Pal">
          <UtensilsCrossed className="w-4 h-4 text-primary shrink-0" />
          <span className="font-display font-semibold">Cal Pal</span>
          {todayCount > 0 && <span className="text-xs text-muted-foreground">{todayCount} logged</span>}
        </button>
        <span className={`text-sm tabular-nums font-medium ${remaining < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
          {remaining >= 0 ? `${remaining.toLocaleString()} kcal left` : `${Math.abs(remaining).toLocaleString()} over`}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full transition-all ${eaten > target ? 'bg-red-500' : 'bg-primary'}`}
          style={{ width: `${Math.min(100, target > 0 ? (eaten / target) * 100 : 0)}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums -mt-1">
        Protein <span className={macros.protein >= proteinGoal ? 'text-emerald-600 font-medium' : 'text-foreground'}>{Math.round(macros.protein)}g</span> / {proteinGoal}g
      </p>
      <FoodLogForm logs={logs} usualsLimit={3} onAdd={(name, kcal, p, f) => add(today, name, kcal, p, f)} />
    </Card>
  )
}

// One-liner for the calendar's day detail: calories eaten that day vs target.
export function CaloriesOnDay({ day }: { day: string }) {
  const { logs } = useFoodLogs()
  const { settings } = useCalPalSettings()
  const dayLogs = logs.filter(l => l.date === day)
  if (dayLogs.length === 0) return null
  const macros = macrosOn(logs, day)
  const target = dailyTarget(settings)
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cal Pal</p>
      <p className="text-xs">
        <span className={`font-semibold tabular-nums ${macros.calories > target ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {macros.calories.toLocaleString()} kcal
        </span>
        <span className="text-muted-foreground">
          {' '}of {target.toLocaleString()}
          {macros.protein > 0 && ` · ${Math.round(macros.protein)}g protein`}
          {' '}· {dayLogs.length} item{dayLogs.length === 1 ? '' : 's'}
        </span>
      </p>
    </div>
  )
}
