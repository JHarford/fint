import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Debt } from '@/types'

export function useDebts() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('debts')
      .select('*')
      .order('name')
    if (error) console.error('Error fetching debts:', error)
    else setDebts(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const create = async (debt: Omit<Debt, 'id' | 'created_at'>) => {
    const { error } = await supabase.from('debts').insert(debt)
    if (error) throw error
    await fetch()
  }

  const update = async (id: string, updates: Partial<Omit<Debt, 'id' | 'created_at'>>) => {
    setDebts(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d))
    const { error } = await supabase.from('debts').update(updates).eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
  }

  const remove = async (id: string) => {
    setDebts(prev => prev.filter(d => d.id !== id))
    const { error } = await supabase.from('debts').delete().eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
  }

  return { debts, loading, refetch: fetch, create, update, remove }
}
