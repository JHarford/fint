import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { WeightLog } from '@/types'

export function useWeightLogs() {
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('weight_logs')
      .select('*')
      .order('date', { ascending: false })
      .limit(730)
    if (error) console.error('Error fetching weight logs:', error)
    else setLogs(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('weight_logs', fetch), [fetch])

  // One weigh-in per day; re-logging the same day replaces it
  const logWeight = async (date: string, weightKg: number) => {
    setLogs(prev => [
      { id: `optimistic-${date}`, date, weight_kg: weightKg, created_at: '' },
      ...prev.filter(l => l.date !== date),
    ])
    const { error } = await supabase.from('weight_logs').upsert(
      { date, weight_kg: weightKg },
      { onConflict: 'date' },
    )
    if (error) {
      await fetch()
      throw error
    }
    await fetch()
    emit('weight_logs')
  }

  return { logs, loading, logWeight }
}
