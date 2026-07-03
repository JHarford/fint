import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { JournalDay } from '@/types'

export function useJournalDays() {
  const [days, setDays] = useState<JournalDay[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('journal_days')
      .select('*')
      .order('day', { ascending: false })
    if (error) console.error('Error fetching journal:', error)
    else setDays(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('journal_days', fetch), [fetch])

  // Insert or update the journal row for a day (photo and/or note)
  const save = async (day: string, updates: { note?: string; photo_data?: string }) => {
    const { error } = await supabase
      .from('journal_days')
      .upsert({ day, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'day' })
    if (error) throw error
    await fetch()
    emit('journal_days')
  }

  const removePhoto = async (day: string) => save(day, { photo_data: '' })

  return { days, loading, refetch: fetch, save, removePhoto }
}
