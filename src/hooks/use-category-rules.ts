import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { CategoryRule } from '@/types'

export function useCategoryRules() {
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('category_rules')
      .select('*')
      .order('match_count', { ascending: false })
    if (error) console.error('Error fetching category rules:', error)
    else setRules(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('category_rules', fetch), [fetch])

  const upsert = async (
    pattern: string,
    category: string,
    subcategory: string,
    source: 'llm' | 'manual',
  ) => {
    const { data: existing } = await supabase
      .from('category_rules')
      .select('id, match_count')
      .eq('pattern', pattern)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('category_rules')
        .update({
          category, subcategory, source,
          match_count: existing.match_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('category_rules').insert({
        pattern, category, subcategory, source, match_count: 1,
      })
      if (error) throw error
    }
    emit('category_rules')
  }

  const remove = async (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id))
    const { error } = await supabase.from('category_rules').delete().eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('category_rules')
  }

  return { rules, loading, refetch: fetch, upsert, remove }
}
