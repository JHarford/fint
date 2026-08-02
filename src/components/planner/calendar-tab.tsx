import { useMemo, useRef, useState } from 'react'
import {
  addDays, addMonths, differenceInCalendarDays, endOfMonth, format,
  isSameMonth, parseISO, startOfMonth, startOfWeek, subDays, subMonths,
} from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Bell, Cake, CalendarDays, Camera, Check, ChevronLeft, ChevronRight, Film,
  ImagePlus, Loader2, Minus, Pencil, Plus, Sparkles, SquareCheckBig, Trash2, X, type LucideIcon,
} from 'lucide-react'
import type { CalendarEntry, CalendarEntryType, Goal, GoalEntry, JournalDay } from '@/types'
import { dateKey, todayKey } from '@/lib/goal-stats'
import { compressToSquareJpeg } from '@/lib/image'
import { generateJournalPhoto } from '@/lib/journal-photo'
import { makeGif, shareOrDownload } from '@/lib/gif'
import { GOAL_ICONS, goalColor } from './goal-meta'
import { QuickAdd } from './quick-add'
import { ChoresOnDay } from './chores-card'
import { GoalsOnDay } from './goals-on-day'
import { CaloriesOnDay } from '@/components/calpal/calpal-today-card'

const ENTRY_META: Record<CalendarEntryType, { icon: LucideIcon; label: string; text: string; dot: string }> = {
  birthday: { icon: Cake, label: 'Birthday', text: 'text-chart-5', dot: 'bg-chart-5' },
  event: { icon: CalendarDays, label: 'Event', text: 'text-chart-4', dot: 'bg-chart-4' },
  reminder: { icon: Bell, label: 'Reminder', text: 'text-primary', dot: 'bg-primary' },
  task: { icon: SquareCheckBig, label: 'Task', text: 'text-chart-3', dot: 'bg-chart-3' },
}

type CalendarView = 'month' | 'week' | '3day'

import { nextOccurrence, occursOn } from '@/lib/calendar-utils'

interface CalendarTabProps {
  goals: Goal[]
  goalEntries: GoalEntry[]
  entries: CalendarEntry[]
  createEntry: (e: Omit<CalendarEntry, 'id' | 'created_at'>) => Promise<void>
  updateEntry: (id: string, updates: Partial<Omit<CalendarEntry, 'id' | 'created_at'>>) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  journalDays: JournalDay[]
  saveJournal: (day: string, updates: { note?: string; photo_data?: string }) => Promise<void>
}

export function CalendarTab({
  goals, goalEntries, entries, createEntry, updateEntry, removeEntry,
  journalDays, saveJournal,
}: CalendarTabProps) {
  const today = todayKey()
  const [view, setView] = useState<CalendarView>('month')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [windowStart, setWindowStart] = useState(() => dateKey(startOfWeek(new Date(), { weekStartsOn: 1 })))
  const [selected, setSelected] = useState(today)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CalendarEntry | null>(null)
  const [makingGif, setMakingGif] = useState(false)

  const goalById = useMemo(() => new Map(goals.map(g => [g.id, g])), [goals])
  const journalByDay = useMemo(() => new Map(journalDays.map(j => [j.day, j])), [journalDays])

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

  // Days visible in the current view
  const visibleDays = useMemo(() => {
    if (view === 'month') {
      const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
      const weeks = Math.ceil((differenceInCalendarDays(endOfMonth(month), gridStart) + 1) / 7)
      return Array.from({ length: weeks * 7 }, (_, i) => dateKey(addDays(gridStart, i)))
    }
    const count = view === 'week' ? 7 : 3
    return Array.from({ length: count }, (_, i) => dateKey(addDays(parseISO(windowStart), i)))
  }, [view, month, windowStart])

  const viewTitle = view === 'month'
    ? format(month, 'MMMM yyyy')
    : `${format(parseISO(visibleDays[0]), 'd MMM')} – ${format(parseISO(visibleDays[visibleDays.length - 1]), 'd MMM')}`

  const navigate = (dir: 1 | -1) => {
    if (view === 'month') setMonth(m => dir === 1 ? addMonths(m, 1) : subMonths(m, 1))
    else {
      const step = view === 'week' ? 7 : 3
      setWindowStart(w => dateKey(dir === 1 ? addDays(parseISO(w), step) : subDays(parseISO(w), step)))
    }
  }

  // + zooms in (month → week → 3day), − zooms out
  const zoomIn = () => {
    if (view === 'month') {
      setView('week')
      setWindowStart(dateKey(startOfWeek(parseISO(selected), { weekStartsOn: 1 })))
    } else if (view === 'week') {
      setView('3day')
      setWindowStart(dateKey(subDays(parseISO(selected), 1)))
    }
  }
  const zoomOut = () => {
    if (view === '3day') {
      setView('week')
      setWindowStart(dateKey(startOfWeek(parseISO(selected), { weekStartsOn: 1 })))
    } else if (view === 'week') {
      setView('month')
      setMonth(startOfMonth(parseISO(windowStart)))
    }
  }

  const goToToday = () => {
    setSelected(today)
    setMonth(startOfMonth(new Date()))
    setWindowStart(dateKey(view === '3day' ? subDays(new Date(), 1) : startOfWeek(new Date(), { weekStartsOn: 1 })))
  }

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

  // Photos within the visible period, for the GIF
  const photosInView = useMemo(() =>
    visibleDays
      .filter(d => view !== 'month' || isSameMonth(parseISO(d), month))
      .map(d => journalByDay.get(d))
      .filter((j): j is JournalDay => Boolean(j?.photo_data)),
  [visibleDays, journalByDay, view, month])

  const exportGif = async () => {
    setMakingGif(true)
    try {
      const blob = await makeGif(photosInView.map(j => j.photo_data))
      const label = view === 'month' ? format(month, 'yyyy-MM') : visibleDays[0]
      await shareOrDownload(blob, `lifeflow-${label}.gif`)
    } catch (e) {
      console.error('GIF export failed:', e)
    } finally {
      setMakingGif(false)
    }
  }

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (entry: CalendarEntry) => { setEditing(entry); setDialogOpen(true) }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Calendar</h2>
          <p className="text-sm text-muted-foreground hidden sm:block">Goal wins, memories, and everything coming up</p>
        </div>
        <div className="flex items-center gap-2">
          {photosInView.length >= 2 && (
            <Button variant="outline" size="sm" onClick={exportGif} disabled={makingGif} title={`GIF of ${photosInView.length} photos (0.2s each)`}>
              {makingGif ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Film className="w-4 h-4 mr-1" />}
              GIF
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Add entry
          </Button>
        </div>
      </div>

      <QuickAdd
        onCreate={createEntry}
        onCreated={date => {
          setSelected(date)
          setMonth(startOfMonth(parseISO(date)))
          setWindowStart(dateKey(startOfWeek(parseISO(date), { weekStartsOn: 1 })))
        }}
      />

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        <Card className="py-4 px-4 gap-3">
          {/* Period header with nav + zoom */}
          <div className="flex items-center justify-between gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-display text-base sm:text-lg font-semibold truncate">{viewTitle}</span>
              <Button variant="outline" size="sm" className="h-6 text-xs px-2 shrink-0" onClick={goToToday}>
                Today
              </Button>
            </div>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Zoom out" onClick={zoomOut} disabled={view === 'month'}>
                <Minus className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Zoom in" onClick={zoomIn} disabled={view === '3day'}>
                <Plus className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {view === 'month' ? (
            <MonthGrid
              days={visibleDays}
              month={month}
              today={today}
              selected={selected}
              achievedByDate={achievedByDate}
              entries={entries}
              journalByDay={journalByDay}
              onSelect={setSelected}
            />
          ) : (
            <DayRows
              days={visibleDays}
              today={today}
              selected={selected}
              achievedByDate={achievedByDate}
              entries={entries}
              journalByDay={journalByDay}
              big={view === '3day'}
              onSelect={setSelected}
            />
          )}
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

            <DayJournal
              day={selected}
              journal={journalByDay.get(selected)}
              save={saveJournal}
            />

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

            <CaloriesOnDay day={selected} />
            <GoalsOnDay day={selected} />
            <ChoresOnDay day={selected} />

            {selectedEntries.length > 0 ? (
              <div className="space-y-2">
                {selectedEntries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={() => openEdit(entry)}
                    onToggleDone={() => updateEntry(entry.id, { is_done: !entry.is_done })}
                    onDelete={() => { if (window.confirm(`Delete "${entry.title}"?`)) removeEntry(entry.id) }}
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
                  onClick={() => {
                    setSelected(on)
                    setMonth(startOfMonth(parseISO(on)))
                    setWindowStart(dateKey(startOfWeek(parseISO(on), { weekStartsOn: 1 })))
                  }}
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
          const payload = { ...values, end_date: values.end_date || null }
          if (editing) await updateEntry(editing.id, payload)
          else await createEntry({ ...payload, is_done: false, source: 'user' })
        }}
      />
    </div>
  )
}

// ---- Month grid ----

function MonthGrid({ days, month, today, selected, achievedByDate, entries, journalByDay, onSelect }: {
  days: string[]
  month: Date
  today: string
  selected: string
  achievedByDate: Map<string, Goal[]>
  entries: CalendarEntry[]
  journalByDay: Map<string, JournalDay>
  onSelect: (day: string) => void
}) {
  return (
    <>
      <div className="grid grid-cols-7 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(key => {
          const day = parseISO(key)
          const inMonth = isSameMonth(day, month)
          const achieved = achievedByDate.get(key) ?? []
          const dayEntries = entries.filter(e => occursOn(e, key))
          const hasPhoto = Boolean(journalByDay.get(key)?.photo_data)
          const isSelected = key === selected
          const isToday = key === today
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`min-h-14 sm:min-h-16 rounded-md border px-1 pt-1 pb-1.5 flex flex-col items-center gap-1 transition-colors
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
              {(dayEntries.length > 0 || hasPhoto) && (
                <span className="flex gap-0.5 items-center">
                  {hasPhoto && <Camera className="w-2.5 h-2.5 text-muted-foreground" />}
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
    </>
  )
}

// ---- Week / 3-day rows: room for the photo and the diary line ----

function DayRows({ days, today, selected, achievedByDate, entries, journalByDay, big, onSelect }: {
  days: string[]
  today: string
  selected: string
  achievedByDate: Map<string, Goal[]>
  entries: CalendarEntry[]
  journalByDay: Map<string, JournalDay>
  big: boolean
  onSelect: (day: string) => void
}) {
  return (
    <div className="space-y-1.5">
      {days.map(key => {
        const day = parseISO(key)
        const journal = journalByDay.get(key)
        const achieved = achievedByDate.get(key) ?? []
        const dayEntries = entries
          .filter(e => occursOn(e, key))
          .sort((a, b) => a.event_time.localeCompare(b.event_time))
        const isSelected = key === selected
        const isToday = key === today
        const photoSize = big ? 'w-24 h-24 sm:w-28 sm:h-28' : 'w-16 h-16 sm:w-20 sm:h-20'
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`w-full text-left rounded-lg border px-2.5 py-2 flex gap-3 transition-colors
              ${isSelected ? 'border-primary bg-primary/10' : 'border-border/60 hover:bg-muted'}`}
          >
            <div className="flex flex-col items-center w-9 shrink-0 pt-0.5">
              <span className="text-[10px] uppercase text-muted-foreground">{format(day, 'EEE')}</span>
              <span className={`text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : ''}`}>
                {format(day, 'd')}
              </span>
            </div>

            {journal?.photo_data ? (
              <img src={journal.photo_data} alt="" className={`${photoSize} rounded-lg object-cover shrink-0`} />
            ) : (
              <div className={`${photoSize} rounded-lg bg-muted/60 flex items-center justify-center shrink-0`}>
                <Camera className="w-4 h-4 text-muted-foreground/40" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1 py-0.5">
              {journal?.note && (
                <p className={`italic text-muted-foreground leading-snug ${big ? 'text-sm' : 'text-xs'}`}>“{journal.note}”</p>
              )}
              {achieved.length > 0 && (
                <span className="flex gap-0.5">
                  {achieved.slice(0, 6).map(g => (
                    <span key={g.id} title={g.name} className={`w-1.5 h-1.5 rounded-full ${goalColor(g.color).solid}`} />
                  ))}
                </span>
              )}
              {dayEntries.slice(0, big ? 5 : 3).map(e => {
                const Icon = ENTRY_META[e.entry_type].icon
                return (
                  <p key={e.id} className="text-xs flex items-center gap-1.5 truncate">
                    <Icon className={`w-3 h-3 shrink-0 ${ENTRY_META[e.entry_type].text}`} />
                    {e.event_time && <span className="tabular-nums font-medium">{e.event_time}</span>}
                    <span className="truncate">{e.title}</span>
                  </p>
                )
              })}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ---- Daily journal: square photo + tweet-length note ----

function DayJournal({ day, journal, save }: {
  day: string
  journal: JournalDay | undefined
  save: (day: string, updates: { note?: string; photo_data?: string }) => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState(journal?.note ?? '')
  const [editingNote, setEditingNote] = useState(false)
  const [lastDay, setLastDay] = useState(day)
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // Sync local note state when the selected day changes
  if (day !== lastDay) {
    setLastDay(day)
    setNote(journal?.note ?? '')
    setEditingNote(false)
    setGenError(null)
  }

  // The AI photo is generated from the diary note, so a note is required.
  const noteForPhoto = (note.trim() || journal?.note || '').trim()

  const onGeneratePhoto = async () => {
    if (!noteForPhoto || generating) return
    setGenerating(true)
    setGenError(null)
    try {
      const photo_data = await generateJournalPhoto(noteForPhoto)
      await save(day, { photo_data })
    } catch (e) {
      console.error('Photo generation failed:', e)
      setGenError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const onPhotoPicked = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const photo_data = await compressToSquareJpeg(file)
      await save(day, { photo_data })
    } catch (e) {
      console.error('Photo save failed:', e)
    } finally {
      setBusy(false)
    }
  }

  const saveNote = async () => {
    const trimmed = note.trim().slice(0, 150)
    setEditingNote(false)
    if (trimmed === (journal?.note ?? '')) return
    try {
      await save(day, { note: trimmed })
    } catch (e) {
      console.error('Note save failed:', e)
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { onPhotoPicked(e.target.files?.[0]); e.target.value = '' }}
      />
      {journal?.photo_data ? (
        <div className="relative w-full max-w-[240px]">
          <img src={journal.photo_data} alt={`Photo from ${day}`} className="w-full aspect-square rounded-lg object-cover" />
          <div className="absolute top-1.5 right-1.5 flex gap-1">
            {noteForPhoto && (
              <button
                className="bg-foreground/60 text-background rounded-full p-1.5 disabled:opacity-50"
                title="Regenerate from note with AI"
                disabled={generating}
                onClick={onGeneratePhoto}
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              className="bg-foreground/60 text-background rounded-full p-1.5"
              title="Replace photo"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="w-3.5 h-3.5" />
            </button>
            <button
              className="bg-foreground/60 text-background rounded-full p-1.5"
              title="Remove photo"
              onClick={() => save(day, { photo_data: '' })}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={busy || generating} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Camera className="w-3.5 h-3.5 mr-1" />}
            Add photo of the day
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={!noteForPhoto || generating || busy}
            title={noteForPhoto ? 'Generate a photo from your note with AI' : 'Add a note first, then generate a photo from it'}
            onClick={onGeneratePhoto}
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
            Generate from note
          </Button>
        </div>
      )}
      {genError && <p className="text-[10px] text-destructive">{genError}</p>}

      {/* Saved note shows as plain wrapping text; tap it to edit */}
      {!editingNote && (journal?.note ?? '') !== '' ? (
        <button
          className="text-left w-full text-sm italic text-muted-foreground leading-snug hover:text-foreground transition-colors"
          title="Tap to edit"
          onClick={() => { setNote(journal?.note ?? ''); setEditingNote(true) }}
        >
          “{journal?.note}”
        </button>
      ) : (
        <div className="space-y-1">
          <textarea
            value={note}
            maxLength={150}
            rows={2}
            autoFocus={editingNote}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveNote() } }}
            placeholder="Dear diary… (150 chars)"
            className="w-full text-sm rounded-md border border-input bg-transparent px-3 py-2 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">{note.length}/150</p>
            <div className="flex gap-1.5">
              {editingNote && (
                <Button size="sm" className="h-7 text-xs" variant="ghost" onClick={() => { setNote(journal?.note ?? ''); setEditingNote(false) }}>
                  Cancel
                </Button>
              )}
              <Button size="sm" className="h-7 text-xs" variant="outline" onClick={saveNote} disabled={note.trim() === (journal?.note ?? '')}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
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
    <div className="flex items-start gap-2.5">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.text}`} />
      <button className="min-w-0 flex-1 text-left" onClick={onEdit} title="Tap to edit">
        <p className={`text-sm ${entry.is_done ? 'line-through text-muted-foreground' : ''}`}>
          {entry.event_time && <span className="tabular-nums font-medium mr-1.5">{entry.event_time}</span>}
          {entry.title}
          {entry.end_date && (
            <span className="text-[10px] text-muted-foreground ml-1.5">
              until {format(parseISO(entry.end_date), 'd MMM')}
            </span>
          )}
          {entry.recurs_annually && <span className="text-[10px] text-muted-foreground ml-1.5">yearly</span>}
          {entry.source !== 'user' && (
            <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 align-middle">
              {entry.source === 'droplet' ? 'assistant' : 'ai'}
            </Badge>
          )}
        </p>
        {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
      </button>
      <div className="flex items-center gap-0.5 shrink-0">
        {doneable && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title={entry.is_done ? 'Mark not done' : 'Mark done'} onClick={onToggleDone}>
            <Check className={`w-3.5 h-3.5 ${entry.is_done ? 'text-chart-3' : 'text-muted-foreground'}`} />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={onEdit}>
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Delete" onClick={onDelete}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  )
}

interface EntryFormValues {
  title: string
  date: string
  end_date: string // '' = single day
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
    title: '', date: defaultDate, end_date: '', event_time: '', entry_type: 'event', notes: '', recurs_annually: false,
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
        ? { title: entry.title, date: entry.date, end_date: entry.end_date ?? '', event_time: entry.event_time, entry_type: entry.entry_type, notes: entry.notes, recurs_annually: entry.recurs_annually }
        : { title: '', date: defaultDate, end_date: '', event_time: '', entry_type: 'event', notes: '', recurs_annually: false })
    }
  }

  const set = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    setError('')
    try {
      const end = form.end_date && form.end_date > form.date ? form.end_date : ''
      await onSave({ ...form, title: form.title.trim(), end_date: end })
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
          <DialogDescription className="sr-only">
            Add a birthday, event, reminder, or task to the calendar
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="entry-title">Title</Label>
            <Input id="entry-title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Mum's birthday" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3 *:min-w-0">
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
              <DatePicker id="entry-date" value={form.date} onChange={v => set('date', v)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-time">Time <span className="text-muted-foreground font-normal">(optional)</span></Label>
              {/* appearance-none stops iOS giving the time input a fixed
                  intrinsic width that overflows the 50% grid column */}
              <Input
                id="entry-time"
                type="time"
                value={form.event_time}
                onChange={e => set('event_time', e.target.value)}
                className="w-full min-w-0 appearance-none [&::-webkit-date-and-time-value]:text-left"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-end">Until <span className="text-muted-foreground font-normal">(multi-day)</span></Label>
              <DatePicker id="entry-end" value={form.end_date} onChange={v => set('end_date', v)} min={form.date} placeholder="Same day" allowClear />
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
