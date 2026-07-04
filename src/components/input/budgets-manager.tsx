import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Target } from 'lucide-react'
import { useCategoryBudgets } from '@/hooks/use-category-budgets'
import { CATEGORIES, CATEGORY_META, type Category } from '@/lib/categories'
import type { CategoryBudget } from '@/types'

export function BudgetsManager() {
  const { budgets, loading, upsert, remove } = useCategoryBudgets()
  const [newCategory, setNewCategory] = useState<Category | ''>('')
  const [newSub, setNewSub] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})

  const grouped = useMemo(() => {
    const map = new Map<string, CategoryBudget[]>()
    for (const b of budgets) {
      const arr = map.get(b.category) ?? []
      arr.push(b)
      map.set(b.category, arr)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, list]) => ({
        category: cat,
        items: list.sort((a, b) => a.subcategory.localeCompare(b.subcategory)),
        total: list.reduce((s, b) => s + b.monthly_amount, 0),
      }))
  }, [budgets])

  const grandTotal = useMemo(
    () => budgets.reduce((s, b) => s + b.monthly_amount, 0),
    [budgets],
  )

  const addBudget = async () => {
    if (!newCategory || !newAmount) return
    await upsert(newCategory, newSub.trim(), parseFloat(newAmount))
    setNewCategory(''); setNewSub(''); setNewAmount('')
  }

  const saveEdit = async (b: CategoryBudget) => {
    const key = b.id
    const val = edits[key]
    if (val === undefined) return
    const n = parseFloat(val)
    if (isNaN(n)) return
    await upsert(b.category, b.subcategory, n)
    setEdits(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Budgets
          {grandTotal > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700 dark:text-amber-400">
              <Target className="w-3 h-3" /> {formatCurrency(grandTotal)}/mo total
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            A budget is what you <em>expect</em> to spend each month on a category
            (or one subcategory within it). LifeFlow uses them in two places:
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li><strong className="text-foreground font-medium">Monthly Analysis</strong> — each category shows spend vs budget, red when over.</li>
            <li><strong className="text-foreground font-medium">Cashflow forecast</strong> — with "Variable on", future months assume you spend the budget (minus anything already covered by recurring payments, so nothing is counted twice).</li>
          </ul>
          <p>Adding the same category + subcategory again overwrites the old amount.</p>
        </div>

        {/* Add row */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 p-3 border rounded-md bg-muted/30">
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={newCategory} onValueChange={v => setNewCategory(v as Category)}>
              <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue placeholder="Pick…" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subcategory (optional)</Label>
            <Input
              className="h-9 w-full sm:w-44"
              value={newSub}
              onChange={e => setNewSub(e.target.value)}
              placeholder="e.g. Eating Out"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">£/month</Label>
            <Input
              type="number"
              step="1"
              className="h-9 w-full sm:w-28"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              placeholder="270"
            />
          </div>
          <Button size="sm" onClick={addBudget} disabled={!newCategory || !newAmount} className="h-9">
            <Plus className="w-4 h-4 mr-1" /> Add / Update
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">No budgets set.</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(g => {
              const cat = CATEGORIES.includes(g.category as Category) ? g.category as Category : null
              const meta = cat ? CATEGORY_META[cat] : null
              const Icon = meta?.icon
              return (
                <div key={g.category} className="border rounded-md">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      {Icon && meta && (
                        <div className={`p-1.5 rounded ${meta.bg}`}>
                          <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                        </div>
                      )}
                      <span className="font-medium text-sm">{g.category}</span>
                      {g.items.some(b => !b.subcategory) && g.items.some(b => !!b.subcategory) && (
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">(rest of category) covers spend not listed below</span>
                      )}
                    </div>
                    <span className="text-sm tabular-nums">{formatCurrency(g.total)}/mo</span>
                  </div>
                  <div className="divide-y">
                    {g.items.map(b => {
                      const editVal = edits[b.id]
                      const dirty = editVal !== undefined && editVal !== String(b.monthly_amount)
                      return (
                        <div key={b.id} className="grid grid-cols-[1fr_90px_70px_32px] sm:grid-cols-[1fr_140px_90px_40px] gap-2 items-center px-3 py-2 text-sm">
                          <span className="text-muted-foreground">
                            {b.subcategory || (
                              <em className="text-xs">
                                {g.items.some(x => !!x.subcategory) ? '(rest of category)' : '(whole category)'}
                              </em>
                            )}
                          </span>
                          <Input
                            type="number"
                            step="1"
                            className="h-7 text-sm"
                            value={editVal ?? String(b.monthly_amount)}
                            onChange={e => setEdits(prev => ({ ...prev, [b.id]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant={dirty ? 'default' : 'ghost'}
                            className="h-7 text-xs"
                            disabled={!dirty}
                            onClick={() => saveEdit(b)}
                          >
                            {dirty ? 'Save' : 'Saved'}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => remove(b.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount)
}
