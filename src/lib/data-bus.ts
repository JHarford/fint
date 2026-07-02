// Tiny in-process pubsub so independent hook instances can refetch when data
// changes elsewhere in the app. No infra, no realtime websocket.

export type Topic = 'transactions' | 'category_rules' | 'sources' | 'balances'
  | 'recurring_items' | 'debts' | 'assets' | 'savings_buckets'
  | 'future_obligations' | 'category_budgets'
  | 'goals' | 'goal_entries'

type Listener = () => void
const listeners = new Map<Topic, Set<Listener>>()

export function emit(topic: Topic) {
  const set = listeners.get(topic)
  if (!set) return
  for (const l of set) l()
}

export function subscribe(topic: Topic, listener: Listener) {
  let set = listeners.get(topic)
  if (!set) {
    set = new Set()
    listeners.set(topic, set)
  }
  set.add(listener)
  return () => { set!.delete(listener) }
}
