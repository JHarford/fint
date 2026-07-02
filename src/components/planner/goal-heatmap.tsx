import { addDays, format, startOfWeek, subWeeks } from 'date-fns'
import type { Goal, GoalEntry } from '@/types'
import { dateKey, entryByDate } from '@/lib/goal-stats'
import { goalColor } from './goal-meta'

interface GoalHeatmapProps {
  goal: Goal
  goalEntries: GoalEntry[]
  weeks?: number
}

// GitHub-style contribution grid: columns are weeks (oldest left), rows Mon-Sun
export function GoalHeatmap({ goal, goalEntries, weeks = 16 }: GoalHeatmapProps) {
  const byDate = entryByDate(goalEntries)
  const color = goalColor(goal.color)
  const todayStr = dateKey(new Date())
  const gridStart = startOfWeek(subWeeks(new Date(), weeks - 1), { weekStartsOn: 1 })

  const columns = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d))
  )

  return (
    <div className="flex gap-[3px] overflow-x-auto">
      {columns.map((days, w) => (
        <div key={w} className="flex flex-col gap-[3px]">
          {days.map(day => {
            const key = dateKey(day)
            const entry = byDate.get(key)
            const isFuture = key > todayStr
            const beforeStart = key < goal.start_date

            let cls = 'bg-muted' // logged nothing
            if (isFuture || beforeStart) cls = 'bg-muted/30'
            else if (entry && entry.value > 0) cls = color.solid
            else if (entry) cls = 'bg-red-500' // explicit slip

            const label = entry
              ? `${format(day, 'd MMM')}: ${entry.value > 0 ? (goal.goal_type === 'target' ? `${goal.unit}${entry.value}` : 'done') : 'slipped'}`
              : format(day, 'd MMM')

            return (
              <div
                key={key}
                title={label}
                className={`w-[10px] h-[10px] rounded-[2px] shrink-0 ${cls} ${key === todayStr ? 'ring-1 ring-foreground/40' : ''}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
