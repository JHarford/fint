import {
  addDays,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  startOfDay,
  startOfWeek,
  startOfMonth,
  endOfDay,
  endOfWeek,
  endOfMonth,
  isWithinInterval,
  isBefore,
  isAfter,
  format,
  differenceInDays,
} from 'date-fns'
import type { RecurringItem, Transaction, ViewMode, AccountBalance, Debt, Frequency, FutureObligation, CategoryBudget, Recurrence } from '@/types'

export interface DateColumn {
  label: string
  start: Date
  end: Date
  isPast: boolean
}

export interface ProjectedItem {
  id: string
  name: string
  amount: number
  category: string
  subcategory: string
}

export interface ColumnData {
  cashMovement: number
  runningBalance: number
  movementPercent: number
  transactions: Transaction[]
  projectedItems: ProjectedItem[]
}

// Generate date columns based on view mode.
// `historyPeriods` controls how far back we render (in periods). Callers can
// compute it from the earliest transaction date so the grid scrolls back as
// far as real data exists.
export function generateDateColumns(viewMode: ViewMode, numColumns: number = 30, historyPeriods: number = 7): DateColumn[] {
  const today = startOfDay(new Date())
  const columns: DateColumn[] = []

  for (let i = -historyPeriods; i < numColumns - historyPeriods; i++) {
    let start: Date, end: Date, label: string

    if (viewMode === 'daily') {
      start = addDays(today, i)
      end = endOfDay(start)
      label = format(start, 'd MMM')
    } else if (viewMode === 'weekly') {
      start = startOfWeek(addWeeks(today, i), { weekStartsOn: 1 })
      end = endOfWeek(start, { weekStartsOn: 1 })
      label = format(start, 'd MMM')
    } else {
      start = startOfMonth(addMonths(today, i))
      end = endOfMonth(start)
      label = format(start, 'MMM yy')
    }

    columns.push({
      label,
      start,
      end,
      isPast: isBefore(end, today),
    })
  }

  return columns
}

// ---------- DERIVED-FROM-TRANSACTIONS PROJECTIONS ----------

export interface DerivedObligation {
  group: string                    // recurrence_group, used as both id + name
  frequency: Recurrence
  medianAmount: number             // signed (positive = out, negative = in)
  lastDate: Date
  category: string
  subcategory: string
}

// Build a forecast "spine" from the user's tagged recurring transactions.
// For each unique recurrence_group, take the most recent N occurrences, compute
// median amount, last date, and use the tagged frequency. We project from last
// date forward at that frequency.
export function deriveObligationsFromTransactions(transactions: Transaction[]): DerivedObligation[] {
  const byGroup = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (!t.recurrence || !t.recurrence_group || t.recurrence === 'one-off') continue
    const arr = byGroup.get(t.recurrence_group) ?? []
    arr.push(t)
    byGroup.set(t.recurrence_group, arr)
  }

  const out: DerivedObligation[] = []
  for (const [group, txs] of byGroup) {
    const freqCounts = new Map<Recurrence, number>()
    for (const t of txs) {
      if (t.recurrence && t.recurrence !== 'one-off') {
        freqCounts.set(t.recurrence, (freqCounts.get(t.recurrence) ?? 0) + 1)
      }
    }
    const freq = [...freqCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (!freq) continue

    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
    const recent = sorted.slice(-3)
    const amounts = recent.map(t => t.amount).sort((a, b) => a - b)
    const med = amounts.length % 2 === 0
      ? (amounts[amounts.length / 2 - 1] + amounts[amounts.length / 2]) / 2
      : amounts[Math.floor(amounts.length / 2)]

    const categoryCounts = new Map<string, number>()
    const subCounts = new Map<string, number>()
    for (const t of sorted) {
      if (t.category) categoryCounts.set(t.category, (categoryCounts.get(t.category) ?? 0) + 1)
      if (t.subcategory) subCounts.set(t.subcategory, (subCounts.get(t.subcategory) ?? 0) + 1)
    }

    out.push({
      group,
      frequency: freq,
      medianAmount: med,
      lastDate: new Date(sorted[sorted.length - 1].date),
      category: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
      subcategory: [...subCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    })
  }
  return out
}

// Project a derived obligation forward into a date range. The next occurrence
// after lastDate marks the start.
export function projectDerivedItems(
  obligations: DerivedObligation[],
  start: Date,
  end: Date,
): ProjectedItem[] {
  const result: ProjectedItem[] = []
  for (const o of obligations) {
    let date = getNextOccurrence(o.lastDate, o.frequency)
    let safety = 0
    while (isBefore(date, end) || isWithinInterval(date, { start, end })) {
      if (safety++ > 400) break
      if (isWithinInterval(date, { start, end })) {
        result.push({
          id: `derived-${o.group}`, name: o.group, amount: o.medianAmount,
          category: o.category, subcategory: o.subcategory,
        })
      }
      date = getNextOccurrence(date, o.frequency)
    }
  }
  return result
}

// Project category-budget variable spend into a date range. Treats each budget
// as a monthly target distributed evenly across days within the period.
export function projectCategoryBudgets(
  budgets: CategoryBudget[],
  start: Date,
  end: Date,
): ProjectedItem[] {
  const periodDays = differenceInDays(end, start) + 1
  const result: ProjectedItem[] = []
  for (const b of budgets) {
    if (b.monthly_amount <= 0) continue
    const perDay = b.monthly_amount / 30.44
    const amount = Math.round(perDay * periodDays * 100) / 100
    if (amount === 0) continue
    const label = b.subcategory || b.category
    result.push({
      id: `budget-${b.id}`, name: label, amount,
      category: b.category, subcategory: b.subcategory,
    })
  }
  return result
}

// Project future_obligations (school fees, planned income, etc.). Reuses the
// non-spread logic from the old recurring-item projector.
export function projectFutureObligations(
  obligations: FutureObligation[],
  start: Date,
  end: Date,
): ProjectedItem[] {
  const result: ProjectedItem[] = []
  const today = startOfDay(new Date())

  for (const o of obligations) {
    if (!o.is_active) continue
    const itemStart = new Date(o.next_date)
    if (isAfter(itemStart, end)) {
      if (o.frequency === 'one-off') continue
    }
    const endDate = o.end_date ? new Date(o.end_date) : null
    if (endDate && isAfter(start, endDate)) continue

    const rate = (o.annual_increase || 0) / 100
    const monthsFromNow = Math.max(0, (start.getTime() - today.getTime()) / (30.44 * 86400000))
    const effectiveAmount = o.amount * Math.pow(1 + rate, monthsFromNow / 12)

    if (o.frequency === 'one-off') {
      if (isWithinInterval(itemStart, { start, end })) {
        result.push({
          id: `future-${o.id}`, name: o.name, amount: effectiveAmount,
          category: o.category, subcategory: o.subcategory,
        })
      }
      continue
    }

    let date = new Date(o.next_date)
    while (isAfter(date, end)) date = getPreviousOccurrence(date, o.frequency)
    while (isAfter(date, start)) date = getPreviousOccurrence(date, o.frequency)
    let safety = 0
    while (isBefore(date, end) || isWithinInterval(date, { start, end })) {
      if (safety++ > 400) break
      if (isWithinInterval(date, { start, end }) && (!endDate || !isAfter(date, endDate))) {
        result.push({
          id: `future-${o.id}`, name: o.name, amount: effectiveAmount,
          category: o.category, subcategory: o.subcategory,
        })
      }
      date = getNextOccurrence(date, o.frequency)
    }
  }
  return result
}

// ---------- LEGACY: getProjectedItems(RecurringItem[]) — kept for unrefactored callers ----------

// Get all projected recurring items that fall within a date range
export function getProjectedItems(
  items: RecurringItem[],
  start: Date,
  end: Date
): ProjectedItem[] {
  const result: ProjectedItem[] = []
  const periodDays = differenceInDays(end, start) + 1

  const today = startOfDay(new Date())

  for (const item of items) {
    if (!item.is_active) continue

    // Skip items that haven't started yet (next_date is their earliest date)
    const itemStart = new Date(item.next_date)
    if (isAfter(itemStart, end)) continue

    // Skip items past their end date
    const endDate = item.end_date ? new Date(item.end_date) : null
    if (endDate && isAfter(start, endDate)) continue

    // Apply annual increase based on how far into the future we are
    const rate = (item.annual_increase || 0) / 100
    const monthsFromNow = Math.max(0, (start.getTime() - today.getTime()) / (30.44 * 24 * 60 * 60 * 1000))
    const effectiveAmount = item.amount * Math.pow(1 + rate, monthsFromNow / 12)

    if (item.is_spread) {
      // Spread items: distribute evenly across the period
      let amountPerDay: number
      if (item.frequency === 'weekly') {
        amountPerDay = effectiveAmount / 7
      } else if (item.frequency === 'monthly') {
        amountPerDay = effectiveAmount / 30
      } else if (item.frequency === 'quarterly') {
        amountPerDay = effectiveAmount / 91
      } else {
        amountPerDay = effectiveAmount / 365
      }
      const spreadAmount = Math.round(amountPerDay * periodDays * 100) / 100
      if (spreadAmount !== 0) {
        result.push({ id: item.id, name: item.name, amount: spreadAmount, category: item.category, subcategory: item.subcategory ?? '' })
      }
    } else {
      // Non-spread: check if any occurrence falls in the range
      let date = new Date(item.next_date)

      // Walk backwards to find earliest possible occurrence before our range
      while (isAfter(date, end)) {
        date = getPreviousOccurrence(date, item.frequency)
      }
      // Walk backwards more to catch all occurrences
      while (isAfter(date, start)) {
        date = getPreviousOccurrence(date, item.frequency)
      }

      // Now walk forward through all occurrences in range
      while (isBefore(date, end) || isWithinInterval(date, { start, end })) {
        if (isWithinInterval(date, { start, end })) {
          // Check end_date for each occurrence
          if (!endDate || !isAfter(date, endDate)) {
            result.push({ id: item.id, name: item.name, amount: effectiveAmount, category: item.category, subcategory: item.subcategory ?? '' })
          }
        }
        date = getNextOccurrence(date, item.frequency)
        // Safety: don't loop forever
        if (isAfter(date, addYears(end, 1))) break
      }
    }
  }

  return result
}

function getNextOccurrence(date: Date, frequency: string): Date {
  switch (frequency) {
    case 'weekly': return addWeeks(date, 1)
    case 'monthly': return addMonths(date, 1)
    case 'quarterly': return addQuarters(date, 1)
    case 'annually': return addYears(date, 1)
    default: return addMonths(date, 1)
  }
}

function getPreviousOccurrence(date: Date, frequency: string): Date {
  switch (frequency) {
    case 'weekly': return addWeeks(date, -1)
    case 'monthly': return addMonths(date, -1)
    case 'quarterly': return addQuarters(date, -1)
    case 'annually': return addYears(date, -1)
    default: return addMonths(date, -1)
  }
}

// Get transactions that fall within a date range
export function getTransactionsInRange(
  transactions: Transaction[],
  start: Date,
  end: Date
): Transaction[] {
  return transactions.filter(t => {
    const d = new Date(t.date)
    return isWithinInterval(d, { start, end })
  })
}

function toMonthlyAmount(amount: number, frequency: Frequency): number {
  if (frequency === 'weekly') return amount * 52 / 12
  if (frequency === 'quarterly') return amount / 3
  if (frequency === 'annually') return amount / 12
  return amount
}

// Build a set of recurring item IDs that are debt payments, with the month they'd be paid off
// (legacy — kept for backwards-compat with date-grid debt projections code).
function buildDebtPayoffMap(
  recurringItems: RecurringItem[],
  debts: Debt[],
): Map<string, number> {
  const payoffMap = new Map<string, number>() // recurring_item_id -> payoff month count from now
  for (const debt of debts) {
    if (!debt.recurring_item_id) continue
    const item = recurringItems.find(i => i.id === debt.recurring_item_id)
    if (!item || item.amount <= 0) continue
    const monthly = toMonthlyAmount(item.amount, item.frequency)
    if (monthly <= 0) continue
    const monthlyRate = (debt.interest_rate || 0) / 100 / 12
    let bal = debt.current_balance
    let months = 0
    while (bal > 0 && months < 600) {
      bal += bal * monthlyRate
      bal -= monthly
      months++
    }
    if (bal <= 0) {
      payoffMap.set(debt.recurring_item_id, months)
    }
  }
  return payoffMap
}
export { buildDebtPayoffMap }
void toMonthlyAmount  // retained for the legacy buildDebtPayoffMap helper

// Calculate column data with running balances
export function calculateColumnData(
  columns: DateColumn[],
  transactions: Transaction[],
  startingBalance: number,
  options: {
    futureObligations?: FutureObligation[]
    categoryBudgets?: CategoryBudget[]
    debts?: Debt[]
  } = {},
): ColumnData[] {
  const today = startOfDay(new Date())
  const futureObligations = options.futureObligations ?? []
  const categoryBudgets = options.categoryBudgets ?? []
  let runningBalance = startingBalance
  const result: ColumnData[] = []

  // Derive the recurring obligation forecast from tagged transactions
  const derived = deriveObligationsFromTransactions(transactions)
  const derivedGroups = new Set(derived.map(d => d.group))

  for (const col of columns) {
    const txns = getTransactionsInRange(transactions, col.start, col.end)
    const isFuture = isAfter(col.start, today)

    let cashMovement = 0
    let projectedItems: ProjectedItem[] = []

    if (isFuture) {
      // Future: derived recurring + future_obligations + category_budgets
      projectedItems = [
        ...projectDerivedItems(derived, col.start, col.end),
        ...projectFutureObligations(futureObligations, col.start, col.end),
        ...projectCategoryBudgets(categoryBudgets, col.start, col.end),
      ]
      cashMovement = projectedItems.reduce((sum, item) => sum + item.amount, 0)
    } else {
      // Past/current: actuals are the truth. For recurring groups that DIDN'T
      // realise in this column, project the derived obligation so multi-account
      // imports don't leave gaps. Future obligations also fill in if their
      // dates fall here. Budgets are NEVER projected in past — actual
      // categorised spend is the answer.
      cashMovement = txns.reduce((sum, t) => sum + t.amount, 0)

      const realisedGroups = new Set(
        txns.map(t => t.recurrence_group).filter(g => !!g),
      )
      const unmatchedDerived = derived.filter(d => !realisedGroups.has(d.group))
      projectedItems = [
        ...projectDerivedItems(unmatchedDerived, col.start, col.end),
        ...projectFutureObligations(futureObligations, col.start, col.end)
          .filter(p => !realisedGroups.has(p.name)),
      ]
      cashMovement += projectedItems.reduce((sum, item) => sum + item.amount, 0)
    }
    void derivedGroups  // currently unused; reserved for future debt payoff logic

    // Cash movement: negative = money in (good), positive = money out (bad)
    // For running balance: subtract expenses, add income
    runningBalance -= cashMovement

    const prevBalance = runningBalance + cashMovement
    const movementPercent = prevBalance !== 0
      ? Math.round((cashMovement / Math.abs(prevBalance)) * 10000) / 100
      : 0

    result.push({
      cashMovement,
      runningBalance,
      movementPercent,
      transactions: txns,
      projectedItems,
    })
  }

  return result
}

// Calculate net worth
export function calculateNetWorth(
  balances: Map<string, number>,
  debts: Debt[]
): { assets: number; liabilities: number; netWorth: number } {
  const assets = Array.from(balances.values()).reduce((sum, b) => sum + b, 0)
  const liabilities = debts
    .filter(d => d.include_in_net_worth)
    .reduce((sum, d) => sum + d.current_balance, 0)

  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
  }
}

// Get latest balance for a source
export function getLatestBalance(
  balances: AccountBalance[],
  sourceId: string
): number | null {
  const sourceBalances = balances
    .filter(b => b.source_id === sourceId)
    .sort((a, b) => new Date(b.as_of_date).getTime() - new Date(a.as_of_date).getTime())

  return sourceBalances.length > 0 ? sourceBalances[0].balance : null
}
