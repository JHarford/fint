import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Sparkles } from 'lucide-react'
import { parseQuickAdd, type ParsedEntry } from '@/lib/quick-add'
import { hasAnthropicKey } from '@/lib/coach'
import { celebrate } from '@/lib/celebrate'
import type { CalendarEntry } from '@/types'

// Natural-language entry box: type or dictate (keyboard mic on iOS) and the
// AI fills in the date, time, type and notes.
export function QuickAdd({ onCreate, onCreated }: {
  onCreate: (e: Omit<CalendarEntry, 'id' | 'created_at'>) => Promise<void>
  onCreated: (date: string) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!hasAnthropicKey()) return null

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError('')
    try {
      const parsed: ParsedEntry = await parseQuickAdd(trimmed)
      await onCreate({ ...parsed, is_done: false, source: 'ai' })
      setText('')
      onCreated(parsed.date)
      celebrate({
        title: `Added: ${parsed.title}`,
        subtitle: `${format(parseISO(parsed.date), 'EEE d MMM')}${parsed.event_time ? ` · ${parsed.event_time}` : ''}${parsed.end_date ? ` → ${format(parseISO(parsed.end_date), 'd MMM')}` : ''}`,
      })
    } catch (e) {
      console.error('Quick add failed:', e)
      setError(e instanceof Error ? e.message : 'Something went wrong — try rephrasing')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Sparkles className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-primary/60 pointer-events-none" />
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="Try: anniversary at 3pm on 28th August, dinner at the Royal Oak"
            className="h-9 pl-8 text-sm"
            disabled={busy}
          />
        </div>
        <Button size="sm" className="h-9" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
