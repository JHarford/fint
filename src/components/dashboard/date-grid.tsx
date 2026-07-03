import { useState, useMemo, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react'
import { generateDateColumns, calculateColumnData, getLatestBalance } from '@/lib/calculations'
import { CATEGORIES, CATEGORY_META, UNCATEGORISED } from '@/lib/categories'

// Strip transaction-specific noise and titlecase so similar memos collapse to
// one readable row (e.g. "Prime Video*NH80G9By4, amzn.uk/bill" -> "Prime Video Amzn Uk").
function canonicaliseMemo(memo: string): string {
  if (!memo) return ''
  const cleaned = memo
    .replace(/\*\w+/g, ' ')          // drop "*REFCODE" suffixes
    .replace(/\d{2,}/g, ' ')         // drop long digit runs
    .replace(/[^A-Za-z\s&]/g, ' ')   // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned
    .split(' ')
    .slice(0, 3)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
import { differenceInMonths, differenceInWeeks, differenceInDays } from 'date-fns'
import type { ViewMode, Transaction, RecurringItem, AccountBalance, Debt, Source, FutureObligation, CategoryBudget } from '@/types'

interface DateGridProps {
  transactions: Transaction[]
  recurringItems: RecurringItem[]
  futureObligations: FutureObligation[]
  categoryBudgets: CategoryBudget[]
  balances: AccountBalance[]
  debts: Debt[]
  sources: Source[]
  forecastMonths: number
}

export function DateGrid({ transactions, recurringItems, futureObligations, categoryBudgets, balances, debts, sources, forecastMonths }: DateGridProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [debtsOpen, setDebtsOpen] = useState(true)
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set())
  const todayRef = useRef<HTMLDivElement>(null)

  const toggleCategory = (name: string) => setOpenCategories(prev => {
    const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next
  })
  const toggleSub = (key: string) => setOpenSubs(prev => {
    const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next
  })

  const startingBalance = useMemo(() => {
    let total = 0
    for (const source of sources) {
      const bal = getLatestBalance(balances, source.id)
      if (bal !== null) total += bal
    }
    return total
  }, [sources, balances])

  // History: scroll back as far as real transaction data goes. Convert the gap
  // between today and the earliest transaction date into the appropriate
  // period count for the current view mode.
  const historyPeriods = useMemo(() => {
    if (transactions.length === 0) return 7
    let earliest = transactions[0].date
    for (const t of transactions) if (t.date < earliest) earliest = t.date
    const days = Math.max(0, Math.ceil((Date.now() - new Date(earliest).getTime()) / 86_400_000))
    if (viewMode === 'daily') return Math.max(7, days + 1)
    if (viewMode === 'weekly') return Math.max(4, Math.ceil(days / 7) + 1)
    return Math.max(3, Math.ceil(days / 30.44) + 1)
  }, [transactions, viewMode])

  // Total columns = history + forecast
  const numColumns = useMemo(() => {
    if (viewMode === 'daily') return historyPeriods + forecastMonths * 30
    if (viewMode === 'weekly') return historyPeriods + Math.ceil(forecastMonths * 4.33)
    return historyPeriods + forecastMonths
  }, [viewMode, forecastMonths, historyPeriods])

  const columns = useMemo(
    () => generateDateColumns(viewMode, numColumns, historyPeriods),
    [viewMode, numColumns, historyPeriods]
  )

  const columnData = useMemo(
    () => calculateColumnData(columns, transactions, startingBalance, { debts, futureObligations, categoryBudgets }),
    [columns, transactions, startingBalance, debts, futureObligations, categoryBudgets]
  )

  // Build a hierarchical category → subcategory → item tree. Each level holds
  // a per-column amount sum. Items collapse by recurrence_group when tagged
  // (so "Prime Video*NH80G9By4" + similar all become one "Prime Video" row).
  // We also stash contributing transactions per cell for hover tooltips.
  type CellTx = { date: string; memo: string; amount: number; projected: boolean }
  const purchaseTree = useMemo(() => {
    void recurringItems  // legacy prop, no longer used
    type ItemNode = {
      name: string
      amounts: Map<number, number>
      cells: Map<number, CellTx[]>
      hasActual: boolean
      hasProjected: boolean
    }
    type SubNode = { name: string; items: Map<string, ItemNode>; amounts: Map<number, number>; cells: Map<number, CellTx[]> }
    type CatNode = { name: string; subs: Map<string, SubNode>; amounts: Map<number, number>; cells: Map<number, CellTx[]> }

    const tree = new Map<string, CatNode>()

    const bump = (
      colIdx: number,
      cat: string,
      sub: string,
      item: string,
      tx: CellTx,
    ) => {
      let c = tree.get(cat)
      if (!c) { c = { name: cat, subs: new Map(), amounts: new Map(), cells: new Map() }; tree.set(cat, c) }
      c.amounts.set(colIdx, (c.amounts.get(colIdx) ?? 0) + tx.amount)
      let cArr = c.cells.get(colIdx); if (!cArr) { cArr = []; c.cells.set(colIdx, cArr) }
      cArr.push(tx)

      let s = c.subs.get(sub)
      if (!s) { s = { name: sub, items: new Map(), amounts: new Map(), cells: new Map() }; c.subs.set(sub, s) }
      s.amounts.set(colIdx, (s.amounts.get(colIdx) ?? 0) + tx.amount)
      let sArr = s.cells.get(colIdx); if (!sArr) { sArr = []; s.cells.set(colIdx, sArr) }
      sArr.push(tx)

      let i = s.items.get(item)
      if (!i) { i = { name: item, amounts: new Map(), cells: new Map(), hasActual: false, hasProjected: false }; s.items.set(item, i) }
      i.amounts.set(colIdx, (i.amounts.get(colIdx) ?? 0) + tx.amount)
      let iArr = i.cells.get(colIdx); if (!iArr) { iArr = []; i.cells.set(colIdx, iArr) }
      iArr.push(tx)
      if (tx.projected) i.hasProjected = true; else i.hasActual = true
    }

    for (let colIdx = 0; colIdx < columnData.length; colIdx++) {
      const data = columnData[colIdx]
      for (const t of data.transactions) {
        const cat = t.category || UNCATEGORISED
        const sub = t.subcategory || '—'
        const item = t.recurrence_group || t.subcategory || canonicaliseMemo(t.memo) || t.memo || `Txn #${t.number}`
        bump(colIdx, cat, sub, item, { date: t.date, memo: t.memo, amount: t.amount, projected: false })
      }
      for (const p of data.projectedItems) {
        const cat = p.category || UNCATEGORISED
        const sub = p.subcategory || '—'
        bump(colIdx, cat, sub, p.name, { date: '(projected)', memo: p.name, amount: p.amount, projected: true })
      }
    }

    // Sort: categories by predefined order then alphabetical; subs/items by abs total
    const categoryOrder = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]))
    const totalAbs = (m: Map<number, number>) => Array.from(m.values()).reduce((a, b) => a + Math.abs(b), 0)
    return Array.from(tree.values())
      .sort((a, b) => {
        const ao = categoryOrder.get(a.name) ?? 999
        const bo = categoryOrder.get(b.name) ?? 999
        if (ao !== bo) return ao - bo
        return a.name.localeCompare(b.name)
      })
      .map(c => ({
        ...c,
        subs: Array.from(c.subs.values())
          .sort((a, b) => totalAbs(b.amounts) - totalAbs(a.amounts))
          .map(s => ({
            ...s,
            items: Array.from(s.items.values()).sort((a, b) => totalAbs(b.amounts) - totalAbs(a.amounts)),
          })),
      }))
  }, [columnData, recurringItems])

  const fmtTooltip = (txs: CellTx[] | undefined): string => {
    if (!txs || txs.length === 0) return ''
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
    return sorted
      .map(t => `${t.date}  ${t.amount < 0 ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}  ${t.memo.replace(/\s+/g, ' ').slice(0, 60)}${t.projected ? '  [projected]' : ''}`)
      .join('\n')
  }

  useEffect(() => {
    todayRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [viewMode])

  const todayIndex = columns.findIndex(c => !c.isPast)

  // Calculate projected debt balances per column
  const debtProjections = useMemo(() => {
    return debts.map(debt => {
      const linked = debt.recurring_item_id
        ? recurringItems.find(i => i.id === debt.recurring_item_id)
        : undefined
      let monthlyPayment = 0
      if (linked && linked.amount > 0) {
        if (linked.frequency === 'weekly') monthlyPayment = linked.amount * 52 / 12
        else if (linked.frequency === 'quarterly') monthlyPayment = linked.amount / 3
        else if (linked.frequency === 'annually') monthlyPayment = linked.amount / 12
        else monthlyPayment = linked.amount
      }
      const monthlyRate = (debt.interest_rate || 0) / 100 / 12

      // Forward: today → future. Compound interest, subtract payment, floor at 0.
      const futureBalances: number[] = []
      let fBal = debt.current_balance
      for (let m = 0; m <= forecastMonths; m++) {
        futureBalances.push(Math.max(0, fBal))
        if (fBal > 0) {
          fBal += fBal * monthlyRate
          fBal -= monthlyPayment
        }
      }

      // Backward: today → past. Invert the payment cycle so balance grows as we
      // walk back. previous = (current + payment) / (1 + rate). Stops growing if
      // we hit a reasonable cap so it doesn't spiral on long horizons.
      const pastBalances: number[] = [debt.current_balance]
      let pBal = debt.current_balance
      const HISTORY_CAP_MONTHS = 60
      for (let m = 1; m <= HISTORY_CAP_MONTHS; m++) {
        pBal = (pBal + monthlyPayment) / (1 + monthlyRate)
        if (pBal < 0) pBal = 0
        pastBalances.push(pBal)
      }

      const today = new Date()
      return columns.map(col => {
        const colMid = new Date((col.start.getTime() + col.end.getTime()) / 2)
        let monthsFromNow: number
        if (viewMode === 'daily') {
          monthsFromNow = differenceInDays(colMid, today) / 30
        } else if (viewMode === 'weekly') {
          monthsFromNow = differenceInWeeks(colMid, today) / 4.33
        } else {
          monthsFromNow = differenceInMonths(colMid, today)
        }
        if (monthsFromNow < 0) {
          const idx = Math.min(Math.round(Math.abs(monthsFromNow)), pastBalances.length - 1)
          return pastBalances[idx]
        }
        const idx = Math.min(Math.round(monthsFromNow), futureBalances.length - 1)
        return futureBalances[idx]
      })
    })
  }, [debts, recurringItems, columns, viewMode])

  return (
    <div className="space-y-4">
      {/* Main grid */}
      <div className="overflow-x-auto border rounded-lg">
        <div className="min-w-max">
          {/* Header row with view toggle on the right */}
          <div className="flex border-b bg-muted/50">
            <div className="w-36 sm:w-48 shrink-0 px-3 py-1.5 border-r sticky left-0 z-10 bg-background/60 backdrop-blur-sm flex items-center gap-1">
              {(['daily', 'weekly', 'monthly'] as ViewMode[]).map(mode => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 px-1.5 sm:px-2 text-xs"
                  onClick={() => setViewMode(mode)}
                >
                  <span className="sm:hidden">{mode === 'daily' ? 'D' : mode === 'weekly' ? 'W' : 'M'}</span>
                  <span className="hidden sm:inline">{mode === 'daily' ? 'Days' : mode === 'weekly' ? 'Weeks' : 'Months'}</span>
                </Button>
              ))}
            </div>
            {columns.map((col, i) => (
              <div
                key={i}
                ref={i === todayIndex ? todayRef : undefined}
                className={`w-28 shrink-0 px-2 py-2 text-center text-xs font-medium border-r ${
                  i === todayIndex ? 'bg-primary/10 font-bold' : col.isPast ? 'bg-muted/30' : ''
                }`}
              >
                {col.label}
                {i === todayIndex && (
                  <Badge variant="default" className="ml-1 text-[10px] px-1">Now</Badge>
                )}
              </div>
            ))}
          </div>

          {/* Cash Movement row */}
          <div className="flex border-b">
            <div className="w-36 sm:w-48 shrink-0 px-3 py-2 text-sm font-medium border-r bg-background/60 backdrop-blur-sm sticky left-0 z-10">Cash Movement</div>
            {columnData.map((data, i) => (
              <div
                key={i}
                className={`w-28 shrink-0 px-2 py-2 text-center text-xs border-r ${
                  i === todayIndex ? 'bg-primary/5' : ''
                }`}
              >
                <span className={data.cashMovement < 0 ? 'text-green-600' : data.cashMovement > 0 ? 'text-red-600' : ''}>
                  {formatCurrency(data.cashMovement)}
                </span>
              </div>
            ))}
          </div>

          {/* Running Balance row */}
          <div className="flex border-b">
            <div className="w-36 sm:w-48 shrink-0 px-3 py-2 text-sm font-medium border-r bg-background/60 backdrop-blur-sm sticky left-0 z-10">Running Balance</div>
            {columnData.map((data, i) => (
              <div
                key={i}
                className={`w-28 shrink-0 px-2 py-2 text-center text-xs font-semibold border-r ${
                  i === todayIndex ? 'bg-primary/5' : ''
                }`}
              >
                <span className={data.runningBalance >= 0 ? 'text-green-700' : 'text-red-700'}>
                  {formatCurrency(data.runningBalance)}
                </span>
              </div>
            ))}
          </div>

          {/* Movement % row */}
          <div className="flex border-b">
            <div className="w-36 sm:w-48 shrink-0 px-3 py-2 text-sm font-medium border-r bg-background/60 backdrop-blur-sm sticky left-0 z-10">Movement %</div>
            {columnData.map((data, i) => (
              <div
                key={i}
                className={`w-28 shrink-0 px-2 py-2 text-center text-xs border-r ${
                  i === todayIndex ? 'bg-primary/5' : ''
                }`}
              >
                {data.movementPercent !== 0 && (
                  <span className={`inline-flex items-center gap-0.5 ${data.cashMovement < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {data.cashMovement < 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {Math.abs(data.movementPercent).toFixed(1)}%
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Debts section (collapsible) */}
          {debts.length > 0 && (
            <Collapsible open={debtsOpen} onOpenChange={setDebtsOpen}>
              <CollapsibleTrigger asChild>
                <div className="flex border-b cursor-pointer hover:bg-muted/20">
                  <div className="w-36 sm:w-48 shrink-0 px-3 py-2 text-sm font-semibold border-r bg-background/60 backdrop-blur-sm flex items-center gap-1 sticky left-0 z-10">
                    {debtsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Debts
                  </div>
                  {columns.map((_, i) => (
                    <div key={i} className="w-28 shrink-0 border-r" />
                  ))}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {debts.map((debt, debtIdx) => (
                  <div key={debt.id} className="flex border-b">
                    <div className="w-36 sm:w-48 shrink-0 px-3 py-1 text-xs border-r pl-8 truncate sticky left-0 z-10 bg-background/60 backdrop-blur-sm" title={debt.name}>
                      {debt.name}
                    </div>
                    {columns.map((_, i) => {
                      const projected = debtProjections[debtIdx]?.[i] ?? debt.current_balance
                      return (
                        <div key={i} className={`w-28 shrink-0 px-2 py-1 text-center text-xs border-r ${i === todayIndex ? 'bg-primary/5' : ''} ${projected === 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(projected)}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* P&L tree: Category → Subcategory → Item */}
          {purchaseTree.map(cat => {
            const meta = CATEGORY_META[cat.name as keyof typeof CATEGORY_META] ?? CATEGORY_META[UNCATEGORISED]
            const Icon = meta.icon
            const isCatOpen = openCategories.has(cat.name)
            return (
              <div key={cat.name}>
                <div
                  className="flex border-b cursor-pointer hover:bg-muted/30 bg-muted/10"
                  onClick={() => toggleCategory(cat.name)}
                >
                  <div className="w-36 sm:w-48 shrink-0 px-3 py-1.5 text-sm font-semibold border-r bg-background/60 backdrop-blur-sm flex items-center gap-1.5 sticky left-0 z-10">
                    {isCatOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                    <span>{cat.name}</span>
                  </div>
                  {columns.map((_, i) => {
                    const amt = cat.amounts.get(i)
                    const tip = fmtTooltip(cat.cells.get(i))
                    return (
                      <div key={i} title={tip || undefined} className={`w-28 shrink-0 px-2 py-1.5 text-center text-xs font-semibold border-r ${i === todayIndex ? 'bg-primary/5' : ''} ${tip ? 'cursor-help' : ''}`}>
                        {amt != null && amt !== 0 && (
                          <span className={amt < 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(amt)}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {isCatOpen && cat.subs.map(sub => {
                  const subKey = `${cat.name}|${sub.name}`
                  const isSubOpen = openSubs.has(subKey)
                  return (
                    <div key={subKey}>
                      <div
                        className="flex border-b cursor-pointer hover:bg-muted/20"
                        onClick={() => toggleSub(subKey)}
                      >
                        <div className="w-36 sm:w-48 shrink-0 px-3 py-1 text-xs border-r bg-background/60 backdrop-blur-sm flex items-center gap-1 pl-8 sticky left-0 z-10">
                          {isSubOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          <span className="font-medium text-muted-foreground">{sub.name}</span>
                        </div>
                        {columns.map((_, i) => {
                          const amt = sub.amounts.get(i)
                          const tip = fmtTooltip(sub.cells.get(i))
                          return (
                            <div key={i} title={tip || undefined} className={`w-28 shrink-0 px-2 py-1 text-center text-xs border-r ${i === todayIndex ? 'bg-primary/5' : ''} ${tip ? 'cursor-help' : ''}`}>
                              {amt != null && amt !== 0 && (
                                <span className={`${amt < 0 ? 'text-green-600' : 'text-red-600'} opacity-80`}>{formatCurrency(amt)}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {isSubOpen && sub.items.map(item => (
                        <div key={item.name} className="flex border-b">
                          <div className="w-36 sm:w-48 shrink-0 px-3 py-1 text-xs border-r pl-14 truncate sticky left-0 z-10 bg-background/60 backdrop-blur-sm" title={item.name}>
                            {item.hasActual ? item.name : <span className="text-muted-foreground italic">{item.name}</span>}
                          </div>
                          {columns.map((_, i) => {
                            const amt = item.amounts.get(i)
                            const tip = fmtTooltip(item.cells.get(i))
                            return (
                              <div key={i} title={tip || undefined} className={`w-28 shrink-0 px-2 py-1 text-center text-xs border-r ${i === todayIndex ? 'bg-primary/5' : ''} ${tip ? 'cursor-help' : ''}`}>
                                {amt != null && amt !== 0 && (
                                  <span className={amt < 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(amt)}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
