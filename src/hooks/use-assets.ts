import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Asset } from '@/types'

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .order('name')
    if (error) console.error('Error fetching assets:', error)
    else setAssets(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const create = async (asset: Omit<Asset, 'id' | 'created_at'>) => {
    const { error } = await supabase.from('assets').insert(asset)
    if (error) throw error
    await fetch()
  }

  const update = async (id: string, updates: Partial<Omit<Asset, 'id' | 'created_at'>>) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
    const { error } = await supabase.from('assets').update(updates).eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
  }

  const remove = async (id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id))
    const { error } = await supabase.from('assets').delete().eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
  }

  return { assets, loading, refetch: fetch, create, update, remove }
}
