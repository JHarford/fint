import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sparkles, AlertCircle, CheckCircle2, Loader2, Wand2 } from 'lucide-react'
import { useTransactions } from '@/hooks/use-transactions'
import { useSources } from '@/hooks/use-sources'
import { useCategoryRules } from '@/hooks/use-category-rules'
import { categoriseTransactions, matchRule, runWithConcurrency, LLM_BATCH_SIZE, LLM_CONCURRENCY } from '@/lib/categoriser'
import { CATEGORIES, CATEGORY_META, UNCATEGORISED, categoryOrUncategorised } from '@/lib/categories'
import type { Transaction } from '@/types'

const PAGE_SIZE = 100

type Filter = 'all' | 'uncategorised' | (typeof CATEGORIES)[number]

export function Categoriser() {
  const { transactions, bulkUpdateCategories } = useTransactions()
  const { sources } = useSources()
  const { rules, refetch: refetchRules, upsert: upsertRule } = useCategoryRules()

  const [filter, setFilter] = useState<Filter>('uncategorised')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCategory, setBulkCategory] = useState<string>('')
  const [bulkSubcategory, setBulkSubcategory] = useState<string>('')
  const [edits, setEdits] = useState<Record<string, { category: string; subcategory: string }>>({})
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(0)

  const sourceMap = useMemo(() => Object.fromEntries(sources.map(s => [s.id, s.name])), [sources])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return transactions.filter(t => {
      if (filter === 'uncategorised' && t.category) return false
      if (filter !== 'all' && filter !== 'uncategorised' && t.category !== filter) return false
      if (s && !t.memo.toLowerCase().includes(s)) return false
      return true
    })
  }, [transactions, filter, search])

  useEffect(() => { setPage(0); setSelected(new Set()) }, [filter, search])

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE)
  const uncategorisedCount = useMemo(
    () => transactions.filter(t => !t.category).length,
    [transactions],
  )

  const getRow = (t: Transaction) => edits[t.id] ?? { category: t.category, subcategory: t.subcategory }
  const isDirty = (t: Transaction) => {
    const e = edits[t.id]
    return e && (e.category !== t.category || e.subcategory !== t.subcategory)
  }
  const dirtyCount = useMemo(
    () => Object.keys(edits).filter(id => {
      const t = transactions.find(x => x.id === id)
      if (!t) return false
      return edits[id].category !== t.category || edits[id].subcategory !== t.subcategory
    }).length,
    [edits, transactions],
  )

  const setEdit = (id: string, patch: Partial<{ category: string; subcategory: string }>) => {
    setEdits(prev => {
      const cur = prev[id] ?? { category: '', subcategory: '' }
      return { ...prev, [id]: { ...cur, ...patch } }
    })
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === visible.length) setSelected(new Set())
    else setSelected(new Set(visible.map(t => t.id)))
  }

  const applyBulk = () => {
    if (!bulkCategory || selected.size === 0) return
    const patch: Record<string, { category: string; subcategory: string }> = {}
    for (const id of selected) {
      const cur = edits[id] ?? transactions.find(t => t.id === id)
      patch[id] = {
        category: bulkCategory,
        subcategory: bulkSubcategory || (cur?.subcategory ?? ''),
      }
    }
    setEdits(prev => ({ ...prev, ...patch }))
  }

  const saveEdits = async () => {
    const updates = Object.entries(edits)
      .map(([id, v]) => {
        const t = transactions.find(x => x.id === id)
        if (!t) return null
        if (v.category === t.category && v.subcategory === t.subcategory) return null
        return { id, category: v.category, subcategory: v.subcategory, tx: t }
      })
      .filter((x): x is { id: string; category: string; subcategory: string; tx: Transaction } => x !== null)
    if (updates.length === 0) return
    try {
      setRunning(true)
      await bulkUpdateCategories(updates.map(u => ({ id: u.id, category: u.category, subcategory: u.subcategory })))
      // also store manual rules for memo patterns
      for (const u of updates) {
        const pattern = canonicalise(u.tx.memo)
        if (pattern) {
          try { await upsertRule(pattern, u.category, u.subcategory, 'manual') } catch (e) { console.warn(e) }
        }
      }
      await refetchRules()
      setEdits({})
      setSelected(new Set())
      setStatus(`Saved ${updates.length} updates`)
      setTimeout(() => setStatus(''), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setRunning(false)
    }
  }

  // Tidy up: group all transactions by canonical memo, find the most-common
  // (category, subcategory) per group, and apply that consistently. Fixes the
  // race-condition spread where parallel LLM batches tagged the same merchant
  // differently. Also writes a manual rule so future imports stay consistent.
  const runTidyUp = async () => {
    setError('')
    setRunning(true)
    try {
      const groups = new Map<string, Transaction[]>()
      for (const t of transactions) {
        if (!t.category) continue  // skip uncategorised — Auto-categorise handles those
        const key = canonicalise(t.memo)
        if (!key) continue
        const arr = groups.get(key) ?? []
        arr.push(t)
        groups.set(key, arr)
      }

      const updates: Array<{ id: string; category: string; subcategory: string }> = []
      const ruleWrites: Array<{ pattern: string; category: string; subcategory: string }> = []
      let consolidated = 0
      for (const [pattern, txs] of groups) {
        if (txs.length < 2) continue
        const pairCounts = new Map<string, number>()
        for (const t of txs) {
          const k = `${t.category}|${t.subcategory}`
          pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1)
        }
        const winnerKey = [...pairCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        const [winCat, winSub = ''] = winnerKey.split('|')
        let groupChanged = false
        for (const t of txs) {
          if (t.category !== winCat || t.subcategory !== winSub) {
            updates.push({ id: t.id, category: winCat, subcategory: winSub })
            groupChanged = true
          }
        }
        if (groupChanged) consolidated++
        ruleWrites.push({ pattern, category: winCat, subcategory: winSub })
      }

      if (updates.length > 0) await bulkUpdateCategories(updates)
      for (const rw of ruleWrites) {
        try { await upsertRule(rw.pattern, rw.category, rw.subcategory, 'manual') } catch (e) { console.warn(e) }
      }
      await refetchRules()
      setStatus(`Tidied ${consolidated} merchant groups (${updates.length} transactions updated, ${ruleWrites.length} rules saved)`)
      setTimeout(() => setStatus(''), 6000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tidy-up failed')
    } finally {
      setRunning(false)
    }
  }

  const runAutoCategorise = async () => {
    setError('')
    const targets = transactions.filter(t => !t.category && !edits[t.id]?.category)
    if (targets.length === 0) {
      setStatus('Nothing to categorise')
      setTimeout(() => setStatus(''), 2500)
      return
    }
    setRunning(true)
    try {
      // 1) cache hit pass (rules don't carry recurring_item_id — leave that to LLM)
      const ruleHits: Array<{ id: string; category: string; subcategory: string; tx: Transaction }> = []
      const needsLlm: Transaction[] = []
      for (const t of targets) {
        const m = matchRule(t.memo, rules)
        if (m) ruleHits.push({ id: t.id, category: m.category, subcategory: m.subcategory, tx: t })
        else needsLlm.push(t)
      }
      if (ruleHits.length > 0) {
        await bulkUpdateCategories(ruleHits.map(h => ({ id: h.id, category: h.category, subcategory: h.subcategory })))
      }

      // 2) LLM pass — concurrent batches
      const llmRules: Array<{ pattern: string; category: string; subcategory: string }> = []
      const batches: Transaction[][] = []
      for (let i = 0; i < needsLlm.length; i += LLM_BATCH_SIZE) {
        batches.push(needsLlm.slice(i, i + LLM_BATCH_SIZE))
      }
      let completed = 0
      setStatus(`LLM categorising 0/${needsLlm.length} (${batches.length} batches, ${Math.min(batches.length, LLM_CONCURRENCY)} parallel)…`)
      await runWithConcurrency(batches, LLM_CONCURRENCY, async (batch) => {
        const results = await categoriseTransactions(
          batch.map(t => ({ id: t.id, memo: t.memo, amount: t.amount })),
        )
        const updates = results.map(r => ({
          id: r.id,
          category: r.category,
          subcategory: r.subcategory,
        }))
        if (updates.length > 0) await bulkUpdateCategories(updates)
        for (const r of results) {
          if (r.pattern && r.pattern.length >= 3) {
            llmRules.push({ pattern: r.pattern.toUpperCase().trim(), category: r.category, subcategory: r.subcategory })
          }
        }
        completed += batch.length
        setStatus(`LLM categorising ${completed}/${needsLlm.length}…`)
      })
      // dedupe + upsert rules
      const ruleMap = new Map<string, { category: string; subcategory: string }>()
      for (const r of llmRules) ruleMap.set(r.pattern, { category: r.category, subcategory: r.subcategory })
      for (const [pattern, v] of ruleMap) {
        try { await upsertRule(pattern, v.category, v.subcategory, 'llm') } catch (e) { console.warn(e) }
      }
      await refetchRules()
      setStatus(`Categorised ${targets.length} transactions (${ruleHits.length} cache hit, ${needsLlm.length} via LLM)`)
      setTimeout(() => setStatus(''), 5000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Categorise failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span>Categorise Transactions</span>
          <div className="flex items-center gap-2 text-sm font-normal">
            <Badge variant="secondary">{uncategorisedCount} uncategorised</Badge>
            <Badge variant="outline">{rules.length} cached rules</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Button onClick={runAutoCategorise} disabled={running || uncategorisedCount === 0}>
            {running
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Working…</>
              : <><Sparkles className="w-4 h-4 mr-1" /> Auto-categorise {uncategorisedCount}</>}
          </Button>
          <Button variant="outline" onClick={runTidyUp} disabled={running} title="Consolidate inconsistent subcategories across the same merchant">
            <Wand2 className="w-4 h-4 mr-1" /> Tidy up
          </Button>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Filter:</span>
            <Select value={filter} onValueChange={v => setFilter(v as Filter)}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="uncategorised">Uncategorised</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input
            placeholder="Search memo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 w-56"
          />
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-2 border rounded-md bg-muted/30">
            <span className="text-sm">{selected.size} selected</span>
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Bulk category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Subcategory (optional)"
              value={bulkSubcategory}
              onChange={e => setBulkSubcategory(e.target.value)}
              className="h-8 w-48"
            />
            <Button size="sm" onClick={applyBulk} disabled={!bulkCategory}>Apply to selected</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        {status && (
          <div className="flex items-center gap-2 text-emerald-600 text-sm">
            <CheckCircle2 className="w-4 h-4" /> {status}
          </div>
        )}

        <div className="border rounded-md overflow-hidden">
          <div className="grid grid-cols-[36px_90px_1fr_90px_160px_180px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b">
            <input
              type="checkbox"
              checked={visible.length > 0 && selected.size === visible.length}
              onChange={toggleSelectAll}
            />
            <span>Date</span>
            <span>Memo</span>
            <span className="text-right">Amount</span>
            <span>Category</span>
            <span>Subcategory</span>
          </div>
          <div className="max-h-[600px] overflow-auto">
            {visible.map(t => {
              const row = getRow(t)
              const meta = CATEGORY_META[categoryOrUncategorised(row.category)]
              const Icon = meta.icon
              return (
                <div key={t.id} className={`grid grid-cols-[36px_90px_1fr_90px_160px_180px] gap-2 px-3 py-2 items-center border-b text-sm ${isDirty(t) ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleSelect(t.id)}
                  />
                  <span className="text-xs text-muted-foreground">{t.date}</span>
                  <span className="truncate" title={`${t.memo} — ${sourceMap[t.source_id] ?? ''}`}>
                    {t.memo} <span className="text-xs text-muted-foreground">· {sourceMap[t.source_id] ?? ''}</span>
                  </span>
                  <span className={`text-right tabular-nums ${t.amount < 0 ? 'text-emerald-600' : ''}`}>
                    {formatCurrency(t.amount)}
                  </span>
                  <Select value={row.category || UNCATEGORISED} onValueChange={v => setEdit(t.id, { category: v === UNCATEGORISED ? '' : v })}>
                    <SelectTrigger className="h-8">
                      <span className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNCATEGORISED}>{UNCATEGORISED}</SelectItem>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={row.subcategory}
                    onChange={e => setEdit(t.id, { subcategory: e.target.value })}
                    placeholder="e.g. Groceries"
                    className="h-8"
                  />
                </div>
              )
            })}
            {visible.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nothing matches.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Showing {visible.length} of {filtered.length}
            {filtered.length > visible.length && (
              <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={() => setPage(p => p + 1)}>
                Load more
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {dirtyCount > 0 && <Badge variant="default">{dirtyCount} pending</Badge>}
            <Button onClick={saveEdits} disabled={dirtyCount === 0 || running}>
              {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

// Strip transaction-specific noise so the rule is reusable.
function canonicalise(memo: string): string {
  return memo
    .toUpperCase()
    .replace(/\d{2,}/g, '')          // drop long digit runs (refs, dates)
    .replace(/[^A-Z\s&]/g, ' ')      // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)                     // first 3 words ~ merchant
    .join(' ')
}
