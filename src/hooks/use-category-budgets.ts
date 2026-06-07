import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { CategoryBudget } from '@/types'

export function useCategoryBudgets() {
  const [budgets, setBudgets] = useState<CategoryBudget[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('category_budgets')
      .select('*')
      .order('category').order('subcategory')
    if (error) console.error('Error fetching category_budgets:', error)
    else setBudgets(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('category_budgets', fetch), [fetch])

  const upsert = async (category: string, subcategory: string, monthly_amount: number) => {
    const { error } = await supabase
      .from('category_budgets')
      .upsert({ category, subcategory, monthly_amount }, { onConflict: 'category,subcategory' })
    if (error) throw error
    emit('category_budgets')
  }

  const remove = async (id: string) => {
    setBudgets(prev => prev.filter(b => b.id !== id))
    const { error } = await supabase.from('category_budgets').delete().eq('id', id)
    if (error) { await fetch(); throw error }
    emit('category_budgets')
  }

  return { budgets, loading, refetch: fetch, upsert, remove }
}
