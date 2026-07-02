import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { CalendarEntry } from '@/types'

export function useCalendarEntries() {
  const [entries, setEntries] = useState<CalendarEntry[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('calendar_entries')
      .select('*')
      .order('date')
    if (error) console.error('Error fetching calendar entries:', error)
    else setEntries(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('calendar_entries', fetch), [fetch])

  const create = async (entry: Omit<CalendarEntry, 'id' | 'created_at'>) => {
    const { error } = await supabase.from('calendar_entries').insert(entry)
    if (error) throw error
    await fetch()
    emit('calendar_entries')
  }

  const update = async (id: string, updates: Partial<Omit<CalendarEntry, 'id' | 'created_at'>>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
    const { error } = await supabase.from('calendar_entries').update(updates).eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('calendar_entries')
  }

  const remove = async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
    const { error } = await supabase.from('calendar_entries').delete().eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('calendar_entries')
  }

  return { entries, loading, refetch: fetch, create, update, remove }
}
