import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Transaction, CsvRow } from '@/types'

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
    if (error) console.error('Error fetching transactions:', error)
    else setTransactions(data || [])
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const getExistingNumbers = async (sourceId: string): Promise<Set<string>> => {
    const { data } = await supabase
      .from('transactions')
      .select('number')
      .eq('source_id', sourceId)
    return new Set((data || []).map(t => t.number))
  }

  const bulkInsert = async (sourceId: string, rows: CsvRow[]) => {
    const records = rows.map(r => ({
      source_id: sourceId,
      number: r.number,
      date: r.date,
      account: r.account,
      amount: r.amount,
      subcategory: r.subcategory,
      memo: r.memo,
    }))

    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500)
      const { error } = await supabase.from('transactions').insert(batch)
      if (error) throw error
    }

    await fetch()
  }

  return { transactions, loading, refetch: fetch, getExistingNumbers, bulkInsert }
}
