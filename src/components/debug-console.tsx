// TEMPORARY debug console for diagnosing issues on mobile where devtools
// aren't available. Captures console.error/warn, window errors, and unhandled
// promise rejections, and shows them in a panel pinned to the bottom of the
// screen. Remove this component (and its mount in App.tsx) once done.
import { useEffect, useState } from 'react'

interface LogEntry {
  level: 'error' | 'warn'
  message: string
  time: string
}

function stringify(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function DebugConsole() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const push = (level: LogEntry['level'], parts: unknown[]) => {
      const message = parts.map(stringify).join(' ')
      const time = new Date().toTimeString().slice(0, 8)
      setEntries(prev => [...prev.slice(-49), { level, message, time }])
    }

    const origError = console.error
    const origWarn = console.warn
    console.error = (...args: unknown[]) => { origError(...args); push('error', args) }
    console.warn = (...args: unknown[]) => { origWarn(...args); push('warn', args) }

    const onError = (e: ErrorEvent) => push('error', [e.message])
    const onRejection = (e: PromiseRejectionEvent) => push('error', ['Unhandled rejection:', e.reason])
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      console.error = origError
      console.warn = origWarn
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  if (entries.length === 0) return null

  return (
    <div className="fixed bottom-16 md:bottom-2 inset-x-2 z-[60]">
      {open ? (
        <div className="bg-foreground text-background rounded-lg shadow-lg max-h-56 flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-background/20">
            <span className="text-xs font-semibold">Debug console ({entries.length})</span>
            <div className="flex gap-3">
              <button className="text-xs underline" onClick={() => setEntries([])}>Clear</button>
              <button className="text-xs underline" onClick={() => setOpen(false)}>Hide</button>
            </div>
          </div>
          <div className="overflow-y-auto px-3 py-2 space-y-1.5 text-[11px] font-mono leading-snug">
            {entries.slice().reverse().map((e, i) => (
              <p key={i} className={e.level === 'error' ? 'text-red-300' : 'text-amber-200'}>
                <span className="opacity-60">{e.time}</span> {e.message}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <button
          className="ml-auto block bg-foreground text-background text-xs font-medium rounded-full px-3 py-1.5 shadow-lg"
          onClick={() => setOpen(true)}
        >
          🐞 {entries.length} error{entries.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  )
}
