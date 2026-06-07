import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { FutureObligation } from '@/types'

export function useFutureObligations() {
  const [items, setItems] = useState<FutureObligation[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('future_obligations')
      .select('*')
      .order('next_date')
    if (error) console.error('Error fetching future_obligations:', error)
    else setItems(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('future_obligations', fetch), [fetch])

  const create = async (item: Omit<FutureObligation, 'id' | 'created_at'>) => {
    const { error } = await supabase.from('future_obligations').insert(item)
    if (error) throw error
    emit('future_obligations')
  }

  const update = async (id: string, patch: Partial<Omit<FutureObligation, 'id' | 'created_at'>>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
    const { error } = await supabase.from('future_obligations').update(patch).eq('id', id)
    if (error) { await fetch(); throw error }
    emit('future_obligations')
  }

  const remove = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    const { error } = await supabase.from('future_obligations').delete().eq('id', id)
    if (error) { await fetch(); throw error }
    emit('future_obligations')
  }

  return { items, loading, refetch: fetch, create, update, remove }
}
