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
import { useAssets } from '@/hooks/use-assets'
import type { AssetType } from '@/types'

const assetTypeLabels: Record<AssetType, string> = {
  property: 'Property',
  vehicle: 'Vehicle',
  investment: 'Investment',
  other: 'Other',
}

export function AssetManager() {
  const { assets, loading, create, update, remove } = useAssets()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    current_value: '',
    type: 'property' as AssetType,
    annual_change: '',
    include_in_net_worth: true,
  })

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.current_value) return
    const data = {
      name: form.name,
      current_value: parseFloat(form.current_value),
      type: form.type,
      annual_change: form.annual_change ? parseFloat(form.annual_change) : 0,
      include_in_net_worth: form.include_in_net_worth,
    }
    if (editingId) {
      await update(editingId, data)
    } else {
      await create(data)
    }
    resetForm()
  }

  const handleEdit = (asset: typeof assets[0]) => {
    setEditingId(asset.id)
    setForm({
      name: asset.name,
      current_value: String(asset.current_value),
      type: asset.type,
      annual_change: asset.annual_change ? String(asset.annual_change) : '',
      include_in_net_worth: asset.include_in_net_worth,
    })
    setDialogOpen(true)
  }

  const toggleNetWorth = async (asset: typeof assets[0]) => {
    await update(asset.id, { include_in_net_worth: !asset.include_in_net_worth })
  }

  const resetForm = () => {
    setEditingId(null)
    setForm({ name: '', current_value: '', type: 'property', annual_change: '', include_in_net_worth: true })
    setDialogOpen(false)
  }

  const totalValue = assets
    .filter(a => a.include_in_net_worth)
    .reduce((sum, a) => sum + a.current_value, 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Assets</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Total: <span className="text-green-600 font-semibold">{formatCurrency(totalValue)}</span>
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open) }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Asset</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Asset' : 'Add Asset'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. House, Car" />
              </div>
              <div>
                <Label>Current Value</Label>
                <Input type="number" step="0.01" value={form.current_value} onChange={e => setForm({ ...form, current_value: e.target.value })} placeholder="350000" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as AssetType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="property">Property</SelectItem>
                      <SelectItem value="vehicle">Vehicle</SelectItem>
                      <SelectItem value="investment">Investment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Annual Change (%)</Label>
                  <Input type="number" step="0.1" value={form.annual_change} onChange={e => setForm({ ...form, annual_change: e.target.value })} placeholder="e.g. 3 or -15" />
                </div>
              </div>
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
        ) : assets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No assets tracked. Add your first asset.</p>
        ) : (
          <>
          {/* Mobile: vertical card list — tap an asset to edit it */}
          <div className="md:hidden space-y-2">
            {assets.map(asset => (
              <div key={asset.id} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between gap-2 p-3 text-left active:bg-muted/50"
                  onClick={() => handleEdit(asset)}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{asset.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mr-1.5">{assetTypeLabels[asset.type]}</Badge>
                      {asset.annual_change ? (
                        <span className={asset.annual_change > 0 ? 'text-green-600' : 'text-red-600'}>
                          {asset.annual_change > 0 ? '+' : ''}{asset.annual_change}%/yr
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums text-green-600 shrink-0">{formatCurrency(asset.current_value)}</span>
                </button>
                <div className="flex items-center justify-between px-3 pb-1.5 -mt-1">
                  <button
                    onClick={() => toggleNetWorth(asset)}
                    className={`text-[10px] px-2 py-0.5 rounded ${asset.include_in_net_worth ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {asset.include_in_net_worth ? 'In net worth' : 'Excluded'}
                  </button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => remove(asset.id)}>
                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: full table */}
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Annual Change</TableHead>
                <TableHead>Net Worth</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map(asset => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.name}</TableCell>
                  <TableCell className="text-green-600">{formatCurrency(asset.current_value)}</TableCell>
                  <TableCell><Badge variant="secondary">{assetTypeLabels[asset.type]}</Badge></TableCell>
                  <TableCell>
                    {asset.annual_change ? (
                      <span className={asset.annual_change > 0 ? 'text-green-600' : 'text-red-600'}>
                        {asset.annual_change > 0 ? '+' : ''}{asset.annual_change}%
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleNetWorth(asset)}
                      className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                        asset.include_in_net_worth
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {asset.include_in_net_worth ? 'Included' : 'Excluded'}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(asset)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(asset.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}
