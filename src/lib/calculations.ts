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
import type { RecurringItem, Transaction, ViewMode, AccountBalance, Debt, Frequency } from '@/types'

export interface DateColumn {
  label: string
  start: Date
  end: Date
  isPast: boolean
}

export interface ColumnData {
  cashMovement: number
  runningBalance: number
  movementPercent: number
  transactions: Transaction[]
  projectedItems: { name: string; amount: number }[]
}

// Generate date columns based on view mode
export function generateDateColumns(viewMode: ViewMode, numColumns: number = 30): DateColumn[] {
  const today = startOfDay(new Date())
  const columns: DateColumn[] = []

  // Start 7 periods before today so we can see recent history
  const historyPeriods = 7

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

// Get all projected recurring items that fall within a date range
export function getProjectedItems(
  items: RecurringItem[],
  start: Date,
  end: Date
): { name: string; amount: number }[] {
  const result: { name: string; amount: number }[] = []
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
        result.push({ name: item.name, amount: spreadAmount })
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
            result.push({ name: item.name, amount: effectiveAmount })
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

// Calculate column data with running balances
export function calculateColumnData(
  columns: DateColumn[],
  transactions: Transaction[],
  recurringItems: RecurringItem[],
  startingBalance: number,
  debts: Debt[] = [],
): ColumnData[] {
  const today = startOfDay(new Date())
  let runningBalance = startingBalance
  const result: ColumnData[] = []

  // Calculate payoff months for debt-linked payments
  const payoffMap = buildDebtPayoffMap(recurringItems, debts)

  for (const col of columns) {
    const txns = getTransactionsInRange(transactions, col.start, col.end)

    // Past dates: use actual transactions
    // Future dates: use projected from recurring items
    const isPastOrCurrent = isBefore(col.start, today) || isWithinInterval(today, { start: col.start, end: col.end })
    const isFuture = isAfter(col.start, today)

    // How many months from now is this column?
    const colMid = new Date((col.start.getTime() + col.end.getTime()) / 2)
    const monthsFromNow = Math.max(0, (colMid.getTime() - today.getTime()) / (30.44 * 24 * 60 * 60 * 1000))

    // Filter out recurring items whose linked debt is paid off by this column
    const activeItems = recurringItems.filter(item => {
      const payoffMonth = payoffMap.get(item.id)
      if (payoffMonth !== undefined && monthsFromNow >= payoffMonth) {
        return false // debt is paid off, stop this payment
      }
      return true
    })

    let cashMovement = 0
    let projectedItems: { name: string; amount: number }[] = []

    if (isPastOrCurrent && txns.length > 0) {
      // Use actual transaction data
      cashMovement = txns.reduce((sum, t) => sum + t.amount, 0)
    }

    if (isFuture || (isPastOrCurrent && txns.length === 0)) {
      // Use projected recurring items for future or empty past periods
      projectedItems = getProjectedItems(activeItems, col.start, col.end)
      cashMovement = projectedItems.reduce((sum, item) => sum + item.amount, 0)
    }

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
