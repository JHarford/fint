// Tiny event bus for celebration toasts (goal done, streak milestone, new PB)

export interface Celebration {
  title: string
  subtitle?: string
  kind?: 'done' | 'milestone' | 'pb'
}

type Listener = (c: Celebration) => void
const listeners = new Set<Listener>()

export function celebrate(c: Celebration) {
  for (const l of listeners) l(c)
}

export function onCelebrate(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
