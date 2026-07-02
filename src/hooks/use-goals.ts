import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { Goal } from '@/types'

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('sort_order')
      .order('created_at')
    if (error) console.error('Error fetching goals:', error)
    else setGoals(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('goals', fetch), [fetch])

  const create = async (goal: Omit<Goal, 'id' | 'created_at'>) => {
    const { error } = await supabase.from('goals').insert(goal)
    if (error) throw error
    await fetch()
    emit('goals')
  }

  const update = async (id: string, updates: Partial<Omit<Goal, 'id' | 'created_at'>>) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
    const { error } = await supabase.from('goals').update(updates).eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('goals')
  }

  const remove = async (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id))
    const { error } = await supabase.from('goals').delete().eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('goals')
    emit('goal_entries')
  }

  return { goals, loading, refetch: fetch, create, update, remove }
}
