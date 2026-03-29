import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useSources } from '@/hooks/use-sources'
import { useTransactions } from '@/hooks/use-transactions'
import { parseCsv, findDuplicates } from '@/lib/csv-parser'
import type { CsvRow } from '@/types'

export function CsvUpload() {
  const { sources } = useSources()
  const { getExistingNumbers, bulkInsert } = useTransactions()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([])
  const [newRows, setNewRows] = useState<CsvRow[]>([])
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'preview' | 'uploading' | 'done'>('idle')

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
    try {
      await bulkInsert(selectedSourceId, newRows)
      setStatus('done')
      // Reset after a moment
      setTimeout(() => {
        setStatus('idle')
        setParsedRows([])
        setNewRows([])
        setDuplicateCount(0)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }, 2000)
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

        {status === 'done' && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Successfully imported {newRows.length} transactions!
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
