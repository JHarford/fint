import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import { useFutureObligations } from '@/hooks/use-future-obligations'
import { useSources } from '@/hooks/use-sources'
import { CATEGORIES } from '@/lib/categories'
import type { FutureObligation, Recurrence } from '@/types'

const FREQUENCIES: Recurrence[] = ['weekly', 'monthly', 'quarterly', 'annually', 'one-off']
const FREQUENCY_LABELS: Record<Recurrence, string> = {
  weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly',
  annually: 'Annually', 'one-off': 'One-off',
}

interface FormState {
  name: string
  amount: string
  next_date: string
  frequency: Recurrence
  category: string
  subcategory: string
  source_id: string
  target_source_id: string
  end_date: string
  annual_increase: string
  notes: string
  is_active: boolean
}

const blankForm = (): FormState => ({
  name: '', amount: '', next_date: '', frequency: 'monthly',
  category: '', subcategory: '', source_id: '', target_source_id: '',
  end_date: '', annual_increase: '', notes: '', is_active: true,
})

export function FutureObligationsManager() {
  const { items, loading, create, update, remove } = useFutureObligations()
  const { sources } = useSources()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FutureObligation | null>(null)
  const [form, setForm] = useState<FormState>(blankForm())
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')

  const sourceById = Object.fromEntries(sources.map(s => [s.id, s.name]))

  const filtered = items.filter(i => {
    if (filterActive === 'active') return i.is_active
    if (filterActive === 'inactive') return !i.is_active
    return true
  })

  const startCreate = () => {
    setEditing(null); setForm(blankForm()); setOpen(true)
  }
  const startEdit = (o: FutureObligation) => {
    setEditing(o)
    setForm({
      name: o.name,
      amount: String(o.amount),
      next_date: o.next_date,
      frequency: o.frequency,
      category: o.category,
      subcategory: o.subcategory,
      source_id: o.source_id ?? '',
      target_source_id: o.target_source_id ?? '',
      end_date: o.end_date ?? '',
      annual_increase: o.annual_increase ? String(o.annual_increase) : '',
      notes: o.notes,
      is_active: o.is_active,
    })
    setOpen(true)
  }
  const submit = async () => {
    if (!form.name.trim() || !form.amount) return
    const payload = {
      name: form.name.trim(),
      amount: parseFloat(form.amount),
      next_date: form.next_date || new Date().toISOString().split('T')[0],
      frequency: form.frequency,
      category: form.category,
      subcategory: form.subcategory,
      is_active: form.is_active,
      source_id: form.source_id && form.source_id !== 'none' ? form.source_id : null,
      target_source_id: form.target_source_id && form.target_source_id !== 'none' ? form.target_source_id : null,
      end_date: form.end_date || null,
      annual_increase: form.annual_increase ? parseFloat(form.annual_increase) : 0,
      notes: form.notes,
    }
    if (editing) await update(editing.id, payload)
    else await create(payload)
    setOpen(false); setEditing(null); setForm(blankForm())
  }
  const toggleActive = (o: FutureObligation) => update(o.id, { is_active: !o.is_active })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Future Obligations</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={filterActive} onValueChange={v => setFilterActive(v as typeof filterActive)}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={startCreate}><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Forecast-only items with no actual transactions yet (school fees, planned income, etc.).
          Anything already happening in your imports is derived automatically from tagged recurring transactions.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No future obligations.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Next</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(o => (
                <TableRow key={o.id} className={o.is_active ? '' : 'opacity-50'}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell className={`tabular-nums ${o.amount < 0 ? 'text-emerald-600' : ''}`}>
                    {formatCurrency(o.amount)}
                  </TableCell>
                  <TableCell><Badge variant="outline">{FREQUENCY_LABELS[o.frequency as Recurrence] ?? o.frequency}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{o.next_date}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{o.end_date || '—'}</TableCell>
                  <TableCell className="text-xs">
                    {o.category}{o.subcategory ? ` / ${o.subcategory}` : ''}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {o.target_source_id
                      ? `→ ${sourceById[o.target_source_id] ?? ''}`
                      : o.source_id ? sourceById[o.source_id] : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => toggleActive(o)} title={o.is_active ? 'Deactivate' : 'Activate'}>
                        {o.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(o)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(o.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Future Obligation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Malvern College" />
              </div>
              <div>
                <Label>Amount (positive = out, negative = in)</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v as Recurrence })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Next date</Label>
                <Input type="date" value={form.next_date} onChange={e => setForm({ ...form, next_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subcategory (optional)</Label>
                <Input value={form.subcategory} onChange={e => setForm({ ...form, subcategory: e.target.value })} placeholder="e.g. Schools" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {parseFloat(form.amount || '0') >= 0 ? (
                <div>
                  <Label>From account (outgoing)</Label>
                  <Select value={form.source_id || 'none'} onValueChange={v => setForm({ ...form, source_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {sources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Into account (incoming)</Label>
                  <Select value={form.target_source_id || 'none'} onValueChange={v => setForm({ ...form, target_source_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {sources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>End date (optional)</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Annual increase % (inflation)</Label>
                <Input type="number" step="0.1" value={form.annual_increase} onChange={e => setForm({ ...form, annual_increase: e.target.value })} placeholder="0" />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                  Active
                </label>
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button onClick={submit} className="w-full" disabled={!form.name.trim() || !form.amount}>
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}
