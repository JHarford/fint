import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Trash2 } from 'lucide-react'
import { useSources } from '@/hooks/use-sources'
import { useBalances } from '@/hooks/use-balances'

export function BalanceEntry() {
  const { sources } = useSources()
  const { balances, loading, create, remove } = useBalances()

  const [sourceId, setSourceId] = useState('')
  const [balance, setBalance] = useState('')
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])

  const handleSubmit = async () => {
    if (!sourceId || !balance) return
    await create(sourceId, parseFloat(balance), asOfDate)
    setBalance('')
  }

  const getSourceName = (id: string) => sources.find(s => s.id === id)?.name || 'Unknown'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Balances</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <Label>Account</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {sources.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Balance</Label>
            <Input
              type="number"
              step="0.01"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              placeholder="1234.56"
            />
          </div>
          <div>
            <Label>As of Date</Label>
            <Input
              type="date"
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
            />
          </div>
          <Button onClick={handleSubmit} disabled={!sourceId || !balance}>
            <Plus className="w-4 h-4 mr-1" /> Add Balance
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : balances.length === 0 ? (
          <p className="text-muted-foreground text-sm">No balance entries yet.</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>As of</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{getSourceName(b.source_id)}</TableCell>
                    <TableCell className={b.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(b.balance)}
                    </TableCell>
                    <TableCell>{b.as_of_date}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => remove(b.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}
