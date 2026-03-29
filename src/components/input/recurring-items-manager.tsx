import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Sprout, Power, PowerOff } from 'lucide-react'
import { useRecurringItems } from '@/hooks/use-recurring-items'
import { useSources } from '@/hooks/use-sources'
import type { RecurringItem, Frequency } from '@/types'

const frequencyLabels: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
}

const categories = [
  'Income', 'Tax', 'Housing', 'Debt', 'Utilities', 'Insurance',
  'Savings', 'Subscriptions', 'Health', 'Budget', 'Business', 'Transport',
]

export function RecurringItemsManager() {
  const { items, loading, create, update, remove, seedDefaults } = useRecurringItems()
  const { sources } = useSources()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const [form, setForm] = useState({
    name: '',
    amount: '',
    next_date: '',
    frequency: 'monthly' as Frequency,
    category: '',
    is_spread: false,
    is_active: true,
    source_id: '' as string,
    target_source_id: '' as string,
    end_date: '',
    annual_increase: '',
  })

  const filteredItems = filterCategory === 'all'
    ? items
    : items.filter(i => i.category === filterCategory)

  const usedCategories = [...new Set(items.map(i => i.category))].sort()

  const getSourceName = (sourceId: string | null) => {
    if (!sourceId) return null
    return sources.find(s => s.id === sourceId)?.name ?? null
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.amount) return
    const data = {
      name: form.name,
      amount: parseFloat(form.amount),
      next_date: form.next_date || new Date().toISOString().split('T')[0],
      frequency: form.frequency,
      category: form.category,
      is_spread: form.is_spread,
      is_active: form.is_active,
      source_id: form.source_id && form.source_id !== 'none' ? form.source_id : null,
      target_source_id: form.target_source_id && form.target_source_id !== 'none' ? form.target_source_id : null,
      end_date: form.end_date || null,
      annual_increase: form.annual_increase ? parseFloat(form.annual_increase) : 0,
    }
    if (editingId) {
      await update(editingId, data)
    } else {
      await create(data)
    }
    resetForm()
  }

  const handleEdit = (item: RecurringItem) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      amount: String(item.amount),
      next_date: item.next_date,
      frequency: item.frequency,
      category: item.category,
      is_spread: item.is_spread,
      is_active: item.is_active,
      source_id: item.source_id || '',
      target_source_id: item.target_source_id || '',
      end_date: item.end_date || '',
      annual_increase: item.annual_increase ? String(item.annual_increase) : '',
    })
    setDialogOpen(true)
  }

  const resetForm = () => {
    setEditingId(null)
    setForm({ name: '', amount: '', next_date: '', frequency: 'monthly', category: '', is_spread: false, is_active: true, source_id: '', target_source_id: '', end_date: '', annual_increase: '' })
    setDialogOpen(false)
  }

  const toggleActive = async (item: RecurringItem) => {
    await update(item.id, { is_active: !item.is_active })
  }

  const totalMonthly = items
    .filter(i => i.is_active)
    .reduce((sum, i) => {
      let monthly = i.amount
      if (i.frequency === 'weekly') monthly = i.amount * 52 / 12
      else if (i.frequency === 'quarterly') monthly = i.amount / 3
      else if (i.frequency === 'annually') monthly = i.amount / 12
      return sum + monthly
    }, 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recurring Items</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Net monthly: <span className={totalMonthly < 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
              {formatCurrency(totalMonthly)}
            </span>
            {' '}({items.filter(i => i.is_active).length} active)
          </p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <Button variant="outline" size="sm" onClick={seedDefaults}>
              <Sprout className="w-4 h-4 mr-1" /> Seed Defaults
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open) }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Recurring Item' : 'Add Recurring Item'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Name</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Netflix" />
                </div>
                <div>
                  <Label>Amount (positive = expense, negative = income)</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="15.99" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Next Date</Label>
                    <Input type="date" value={form.next_date} onChange={e => setForm({ ...form, next_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>Frequency</Label>
                    <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v as Frequency })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annually">Annually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.category !== 'Income' && (
                    <div>
                      <Label>From (source)</Label>
                      <Select value={form.source_id} onValueChange={v => setForm({ ...form, source_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select source..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sources.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {form.category !== 'Income' && (
                    <div>
                      <Label>To (target)</Label>
                      <Select value={form.target_source_id} onValueChange={v => setForm({ ...form, target_source_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select target..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sources.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {form.category === 'Income' && (
                    <div>
                      <Label>Into (account)</Label>
                      <Select value={form.target_source_id} onValueChange={v => setForm({ ...form, target_source_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sources.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>Annual Increase (%)</Label>
                    <Input type="number" step="0.1" value={form.annual_increase} onChange={e => setForm({ ...form, annual_increase: e.target.value })} placeholder="e.g. 3" />
                  </div>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.is_spread} onChange={e => setForm({ ...form, is_spread: e.target.checked })} />
                    Spread across period
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                    Active
                  </label>
                </div>
                <Button onClick={handleSubmit} className="w-full">
                  {editingId ? 'Update' : 'Create'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {usedCategories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">No recurring items. Add items or seed with defaults.</p>
        ) : (
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Next Date</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map(item => (
                  <TableRow key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">
                      {item.name}
                      {item.is_spread && <Badge variant="outline" className="ml-2 text-xs">spread</Badge>}
                    </TableCell>
                    <TableCell className={item.amount < 0 ? 'text-green-600' : ''}>
                      {formatCurrency(item.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{frequencyLabels[item.frequency]}</Badge>
                    </TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      {getSourceName(item.source_id) ? (
                        <Badge variant="outline" className="text-xs">{getSourceName(item.source_id)}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getSourceName(item.target_source_id) ? (
                        <Badge variant="outline" className="text-xs">{getSourceName(item.target_source_id)}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>{item.next_date}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => toggleActive(item)} title={item.is_active ? 'Deactivate' : 'Activate'}>
                          {item.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(item.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
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
