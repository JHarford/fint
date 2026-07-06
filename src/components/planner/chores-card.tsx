import { useMemo, useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Home, Pencil, Plus, X } from 'lucide-react'
import { useChores } from '@/hooks/use-chores'
import { todayKey } from '@/lib/goal-stats'

const STARTER_CHORES = ['Dishwasher', 'Ironing', 'Feed pets', 'Bathroom clean', 'Hoover', 'Bins out']

// House jobs: tap a chip to tag it done today. Deliberately not goals — no
// streaks or coaching. The badge shows how long since each was last done,
// which is the actually useful bit ("when DID I last clean the bathroom?").
export function ChoresCard() {
  const { chores, logs, loading, create, remove, toggle } = useChores()
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState('')
  const today = todayKey()

  const doneToday = useMemo(
    () => new Set(logs.filter(l => l.date === today).map(l => l.chore_id)),
    [logs, today],
  )
  // chore id -> most recent log date (logs arrive sorted desc)
  const lastDone = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of logs) if (!map.has(l.chore_id)) map.set(l.chore_id, l.date)
    return map
  }, [logs])

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    setNewName('')
    try { await create(name) } catch (e) { console.error('Chore add failed:', e) }
  }

  if (loading) return null

  return (
    <Card className="py-3 px-4 gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home className="w-4 h-4 text-muted-foreground" />
          <span className="font-display font-semibold">Around the house</span>
          {doneToday.size > 0 && (
            <span className="text-xs text-muted-foreground">{doneToday.size} done today</span>
          )}
        </div>
        {chores.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title={editing ? 'Done editing' : 'Edit jobs'} onClick={() => setEditing(e => !e)}>
            {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </Button>
        )}
      </div>

      {chores.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Tag everyday jobs as done — no streaks, no pressure, just a record. Start with:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STARTER_CHORES.map(name => (
              <button
                key={name}
                onClick={() => create(name).catch(e => console.error(e))}
                className="text-xs border border-dashed rounded-full px-3 py-1.5 text-muted-foreground hover:bg-muted transition-colors"
              >
                <Plus className="w-3 h-3 inline mr-1 -mt-0.5" />{name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chores.map(chore => {
            const done = doneToday.has(chore.id)
            const last = lastDone.get(chore.id)
            const days = last ? differenceInCalendarDays(parseISO(today), parseISO(last)) : null
            return (
              <button
                key={chore.id}
                onClick={() => editing
                  ? (window.confirm(`Remove "${chore.name}" and its history?`) && remove(chore.id).catch(e => console.error(e)))
                  : toggle(chore.id, today).catch(e => console.error(e))}
                className={`inline-flex items-center gap-1.5 text-sm rounded-full px-3 py-1.5 border transition-colors
                  ${done
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent hover:bg-muted border-border'}`}
              >
                {editing
                  ? <X className="w-3 h-3 text-destructive" />
                  : done && <Check className="w-3.5 h-3.5" />}
                <span>{chore.name}</span>
                {!done && !editing && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {days === null ? 'new' : days === 0 ? 'today' : `${days}d`}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-1.5">
          <Input
            value={newName}
            maxLength={40}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            placeholder="Add a job… e.g. Water plants"
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8" onClick={add} disabled={!newName.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </Card>
  )
}

// Compact read-only list of jobs done on a given day, for the calendar's
// day detail panel.
export function ChoresOnDay({ day }: { day: string }) {
  const { chores, logs } = useChores()
  const done = logs.filter(l => l.date === day)
  if (done.length === 0) return null
  const nameById = new Map(chores.map(c => [c.id, c.name]))
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">House jobs</p>
      <div className="flex flex-wrap gap-1.5">
        {done.map(l => (
          <span key={l.id} className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5">
            <Check className="w-3 h-3 text-chart-3" />
            {nameById.get(l.chore_id) ?? '?'}
          </span>
        ))}
      </div>
    </div>
  )
}
