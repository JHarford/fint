import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { AccountBalance } from '@/types'

export function useBalances() {
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    // Page through — daily balance logging grows this table past PostgREST's
    // 1000-row cap, and rows are newest-first, so a stale-but-latest snapshot for
    // an infrequently-updated account (e.g. an investment pot) would otherwise
    // fall off the end and vanish from net worth and the cashflow anchors.
    const pageSize = 1000
    const all: AccountBalance[] = []
    let error: unknown = null
    for (let from = 0; ; from += pageSize) {
      const { data, error: err } = await supabase
        .from('account_balances')
        .select('*')
        .order('as_of_date', { ascending: false })
        .range(from, from + pageSize - 1)
      if (err) { error = err; break }
      all.push(...(data || []))
      if (!data || data.length < pageSize) break
    }
    if (error) console.error('Error fetching balances:', error)
    else setBalances(all)
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
