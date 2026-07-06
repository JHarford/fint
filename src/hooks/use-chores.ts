import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { Chore, ChoreLog } from '@/types'

export function useChores() {
  const [chores, setChores] = useState<Chore[]>([])
  const [logs, setLogs] = useState<ChoreLog[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const [c, l] = await Promise.all([
      supabase.from('chores').select('*').order('sort_order').order('created_at'),
      supabase.from('chore_logs').select('*').order('date', { ascending: false }).limit(2000),
    ])
    if (c.error) console.error('Error fetching chores:', c.error)
    else setChores(c.data || [])
    if (l.error) console.error('Error fetching chore logs:', l.error)
    else setLogs(l.data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('chore_logs', fetch), [fetch])
  useEffect(() => subscribe('chores', fetch), [fetch])

  const create = async (name: string) => {
    const { error } = await supabase.from('chores').insert({ name: name.trim(), sort_order: chores.length })
    if (error) throw error
    await fetch()
    emit('chores')
  }

  const remove = async (id: string) => {
    setChores(prev => prev.filter(c => c.id !== id))
    const { error } = await supabase.from('chores').delete().eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('chores')
  }

  // Toggle a chore done/not-done on a day. Optimistic, like goal entries.
  const toggle = async (choreId: string, date: string) => {
    const existing = logs.find(l => l.chore_id === choreId && l.date === date)
    if (existing) {
      setLogs(prev => prev.filter(l => l.id !== existing.id))
      const { error } = await supabase.from('chore_logs').delete().eq('id', existing.id)
      if (error) {
        await fetch()
        throw error
      }
    } else {
      setLogs(prev => [
        { id: `optimistic-${choreId}-${date}`, chore_id: choreId, date, created_at: '' },
        ...prev,
      ])
      const { error } = await supabase.from('chore_logs').upsert(
        { chore_id: choreId, date },
        { onConflict: 'chore_id,date' },
      )
      if (error) {
        await fetch()
        throw error
      }
      await fetch() // pick up the real row id
    }
    emit('chore_logs')
  }

  return { chores, logs, loading, refetch: fetch, create, remove, toggle }
}
