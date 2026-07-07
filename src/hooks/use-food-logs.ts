import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { FoodLog } from '@/types'

export function useFoodLogs() {
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) console.error('Error fetching food logs:', error)
    else setLogs(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('food_logs', fetch), [fetch])

  const add = async (date: string, name: string, calories: number, protein = 0, fat = 0) => {
    setLogs(prev => [
      { id: `optimistic-${Date.now()}`, date, name: name.trim(), calories, protein, fat, created_at: '' },
      ...prev,
    ])
    const { error } = await supabase.from('food_logs').insert({ date, name: name.trim(), calories, protein, fat })
    if (error) {
      await fetch()
      throw error
    }
    await fetch()
    emit('food_logs')
  }

  const remove = async (id: string) => {
    setLogs(prev => prev.filter(l => l.id !== id))
    const { error } = await supabase.from('food_logs').delete().eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('food_logs')
  }

  return { logs, loading, refetch: fetch, add, remove }
}
