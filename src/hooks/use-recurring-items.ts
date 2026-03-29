import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RecurringItem } from '@/types'
import { defaultRecurringItems } from '@/lib/seed-data'

export function useRecurringItems() {
  const [items, setItems] = useState<RecurringItem[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('recurring_items')
      .select('*')
      .order('category')
      .order('name')
    if (error) console.error('Error fetching recurring items:', error)
    else setItems(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const create = async (item: Omit<RecurringItem, 'id' | 'created_at'>) => {
    const { error } = await supabase.from('recurring_items').insert(item)
    if (error) throw error
    await fetch()
  }

  const update = async (id: string, updates: Partial<Omit<RecurringItem, 'id' | 'created_at'>>) => {
    // Optimistic update
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
    const { error } = await supabase.from('recurring_items').update(updates).eq('id', id)
    if (error) {
      await fetch() // Revert on error
      throw error
    }
  }

  const remove = async (id: string) => {
    // Optimistic remove
    setItems(prev => prev.filter(i => i.id !== id))
    const { error } = await supabase.from('recurring_items').delete().eq('id', id)
    if (error) {
      await fetch() // Revert on error
      throw error
    }
  }

  const seedDefaults = async () => {
    const { count } = await supabase
      .from('recurring_items')
      .select('*', { count: 'exact', head: true })

    if (count === 0) {
      const { error } = await supabase.from('recurring_items').insert(defaultRecurringItems)
      if (error) throw error
      await fetch()
    }
  }

  return { items, loading, refetch: fetch, create, update, remove, seedDefaults }
}
