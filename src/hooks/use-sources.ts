import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Source, SourceType } from '@/types'

export function useSources() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('sources')
      .select('*')
      .order('name')
    if (error) console.error('Error fetching sources:', error)
    else setSources(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const create = async (name: string, type: SourceType) => {
    const { error } = await supabase.from('sources').insert({ name, type })
    if (error) throw error
    await fetch()
  }

  const update = async (id: string, updates: Partial<Pick<Source, 'name' | 'type'>>) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
    const { error } = await supabase.from('sources').update(updates).eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
  }

  const remove = async (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id))
    const { error } = await supabase.from('sources').delete().eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
  }

  return { sources, loading, refetch: fetch, create, update, remove }
}
