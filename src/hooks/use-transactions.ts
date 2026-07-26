import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { Transaction, CsvRow, Recurrence } from '@/types'

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    // PostgREST caps a single response at 1000 rows. The transaction table has
    // grown past that, so page through it — otherwise the oldest months silently
    // vanish from the dashboard, grid and cashflow chart.
    const pageSize = 1000
    const all: Transaction[] = []
    let error: unknown = null
    for (let from = 0; ; from += pageSize) {
      const { data, error: err } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .range(from, from + pageSize - 1)
      if (err) { error = err; break }
      all.push(...(data || []))
      if (!data || data.length < pageSize) break
    }
    if (error) console.error('Error fetching transactions:', error)
    else setTransactions(all)
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('transactions', fetch), [fetch])

  const getExistingNumbers = async (sourceId: string): Promise<Set<string>> => {
    const { data } = await supabase
      .from('transactions')
      .select('number')
      .eq('source_id', sourceId)
    return new Set((data || []).map(t => t.number))
  }

  const bulkInsert = async (sourceId: string, rows: CsvRow[]) => {
    // `number` is now a content-hash (see csv-parser.ts rowHash) so
    // collisions only happen for genuinely identical rows. Keep first occurrence.
    const seen = new Set<string>()
    const deduped = rows.filter(r => {
      if (seen.has(r.number)) return false
      seen.add(r.number)
      return true
    })

    const records = deduped.map(r => ({
      source_id: sourceId,
      number: r.number,
      date: r.date,
      account: r.account,
      amount: r.amount,
      category: r.category,
      subcategory: r.subcategory,
      memo: r.memo,
    }))

    const inserted: Transaction[] = []
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500)
      // Idempotent: if a (source_id, number) already exists, skip silently.
      const { data, error } = await supabase
        .from('transactions')
        .upsert(batch, { onConflict: 'source_id,number', ignoreDuplicates: true })
        .select()
      if (error) throw error
      if (data) inserted.push(...data)
    }

    emit('transactions')
    return inserted
  }

  const updateCategory = async (
    id: string,
    category: string,
    subcategory: string,
    recurring_item_id: string | null = null,
  ) => {
    setTransactions(prev =>
      prev.map(t => (t.id === id ? { ...t, category, subcategory, recurring_item_id } : t)),
    )
    const { error } = await supabase
      .from('transactions')
      .update({ category, subcategory, recurring_item_id })
      .eq('id', id)
    if (error) {
      await fetch()
      throw error
    }
    emit('transactions')
  }

  const bulkUpdateCategories = async (
    updates: Array<{ id: string; category: string; subcategory: string; recurring_item_id?: string | null }>,
  ) => {
    const map = new Map(updates.map(u => [u.id, u]))
    setTransactions(prev =>
      prev.map(t => {
        const u = map.get(t.id)
        if (!u) return t
        return {
          ...t,
          category: u.category,
          subcategory: u.subcategory,
          recurring_item_id: u.recurring_item_id ?? t.recurring_item_id,
        }
      }),
    )
    // PostgREST has no true bulk-update by-id; run sequentially in small batches
    for (const u of updates) {
      const patch: Record<string, unknown> = {
        category: u.category,
        subcategory: u.subcategory,
      }
      if (u.recurring_item_id !== undefined) patch.recurring_item_id = u.recurring_item_id
      const { error } = await supabase
        .from('transactions')
        .update(patch)
        .eq('id', u.id)
      if (error) {
        await fetch()
        throw error
      }
    }
    emit('transactions')
  }

  const setRecurrence = async (
    ids: string[],
    recurrence: Recurrence | null,
    recurrence_group: string,
    confidence: '' | 'detected' | 'llm' | 'manual' = 'manual',
  ) => {
    if (ids.length === 0) return
    setTransactions(prev =>
      prev.map(t =>
        ids.includes(t.id)
          ? { ...t, recurrence, recurrence_group, recurrence_confidence: confidence }
          : t,
      ),
    )
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      const { error } = await supabase
        .from('transactions')
        .update({ recurrence, recurrence_group, recurrence_confidence: confidence })
        .in('id', batch)
      if (error) {
        await fetch()
        throw error
      }
    }
    emit('transactions')
  }

  return {
    transactions, loading, refetch: fetch, getExistingNumbers, bulkInsert,
    updateCategory, bulkUpdateCategories, setRecurrence,
  }
}
