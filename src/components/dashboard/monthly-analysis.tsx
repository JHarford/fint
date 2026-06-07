import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Target } from 'lucide-react'
import { CATEGORIES, CATEGORY_META, UNCATEGORISED } from '@/lib/categories'
import type { Transaction, CategoryBudget } from '@/types'

interface Props {
  transactions: Transaction[]
  categoryBudgets: CategoryBudget[]
}

export function MonthlyAnalysis({ transactions, categoryBudgets }: Props) {
  const [offset, setOffset] = useState(0) // 0 = current month, -1 = previous, etc.

  const monthKey = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + offset)
    return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }) }
  }, [offset])

  const monthTxs = useMemo(() => {
    return transactions.filter(t => {
      const d = new Date(t.date)
      return d.getFullYear() === monthKey.year && d.getMonth() === monthKey.month
    })
  }, [transactions, monthKey])

  // Spend = positive amounts (money out). Income = negative.
  const spendByCategory = useMemo(() => {
    const map = new Map<string, { total: number; count: number; subBreakdown: Map<string, number> }>()
    for (const t of monthTxs) {
      if (t.amount <= 0) continue
      const cat = t.category || UNCATEGORISED
      const e = map.get(cat) ?? { total: 0, count: 0, subBreakdown: new Map() }
      e.total += t.amount
      e.count += 1
      const sub = t.subcategory || '(none)'
      e.subBreakdown.set(sub, (e.subBreakdown.get(sub) ?? 0) + t.amount)
      map.set(cat, e)
    }
    return Array.from(map.entries())
      .map(([cat, v]) => ({
        category: cat,
        total: v.total,
        count: v.count,
        subs: Array.from(v.subBreakdown.entries())
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total)
  }, [monthTxs])

  const totalSpend = useMemo(() => spendByCategory.reduce((a, b) => a + b.total, 0), [spendByCategory])
  const totalIncome = useMemo(
    () => monthTxs.filter(t => t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0),
    [monthTxs],
  )

  // Build budgets: per category total + per (category|subcategory) from category_budgets
  const budgets = useMemo(() => {
    const perCategory = new Map<string, number>()
    const perSub = new Map<string, number>()
    for (const b of categoryBudgets) {
      perCategory.set(b.category, (perCategory.get(b.category) ?? 0) + b.monthly_amount)
      if (b.subcategory) {
        perSub.set(`${b.category}|${b.subcategory}`, (perSub.get(`${b.category}|${b.subcategory}`) ?? 0) + b.monthly_amount)
      }
    }
    return { perCategory, perSub }
  }, [categoryBudgets])

  const totalBudget = useMemo(
    () => Array.from(budgets.perCategory.values()).reduce((a, b) => a + b, 0),
    [budgets],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset(o => o - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span>{monthKey.label}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset(o => o + 1)} disabled={offset >= 0}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm font-normal flex-wrap">
            <Badge variant="secondary" className="font-mono">{monthTxs.length} txs</Badge>
            <Badge variant="outline" className="text-emerald-600">+{formatCurrency(totalIncome)}</Badge>
            <Badge variant="outline" className="text-red-600">-{formatCurrency(totalSpend)}</Badge>
            <Badge variant="default">Net {formatCurrency(totalIncome - totalSpend)}</Badge>
            {totalBudget > 0 && (
              <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700 dark:text-amber-400">
                <Target className="w-3 h-3" />
                Budget {formatCurrency(totalBudget)}
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {spendByCategory.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">No spend recorded this month.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {spendByCategory.map(c => {
              const meta = CATEGORY_META[(CATEGORIES as readonly string[]).includes(c.category) ? c.category as (typeof CATEGORIES)[number] : UNCATEGORISED]
              const Icon = meta.icon
              const pct = totalSpend > 0 ? (c.total / totalSpend) * 100 : 0
              const catBudget = budgets.perCategory.get(c.category) ?? 0
              const catDelta = c.total - catBudget
              const catOverBudget = catBudget > 0 && catDelta > 0
              return (
                <div key={c.category} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-md ${meta.bg}`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{c.category}</div>
                        <div className="text-xs text-muted-foreground">{c.count} txs · {pct.toFixed(0)}%</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">{formatCurrency(c.total)}</div>
                      {catBudget > 0 && (
                        <div className={`text-xs tabular-nums ${catOverBudget ? 'text-red-600' : 'text-emerald-600'}`}>
                          {catOverBudget ? '+' : ''}{formatCurrency(catDelta)} vs {formatCurrency(catBudget)}
                        </div>
                      )}
                    </div>
                  </div>
                  {catBudget > 0 ? (
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden relative">
                      <div className={`h-full ${catOverBudget ? 'bg-red-500' : meta.bar}`} style={{ width: `${Math.min(100, (c.total / catBudget) * 100)}%` }} />
                    </div>
                  ) : (
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${meta.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  {c.subs.length > 0 && (
                    <div className="space-y-0.5 pt-1">
                      {c.subs.slice(0, 6).map(s => {
                        const subBudget = budgets.perSub.get(`${c.category}|${s.name}`) ?? 0
                        const subDelta = s.total - subBudget
                        const subOver = subBudget > 0 && subDelta > 0
                        return (
                          <div key={s.name} className="flex items-center justify-between text-xs">
                            <span className="truncate text-muted-foreground">{s.name}</span>
                            <span className="tabular-nums flex items-center gap-1.5">
                              <span className="text-muted-foreground">{formatCurrency(s.total)}</span>
                              {subBudget > 0 && (
                                <span className={`text-[10px] px-1 rounded ${subOver ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                                  / {formatCurrency(subBudget)}
                                </span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                      {c.subs.length > 6 && (
                        <div className="text-xs text-muted-foreground italic">+{c.subs.length - 6} more…</div>
                      )}
                    </div>
                  )}
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
