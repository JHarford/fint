import { useEffect, useRef, useState } from 'react'
import { Flame, PartyPopper, Trophy } from 'lucide-react'
import { onCelebrate, type Celebration } from '@/lib/celebrate'

const KIND_ICON = {
  done: PartyPopper,
  milestone: Flame,
  pb: Trophy,
} as const

// Animated toast that pops in from the top when something worth celebrating
// happens, then fades out on its own.
export function CelebrationToast() {
  const [current, setCurrent] = useState<Celebration | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => onCelebrate(c => {
    timers.current.forEach(clearTimeout)
    setCurrent(c)
    setLeaving(false)
    timers.current = [
      window.setTimeout(() => setLeaving(true), 2400),
      window.setTimeout(() => setCurrent(null), 2800),
    ]
  }), [])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  if (!current) return null
  const Icon = KIND_ICON[current.kind ?? 'done']

  return (
    <div className="fixed top-16 inset-x-0 z-[70] flex justify-center pointer-events-none px-4">
      <div
        className={`flex items-center gap-3 bg-primary text-primary-foreground rounded-full pl-3 pr-5 py-2.5 shadow-lg
          ${leaving ? 'animate-out fade-out slide-out-to-top-4 duration-400' : 'animate-in zoom-in-75 slide-in-from-top-4 duration-300'}`}
      >
        <span className="bg-primary-foreground/20 rounded-full p-1.5 animate-in spin-in-45 duration-500">
          <Icon className="w-4 h-4" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">{current.title}</p>
          {current.subtitle && <p className="text-xs opacity-85">{current.subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
