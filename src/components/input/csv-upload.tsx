import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Upload, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
import { useSources } from '@/hooks/use-sources'
import { useTransactions } from '@/hooks/use-transactions'
import { useCategoryRules } from '@/hooks/use-category-rules'
import { parseCsv, findDuplicates } from '@/lib/csv-parser'
import { navigateTo } from '@/lib/nav-bus'
import { categoriseTransactions, matchRule, runWithConcurrency, LLM_BATCH_SIZE, LLM_CONCURRENCY } from '@/lib/categoriser'
import type { CsvRow } from '@/types'

export function CsvUpload() {
  const { sources } = useSources()
  const { getExistingNumbers, bulkInsert, bulkUpdateCategories } = useTransactions()
  const { rules, upsert: upsertRule } = useCategoryRules()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([])
  const [newRows, setNewRows] = useState<CsvRow[]>([])
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'preview' | 'uploading' | 'categorising' | 'done'>('idle')
  const [categoriseStats, setCategoriseStats] = useState<{ cached: number; llm: number } | null>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    const file = e.target.files?.[0]
    if (!file || !selectedSourceId) return

    try {
      const text = await file.text()
      const rows = parseCsv(text)
      setParsedRows(rows)

      const existingNumbers = await getExistingNumbers(selectedSourceId)
      const result = findDuplicates(rows, existingNumbers)
      setNewRows(result.newRows)
      setDuplicateCount(result.duplicateCount)
      setStatus('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV')
    }
  }

  const handleConfirm = async () => {
    if (newRows.length === 0) return
    setStatus('uploading')
    setCategoriseStats(null)
    try {
      const inserted = await bulkInsert(selectedSourceId, newRows)

      // Auto-categorise only the rows that came back with no category set
      const toCategorise = inserted.filter(t => !t.category)
      if (toCategorise.length > 0) {
        setStatus('categorising')
        let cached = 0
        let llm = 0

        // Rule-cache pass
        const ruleUpdates: Array<{ id: string; category: string; subcategory: string }> = []
        const needsLlm = []
        for (const t of toCategorise) {
          const m = matchRule(t.memo, rules)
          if (m) {
            ruleUpdates.push({ id: t.id, category: m.category, subcategory: m.subcategory })
            cached++
          } else {
            needsLlm.push(t)
          }
        }
        if (ruleUpdates.length > 0) await bulkUpdateCategories(ruleUpdates)

        // LLM pass — concurrent batches. Recurrence tagging happens later via
        // the "Suggest Recurring" flow in the Transactions tab.
        const batches: typeof needsLlm[] = []
        for (let i = 0; i < needsLlm.length; i += LLM_BATCH_SIZE) {
          batches.push(needsLlm.slice(i, i + LLM_BATCH_SIZE))
        }
        await runWithConcurrency(batches, LLM_CONCURRENCY, async (batch) => {
          const results = await categoriseTransactions(
            batch.map(t => ({ id: t.id, memo: t.memo, amount: t.amount })),
          )
          const updates = results.map(r => ({
            id: r.id, category: r.category, subcategory: r.subcategory,
          }))
          if (updates.length > 0) await bulkUpdateCategories(updates)
          llm += updates.length
          for (const r of results) {
            if (r.pattern && r.pattern.length >= 3) {
              try { await upsertRule(r.pattern.toUpperCase().trim(), r.category, r.subcategory, 'llm') } catch (e) { console.warn(e) }
            }
          }
        })
        setCategoriseStats({ cached, llm })
      }

      setStatus('done')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload')
      setStatus('preview')
    }
  }

  const handleReset = () => {
    setStatus('idle')
    setParsedRows([])
    setNewRows([])
    setDuplicateCount(0)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV Upload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Select Source</Label>
          <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an account..." />
            </SelectTrigger>
            <SelectContent>
              {sources.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>CSV File</Label>
          <div className="flex gap-2 items-center mt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              disabled={!selectedSourceId}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer disabled:opacity-50"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Expected columns: Number, Date, Account, Amount, Subcategory, Memo
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {status === 'categorising' && (
          <div className="flex items-center gap-2 text-blue-600 text-sm">
            <Sparkles className="w-4 h-4 animate-pulse" />
            Auto-categorising {newRows.length} transactions and linking recurring items…
          </div>
        )}

        {status === 'done' && (
          <div className="space-y-2 border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 rounded-md p-3">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm flex-wrap">
              <CheckCircle2 className="w-4 h-4" />
              Imported {newRows.length} transactions
              {categoriseStats && (
                <span className="text-muted-foreground">
                  · {categoriseStats.cached} from cache, {categoriseStats.llm} via AI
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => navigateTo({ tab: 'finance', action: 'suggest-recurring' })}>
                <Sparkles className="w-3.5 h-3.5 mr-1" /> Review recurring suggestions
              </Button>
              <Button size="sm" variant="outline" onClick={handleReset}>Done</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tagging repeated payments as recurring is what powers the cashflow forecast.
            </p>
          </div>
        )}

        {status === 'preview' && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <Badge variant="secondary">{parsedRows.length} total rows</Badge>
              <Badge variant="default">{newRows.length} new</Badge>
              {duplicateCount > 0 && (
                <Badge variant="outline">{duplicateCount} duplicates (skipped)</Badge>
              )}
            </div>

            {newRows.length > 0 && (
              <>
                <div className="max-h-64 overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Subcategory</TableHead>
                        <TableHead>Memo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newRows.slice(0, 20).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{row.number}</TableCell>
                          <TableCell>{row.date}</TableCell>
                          <TableCell className={row.amount < 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(row.amount)}
                          </TableCell>
                          <TableCell>{row.subcategory}</TableCell>
                          <TableCell className="max-w-48 truncate">{row.memo}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {newRows.length > 20 && (
                  <p className="text-xs text-muted-foreground">Showing first 20 of {newRows.length} rows</p>
                )}
              </>
            )}

            <div className="flex gap-2">
              <Button onClick={handleConfirm} disabled={newRows.length === 0}>
                <Upload className="w-4 h-4 mr-1" /> Import {newRows.length} Transactions
              </Button>
              <Button variant="outline" onClick={handleReset}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}
