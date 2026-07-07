// Tiny navigation bus: lets one tab send the user to another tab with an
// optional follow-up action (e.g. CSV upload → Transactions + open the
// "Suggest recurring" dialog). The action is stored until the target tab
// mounts and consumes it, since tabs are lazy-mounted.

export interface NavIntent {
  tab: string
  action?: string
}

let pendingAction: string | null = null
const listeners = new Set<(i: NavIntent) => void>()

export function navigateTo(intent: NavIntent) {
  pendingAction = intent.action ?? null
  for (const l of listeners) l(intent)
}

export function onNavigate(listener: (i: NavIntent) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// One-shot: returns the pending action if it matches, and clears it.
export function consumePendingAction(action: string): boolean {
  if (pendingAction !== action) return false
  pendingAction = null
  return true
}

// Non-destructive check, for containers that route to a subtab before the
// component that actually consumes the action has mounted.
export function peekPendingAction(action: string): boolean {
  return pendingAction === action
}
