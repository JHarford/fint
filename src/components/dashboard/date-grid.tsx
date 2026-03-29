import { useState, useMemo, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react'
import { generateDateColumns, calculateColumnData, getLatestBalance } from '@/lib/calculations'
import { differenceInMonths, differenceInWeeks, differenceInDays } from 'date-fns'
import type { ViewMode, Transaction, RecurringItem, AccountBalance, Debt, Source } from '@/types'

interface DateGridProps {
  transactions: Transaction[]
  recurringItems: RecurringItem[]
  balances: AccountBalance[]
  debts: Debt[]
  sources: Source[]
  forecastMonths: number
}

export function DateGrid({ transactions, recurringItems, balances, debts, sources, forecastMonths }: DateGridProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [debtsOpen, setDebtsOpen] = useState(true)
  const [purchasesOpen, setPurchasesOpen] = useState(true)
  const todayRef = useRef<HTMLDivElement>(null)

  const startingBalance = useMemo(() => {
    let total = 0
    for (const source of sources) {
      const bal = getLatestBalance(balances, source.id)
      if (bal !== null) total += bal
    }
    return total
  }, [sources, balances])

  // History periods (7) + forecast periods based on forecastMonths
  const numColumns = useMemo(() => {
    const history = 7
    if (viewMode === 'daily') return history + forecastMonths * 30
    if (viewMode === 'weekly') return history + Math.ceil(forecastMonths * 4.33)
    return history + forecastMonths
  }, [viewMode, forecastMonths])

  const columns = useMemo(
    () => generateDateColumns(viewMode, numColumns),
    [viewMode, numColumns]
  )

  const columnData = useMemo(
    () => calculateColumnData(columns, transactions, recurringItems, startingBalance, debts),
    [columns, transactions, recurringItems, startingBalance, debts]
  )

  // Build a unified row-based view: one row per unique item name, amounts placed in the right columns
  const purchaseRows = useMemo(() => {
    // Map: itemName -> { isProjected, amounts: Map<colIdx, number> }
    const rowMap = new Map<string, { isProjected: boolean; amounts: Map<number, number> }>()

    for (let colIdx = 0; colIdx < columnData.length; colIdx++) {
      const data = columnData[colIdx]

      // Actual transactions
      if (data.transactions.length > 0) {
        for (const t of data.transactions) {
          const name = t.memo || t.subcategory || `Txn #${t.number}`
          if (!rowMap.has(name)) {
            rowMap.set(name, { isProjected: false, amounts: new Map() })
          }
          const row = rowMap.get(name)!
          row.amounts.set(colIdx, (row.amounts.get(colIdx) || 0) + t.amount)
        }
      }

      // Projected items
      if (data.projectedItems.length > 0) {
        for (const p of data.projectedItems) {
          if (!rowMap.has(p.name)) {
            rowMap.set(p.name, { isProjected: true, amounts: new Map() })
          }
          const row = rowMap.get(p.name)!
          row.amounts.set(colIdx, (row.amounts.get(colIdx) || 0) + p.amount)
        }
      }
    }

    return Array.from(rowMap.entries()).map(([name, data]) => ({
      name,
      isProjected: data.isProjected,
      amounts: data.amounts,
    }))
  }, [columnData])

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

      // Simulate month by month to account for interest
      const monthlyBalances: number[] = []
      let bal = debt.current_balance
      for (let m = 0; m <= forecastMonths; m++) {
        monthlyBalances.push(Math.max(0, bal))
        if (bal > 0) {
          bal += bal * monthlyRate
          bal -= monthlyPayment
        }
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
        if (monthsFromNow < 0) monthsFromNow = 0
        const idx = Math.min(Math.round(monthsFromNow), monthlyBalances.length - 1)
        return monthlyBalances[idx]
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
            <div className="w-48 shrink-0 px-3 py-1.5 border-r sticky left-0 z-10 bg-background/60 backdrop-blur-sm flex items-center gap-1">
              {(['daily', 'weekly', 'monthly'] as ViewMode[]).map(mode => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setViewMode(mode)}
                >
                  {mode === 'daily' ? 'Days' : mode === 'weekly' ? 'Weeks' : 'Months'}
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
            <div className="w-48 shrink-0 px-3 py-2 text-sm font-medium border-r bg-background/60 backdrop-blur-sm sticky left-0 z-10">Cash Movement</div>
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
            <div className="w-48 shrink-0 px-3 py-2 text-sm font-medium border-r bg-background/60 backdrop-blur-sm sticky left-0 z-10">Running Balance</div>
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
            <div className="w-48 shrink-0 px-3 py-2 text-sm font-medium border-r bg-background/60 backdrop-blur-sm sticky left-0 z-10">Movement %</div>
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
                  <div className="w-48 shrink-0 px-3 py-2 text-sm font-semibold border-r bg-background/60 backdrop-blur-sm flex items-center gap-1 sticky left-0 z-10">
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
                    <div className="w-48 shrink-0 px-3 py-1 text-xs border-r pl-8 truncate sticky left-0 z-10 bg-background/60 backdrop-blur-sm" title={debt.name}>
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

          {/* Purchases section (collapsible) — one row per unique item */}
          <Collapsible open={purchasesOpen} onOpenChange={setPurchasesOpen}>
            <CollapsibleTrigger asChild>
              <div className="flex border-b cursor-pointer hover:bg-muted/20">
                <div className="w-48 shrink-0 px-3 py-2 text-sm font-semibold border-r bg-background/60 backdrop-blur-sm flex items-center gap-1 sticky left-0 z-10">
                  {purchasesOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Purchases
                </div>
                {columns.map((_, i) => (
                  <div key={i} className="w-28 shrink-0 border-r" />
                ))}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {purchaseRows.map(row => (
                <div key={row.name} className="flex border-b">
                  <div className="w-48 shrink-0 px-3 py-1 text-xs border-r pl-8 truncate sticky left-0 z-10 bg-background/60 backdrop-blur-sm" title={row.name}>
                    {row.isProjected ? (
                      <span className="text-muted-foreground italic">{row.name}</span>
                    ) : (
                      row.name
                    )}
                  </div>
                  {columns.map((_, colIdx) => {
                    const amount = row.amounts.get(colIdx)
                    return (
                      <div key={colIdx} className={`w-28 shrink-0 px-2 py-1 text-center text-xs border-r ${colIdx === todayIndex ? 'bg-primary/5' : ''}`}>
                        {amount != null && (
                          <span className={amount < 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(amount)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
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
