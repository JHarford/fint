import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  addDays, addMonths, differenceInCalendarDays, endOfMonth, format,
  isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function dateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

// Themed replacement for <input type="date"> — the native iOS picker ignores
// the app's look entirely. Opens a small centered panel over a blurred,
// 20%-tinted layer (same treatment as dialogs). Rendered via a portal so it
// escapes the dialog's CSS transform.
export function DatePicker({ value, onChange, min, placeholder = 'Pick a date', allowClear = false, id }: {
  value: string // YYYY-MM-DD or ''
  onChange: (value: string) => void
  min?: string
  placeholder?: string
  allowClear?: boolean
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => startOfMonth(value ? parseISO(value) : new Date()))

  const openPicker = () => {
    setMonth(startOfMonth(value ? parseISO(value) : min ? parseISO(min) : new Date()))
    setOpen(true)
  }

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const weeks = Math.ceil((differenceInCalendarDays(endOfMonth(month), gridStart) + 1) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i))
  const today = dateKey(new Date())

  const pick = (key: string) => {
    onChange(key)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={openPicker}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm',
          'shadow-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          value ? '' : 'text-muted-foreground',
        )}
      >
        <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="truncate flex-1 text-left">
          {value ? format(parseISO(value), 'EEE d MMM yyyy') : placeholder}
        </span>
        {allowClear && value && (
          <span
            role="button"
            aria-label="Clear date"
            className="text-muted-foreground hover:text-foreground -mr-1 p-1"
            onClick={e => { e.stopPropagation(); onChange('') }}
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[80]">
          {/* Same layering treatment as dialogs: light blur + 20% tint */}
          <div
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm animate-in fade-in-0 duration-150"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 top-[15%] flex justify-center px-6 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-[320px] rounded-xl border bg-background shadow-xl p-3 animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="flex items-center justify-between mb-2">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMonth(m => subMonths(m, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="font-display font-semibold text-sm">{format(month, 'MMMM yyyy')}</span>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMonth(m => addMonths(m, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-7 text-center text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <span key={d}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {days.map(d => {
                  const key = dateKey(d)
                  const disabled = Boolean(min && key < min)
                  const selected = key === value
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(key)}
                      className={cn(
                        'h-9 rounded-full text-sm tabular-nums transition-colors',
                        selected ? 'bg-primary text-primary-foreground font-semibold'
                          : key === today ? 'ring-1 ring-primary/50 hover:bg-muted'
                          : 'hover:bg-muted',
                        isSameMonth(d, month) ? '' : 'text-muted-foreground/40',
                        disabled && 'opacity-30 pointer-events-none',
                      )}
                    >
                      {format(d, 'd')}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t">
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs"
                  disabled={Boolean(min && today < min)}
                  onClick={() => pick(today)}
                >
                  Today
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
