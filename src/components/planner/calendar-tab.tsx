import { useMemo, useState } from 'react'
import {
  addDays, addMonths, addYears, differenceInCalendarDays, endOfMonth, format,
  isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths,
} from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Bell, Cake, CalendarDays, Check, ChevronLeft, ChevronRight, Pencil, Plus,
  SquareCheckBig, Trash2, type LucideIcon,
} from 'lucide-react'
import type { CalendarEntry, CalendarEntryType, Goal, GoalEntry } from '@/types'
import { dateKey, todayKey } from '@/lib/goal-stats'
import { GOAL_ICONS, goalColor } from './goal-meta'

const ENTRY_META: Record<CalendarEntryType, { icon: LucideIcon; label: string; text: string; dot: string }> = {
  birthday: { icon: Cake, label: 'Birthday', text: 'text-chart-5', dot: 'bg-chart-5' },
  event: { icon: CalendarDays, label: 'Event', text: 'text-chart-4', dot: 'bg-chart-4' },
  reminder: { icon: Bell, label: 'Reminder', text: 'text-primary', dot: 'bg-primary' },
  task: { icon: SquareCheckBig, label: 'Task', text: 'text-chart-3', dot: 'bg-chart-3' },
}

// Does this entry fall on the given day (accounting for yearly recurrence)?
function occursOn(entry: CalendarEntry, day: string): boolean {
  if (entry.date === day) return true
  return entry.recurs_annually && entry.date.slice(5) === day.slice(5) && entry.date <= day
}

// Next occurrence of an entry on/after today (for the upcoming list)
function nextOccurrence(entry: CalendarEntry, today: string): string | null {
  if (!entry.recurs_annually) return entry.date >= today ? entry.date : null
  const thisYear = `${today.slice(0, 4)}${entry.date.slice(4)}`
  if (thisYear >= today) return thisYear
  return dateKey(addYears(parseISO(thisYear), 1))
}

interface CalendarTabProps {
  goals: Goal[]
  goalEntries: GoalEntry[]
  entries: CalendarEntry[]
  createEntry: (e: Omit<CalendarEntry, 'id' | 'created_at'>) => Promise<void>
  updateEntry: (id: string, updates: Partial<Omit<CalendarEntry, 'id' | 'created_at'>>) => Promise<void>
  removeEntry: (id: string) => Promise<void>
}

export function CalendarTab({ goals, goalEntries, entries, createEntry, updateEntry, removeEntry }: CalendarTabProps) {
  const today = todayKey()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState(today)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CalendarEntry | null>(null)

  const goalById = useMemo(() => new Map(goals.map(g => [g.id, g])), [goals])

  // date -> goals achieved that day (value > 0)
  const achievedByDate = useMemo(() => {
    const map = new Map<string, Goal[]>()
    for (const e of goalEntries) {
      if (e.value <= 0) continue
      const goal = goalById.get(e.goal_id)
      if (!goal) continue
      const list = map.get(e.date) ?? []
      list.push(goal)
      map.set(e.date, list)
    }
    return map
  }, [goalEntries, goalById])

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const weeks = Math.ceil((differenceInCalendarDays(endOfMonth(month), gridStart) + 1) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i))

  // All-day entries first, then timed entries in time order
  const selectedEntries = entries
    .filter(e => occursOn(e, selected))
    .sort((a, b) => a.event_time.localeCompare(b.event_time))
  const selectedAchieved = achievedByDate.get(selected) ?? []

  const upcoming = useMemo(() => {
    return entries
      .map(e => ({ entry: e, on: nextOccurrence(e, today) }))
      .filter((x): x is { entry: CalendarEntry; on: string } => x.on !== null)
      .filter(x => differenceInCalendarDays(parseISO(x.on), parseISO(today)) <= 60)
      .sort((a, b) => a.on.localeCompare(b.on))
      .slice(0, 12)
  }, [entries, today])

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (entry: CalendarEntry) => { setEditing(entry); setDialogOpen(true) }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Calendar</h2>
          <p className="text-sm text-muted-foreground">Goal wins, birthdays, and everything coming up</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Add entry
        </Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        <Card className="py-4 px-4 gap-3">
          {/* Month header */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMonth(subMonths(month, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-semibold">{format(month, 'MMMM yyyy')}</span>
              {!isSameMonth(month, new Date()) && (
                <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => { setMonth(startOfMonth(new Date())); setSelected(today) }}>
                  Today
                </Button>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <span key={d}>{d}</span>)}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map(day => {
              const key = dateKey(day)
              const inMonth = isSameMonth(day, month)
              const achieved = achievedByDate.get(key) ?? []
              const dayEntries = entries.filter(e => occursOn(e, key))
              const isSelected = key === selected
              const isToday = key === today
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`min-h-14 sm:min-h-16 rounded-md border px-1 pt-1 pb-1.5 flex flex-col items-center gap-1 transition-colors text-left
                    ${isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'}
                    ${inMonth ? '' : 'opacity-35'}`}
                >
                  <span className={`text-xs leading-none w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground font-semibold' : ''}`}>
                    {format(day, 'd')}
                  </span>
                  {achieved.length > 0 && (
                    <span className="flex gap-0.5 flex-wrap justify-center">
                      {achieved.slice(0, 4).map(g => (
                        <span key={g.id} title={g.name} className={`w-1.5 h-1.5 rounded-full ${goalColor(g.color).solid}`} />
                      ))}
                    </span>
                  )}
                  {dayEntries.length > 0 && (
                    <span className="flex gap-0.5 items-center">
                      {dayEntries.slice(0, 3).map(e => {
                        const Icon = ENTRY_META[e.entry_type].icon
                        return <Icon key={e.id} className={`w-2.5 h-2.5 ${ENTRY_META[e.entry_type].text}`} />
                      })}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Card>

        <div className="space-y-4">
          {/* Selected day detail */}
          <Card className="py-4 px-4 gap-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold">{format(parseISO(selected), 'EEEE d MMMM')}</span>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            </div>

            {selectedAchieved.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Goals achieved</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedAchieved.map(g => {
                    const Icon = GOAL_ICONS[g.icon] ?? GOAL_ICONS.target
                    return (
                      <Badge key={g.id} variant="secondary" className="gap-1">
                        <Icon className={`w-3 h-3 ${goalColor(g.color).text}`} />
                        {g.name}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            )}

            {selectedEntries.length > 0 ? (
              <div className="space-y-2">
                {selectedEntries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={() => openEdit(entry)}
                    onToggleDone={() => updateEntry(entry.id, { is_done: !entry.is_done })}
                    onDelete={() => removeEntry(entry.id)}
                  />
                ))}
              </div>
            ) : selectedAchieved.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing on this day.</p>
            ) : null}
          </Card>

          {/* Upcoming */}
          <Card className="py-4 px-4 gap-2.5">
            <span className="font-display font-semibold">Coming up</span>
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing in the next 60 days. Add birthdays and events so they can't sneak up on you.</p>
            )}
            {upcoming.map(({ entry, on }) => {
              const Icon = ENTRY_META[entry.entry_type].icon
              const inDays = differenceInCalendarDays(parseISO(on), parseISO(today))
              return (
                <button
                  key={`${entry.id}-${on}`}
                  className="flex items-center gap-2.5 text-left hover:bg-muted rounded-md px-1.5 py-1 -mx-1.5 transition-colors"
                  onClick={() => { setSelected(on); setMonth(startOfMonth(parseISO(on))) }}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${ENTRY_META[entry.entry_type].text}`} />
                  <span className="text-sm truncate flex-1 min-w-0">{entry.title}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : format(parseISO(on), 'EEE d MMM')}
                    {entry.event_time && ` · ${entry.event_time}`}
                  </span>
                </button>
              )
            })}
          </Card>
        </div>
      </div>

      <EntryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editing}
        defaultDate={selected}
        onSave={async values => {
          if (editing) await updateEntry(editing.id, values)
          else await createEntry({ ...values, is_done: false, source: 'user' })
        }}
      />
    </div>
  )
}

function EntryRow({ entry, onEdit, onToggleDone, onDelete }: {
  entry: CalendarEntry
  onEdit: () => void
  onToggleDone: () => void
  onDelete: () => void
}) {
  const meta = ENTRY_META[entry.entry_type]
  const Icon = meta.icon
  const doneable = entry.entry_type === 'reminder' || entry.entry_type === 'task'
  return (
    <div className="flex items-start gap-2.5 group">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.text}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${entry.is_done ? 'line-through text-muted-foreground' : ''}`}>
          {entry.event_time && <span className="tabular-nums font-medium mr-1.5">{entry.event_time}</span>}
          {entry.title}
          {entry.recurs_annually && <span className="text-[10px] text-muted-foreground ml-1.5">yearly</span>}
          {entry.source !== 'user' && (
            <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 align-middle">
              {entry.source === 'droplet' ? 'assistant' : 'ai'}
            </Badge>
          )}
        </p>
        {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {doneable && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={entry.is_done ? 'Mark not done' : 'Mark done'} onClick={onToggleDone}>
            <Check className={`w-3.5 h-3.5 ${entry.is_done ? 'text-chart-3' : ''}`} />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Edit" onClick={onEdit}>
          <Pencil className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" title="Delete" onClick={onDelete}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  )
}

interface EntryFormValues {
  title: string
  date: string
  event_time: string
  entry_type: CalendarEntryType
  notes: string
  recurs_annually: boolean
}

function EntryFormDialog({ open, onOpenChange, entry, defaultDate, onSave }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: CalendarEntry | null
  defaultDate: string
  onSave: (values: EntryFormValues) => Promise<void>
}) {
  const [form, setForm] = useState<EntryFormValues>({
    title: '', date: defaultDate, event_time: '', entry_type: 'event', notes: '', recurs_annually: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastOpen, setLastOpen] = useState(false)

  // Reset form when the dialog opens (render-time state sync, no effect needed)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setError('')
      setForm(entry
        ? { title: entry.title, date: entry.date, event_time: entry.event_time, entry_type: entry.entry_type, notes: entry.notes, recurs_annually: entry.recurs_annually }
        : { title: '', date: defaultDate, event_time: '', entry_type: 'event', notes: '', recurs_annually: false })
    }
  }

  const set = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, title: form.title.trim() })
      onOpenChange(false)
    } catch (e) {
      console.error('Calendar entry save failed:', e)
      const msg = e instanceof Error ? e.message
        : e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message)
        : String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{entry ? 'Edit entry' : 'New calendar entry'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="entry-title">Title</Label>
            <Input id="entry-title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Mum's birthday" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.entry_type}
                onValueChange={v => {
                  const t = v as CalendarEntryType
                  setForm(prev => ({ ...prev, entry_type: t, recurs_annually: t === 'birthday' ? true : prev.recurs_annually }))
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ENTRY_META) as CalendarEntryType[]).map(t => (
                    <SelectItem key={t} value={t}>{ENTRY_META[t].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-date">Date</Label>
              <Input id="entry-date" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-time">Time <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="entry-time" type="time" value={form.event_time} onChange={e => set('event_time', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entry-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input id="entry-notes" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Gift ideas, links, details…" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.recurs_annually}
              onChange={e => set('recurs_annually', e.target.checked)}
              className="accent-[var(--primary)]"
            />
            Repeats every year
          </label>
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              Couldn't save: {error}
              {error.includes('column') && ' — this usually means a migration in supabase/ hasn\'t been run yet.'}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.title.trim()}>
              {saving ? 'Saving…' : entry ? 'Save changes' : 'Add to calendar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
