import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useDebts } from '@/hooks/use-debts'
import { useRecurringItems } from '@/hooks/use-recurring-items'
import type { Debt, DebtType, RecurringItem } from '@/types'
import { addMonths, format } from 'date-fns'

const debtTypeLabels: Record<DebtType, string> = {
  loan: 'Loan',
  mortgage: 'Mortgage',
  tax: 'Tax',
  other: 'Other',
}

function calcPayoff(balance: number, item: RecurringItem | undefined, interestRate: number = 0): { date: string; months: number } | null {
  if (!item || item.amount <= 0) return null
  let monthly = item.amount
  if (item.frequency === 'weekly') monthly = item.amount * 52 / 12
  else if (item.frequency === 'quarterly') monthly = item.amount / 3
  else if (item.frequency === 'annually') monthly = item.amount / 12
  if (monthly <= 0) return null
  const monthlyRate = interestRate / 100 / 12
  let bal = balance
  let months = 0
  while (bal > 0 && months < 600) {
    bal += bal * monthlyRate
    bal -= monthly
    months++
  }
  if (bal > 0) return null
  return { date: format(addMonths(new Date(), months), 'MMM yyyy'), months }
}

export function DebtManager() {
  const { debts, loading, create, update, remove } = useDebts()
  const { items: recurringItems } = useRecurringItems()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    current_balance: '',
    recurring_item_id: '',
    type: 'loan' as DebtType,
    interest_rate: '',
    include_in_net_worth: true,
  })

  // Only show recurring items that are active expenses (positive amount = money going out)
  const linkableItems = recurringItems.filter(i => i.is_active && i.amount > 0)

  const getLinkedItem = (id: string | null) => recurringItems.find(i => i.id === id)

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.current_balance) return
    const data = {
      name: form.name,
      current_balance: parseFloat(form.current_balance),
      recurring_item_id: form.recurring_item_id || null,
      type: form.type,
      interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : 0,
      include_in_net_worth: form.include_in_net_worth,
    }
    if (editingId) {
      await update(editingId, data)
    } else {
      await create(data)
    }
    resetForm()
  }

  const handleEdit = (debt: Debt) => {
    setEditingId(debt.id)
    setForm({
      name: debt.name,
      current_balance: String(debt.current_balance),
      recurring_item_id: debt.recurring_item_id || '',
      type: debt.type,
      interest_rate: debt.interest_rate ? String(debt.interest_rate) : '',
      include_in_net_worth: debt.include_in_net_worth,
    })
    setDialogOpen(true)
  }

  const toggleNetWorth = async (debt: Debt) => {
    await update(debt.id, { include_in_net_worth: !debt.include_in_net_worth })
  }

  const resetForm = () => {
    setEditingId(null)
    setForm({ name: '', current_balance: '', recurring_item_id: '', type: 'loan', interest_rate: '', include_in_net_worth: true })
    setDialogOpen(false)
  }

  const totalDebt = debts.reduce((sum, d) => sum + d.current_balance, 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Debts</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Total: <span className="text-red-600 font-semibold">{formatCurrency(totalDebt)}</span>
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open) }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Debt</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Debt' : 'Add Debt'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Barclays Loan" />
              </div>
              <div>
                <Label>Current Balance</Label>
                <Input type="number" step="0.01" value={form.current_balance} onChange={e => setForm({ ...form, current_balance: e.target.value })} placeholder="50000" />
              </div>
              <div>
                <Label>Linked Payment</Label>
                <Select value={form.recurring_item_id} onValueChange={v => setForm({ ...form, recurring_item_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Link to payment..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked payment</SelectItem>
                    {linkableItems.map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} ({formatCurrency(item.amount)}/{item.frequency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as DebtType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="loan">Loan</SelectItem>
                      <SelectItem value="mortgage">Mortgage</SelectItem>
                      <SelectItem value="tax">Tax</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Interest Rate (%)</Label>
                  <Input type="number" step="0.01" value={form.interest_rate} onChange={e => setForm({ ...form, interest_rate: e.target.value })} placeholder="e.g. 6.9" />
                </div>
              </div>
              {form.recurring_item_id && form.recurring_item_id !== 'none' && form.current_balance && (() => {
                const rate = form.interest_rate ? parseFloat(form.interest_rate) : 0
                const payoff = calcPayoff(parseFloat(form.current_balance), recurringItems.find(i => i.id === form.recurring_item_id), rate)
                return payoff ? (
                  <p className="text-sm text-muted-foreground">
                    Estimated payoff: <span className="font-medium text-foreground">{payoff.date}</span>
                    {' '}({payoff.months} months)
                    {rate > 0 && <span className="text-xs"> at {rate}% APR</span>}
                  </p>
                ) : (
                  <p className="text-sm text-red-600">Payment doesn't cover interest — balance will never pay off</p>
                )
              })()}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.include_in_net_worth}
                  onChange={e => setForm({ ...form, include_in_net_worth: e.target.checked })}
                />
                Include in net worth calculation
              </label>
              <Button onClick={handleSubmit} className="w-full">
                {editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : debts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No debts tracked. Add your first debt.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Payoff</TableHead>
                <TableHead>Net Worth</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {debts.map(debt => {
                const linked = getLinkedItem(debt.recurring_item_id)
                const payoff = calcPayoff(debt.current_balance, linked, debt.interest_rate || 0)
                return (
                  <TableRow key={debt.id}>
                    <TableCell className="font-medium">{debt.name}</TableCell>
                    <TableCell className="text-red-600">{formatCurrency(debt.current_balance)}</TableCell>
                    <TableCell><Badge variant="secondary">{debtTypeLabels[debt.type]}</Badge></TableCell>
                    <TableCell>{debt.interest_rate ? `${debt.interest_rate}%` : '—'}</TableCell>
                    <TableCell>
                      {linked ? (
                        <span className="text-sm">{formatCurrency(linked.amount)}<span className="text-muted-foreground">/{linked.frequency.slice(0, 2)}</span></span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {payoff ? (
                        <span className="text-sm">{payoff.date} <span className="text-muted-foreground">({payoff.months}mo)</span></span>
                      ) : linked ? (
                        <span className="text-xs text-red-600">Won't pay off</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleNetWorth(debt)}
                        className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                          debt.include_in_net_worth
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {debt.include_in_net_worth ? 'Included' : 'Excluded'}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(debt)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(debt.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}
