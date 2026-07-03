import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { CoachMessage } from '@/types'

export function useCoachMessages() {
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('coach_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) console.error('Error fetching coach messages:', error)
    else setMessages(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('coach_messages', fetch), [fetch])

  const create = async (message: Omit<CoachMessage, 'id' | 'created_at' | 'is_read'>) => {
    const { error } = await supabase.from('coach_messages').insert(message)
    if (error) throw error
    await fetch()
    emit('coach_messages')
  }

  const markRead = async (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m))
    const { error } = await supabase.from('coach_messages').update({ is_read: true }).eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('coach_messages')
  }

  return { messages, loading, refetch: fetch, create, markRead }
}
