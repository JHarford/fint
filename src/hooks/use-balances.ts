import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { AccountBalance } from '@/types'

export function useBalances() {
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('account_balances')
      .select('*')
      .order('as_of_date', { ascending: false })
    if (error) console.error('Error fetching balances:', error)
    else setBalances(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const create = async (sourceId: string, balance: number, asOfDate: string) => {
    const { error } = await supabase.from('account_balances').insert({
      source_id: sourceId,
      balance,
      as_of_date: asOfDate,
    })
    if (error) throw error
    await fetch()
  }

  const remove = async (id: string) => {
    setBalances(prev => prev.filter(b => b.id !== id))
    const { error } = await supabase.from('account_balances').delete().eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
  }

  return { balances, loading, refetch: fetch, create, remove }
}
