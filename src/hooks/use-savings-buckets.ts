import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { SavingsBucket } from '@/types'

export function useSavingsBuckets() {
  const [buckets, setBuckets] = useState<SavingsBucket[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('savings_buckets')
      .select('*')
      .order('created_at')
    if (error) console.error('Error fetching savings buckets:', error)
    else setBuckets(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('savings_buckets', fetch), [fetch])

  const create = async (bucket: Omit<SavingsBucket, 'id' | 'created_at'>) => {
    const { error } = await supabase.from('savings_buckets').insert(bucket)
    if (error) throw error
    await fetch()
    emit('savings_buckets')
  }

  const update = async (id: string, updates: Partial<Omit<SavingsBucket, 'id' | 'created_at'>>) => {
    setBuckets(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))
    const { error } = await supabase.from('savings_buckets').update(updates).eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('savings_buckets')
  }

  const remove = async (id: string) => {
    setBuckets(prev => prev.filter(b => b.id !== id))
    const { error } = await supabase.from('savings_buckets').delete().eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('savings_buckets')
  }

  return { buckets, loading, refetch: fetch, create, update, remove }
}
