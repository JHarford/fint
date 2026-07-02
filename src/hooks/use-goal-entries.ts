import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { GoalEntry } from '@/types'

export function useGoalEntries() {
  const [entries, setEntries] = useState<GoalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('goal_entries')
      .select('*')
      .order('date', { ascending: false })
    if (error) console.error('Error fetching goal entries:', error)
    else setEntries(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('goal_entries', fetch), [fetch])

  // Insert or replace the entry for a goal on a given day
  const log = async (goalId: string, date: string, value: number, note = '') => {
    const { error } = await supabase
      .from('goal_entries')
      .upsert({ goal_id: goalId, date, value, note }, { onConflict: 'goal_id,date' })
    if (error) throw error
    await fetch()
    emit('goal_entries')
  }

  const remove = async (goalId: string, date: string) => {
    setEntries(prev => prev.filter(e => !(e.goal_id === goalId && e.date === date)))
    const { error } = await supabase
      .from('goal_entries')
      .delete()
      .eq('goal_id', goalId)
      .eq('date', date)
    if (error) {
      await fetch()
      throw error
    }
    emit('goal_entries')
  }

  return { entries, loading, refetch: fetch, log, remove }
}
