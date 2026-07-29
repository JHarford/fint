import { useMemo } from 'react'
import {
  startOfMonth, endOfMonth, startOfDay, addDays, isWithinInterval, parseISO, format, differenceInCalendarDays,
} from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { Transaction, FutureObligation } from '@/types'
import { deriveObligationsFromTransactions, projectDerivedItems, projectFutureObligations } from '@/lib/calculations'
import { isPL } from '@/lib/categories'

interface Props {
  transactions: Transaction[]
  futureObligations: FutureObligation[]
}

const gbp = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)

// A personal P&L for the current month: of the income that's arrived (plus what's
// still expected), how much is left once this month's outgoings — actual spend so
// far plus committed bills still to come — are covered. Transfers between own
// accounts are excluded throughout, so this is real retained cash.
export function MonthPLCard({ transactions, futureObligations }: Props) {
  const pl = useMemo(() => {
    const now = new Date()
    const mStart = startOfMonth(now)
    const mEnd = endOfMonth(now)
    const today = startOfDay(now)

    const monthTx = transactions.filter(t =>
      isPL(t.category) && isWithinInterval(parseISO(t.date), { start: mStart, end: mEnd }),
    )
    let incomeReceived = 0
    let spentSoFar = 0
    for (const t of monthTx) {
      if (t.amount < 0) incomeReceived += -t.amount
      else spentSoFar += t.amount
    }

    // Committed outgoings still to come this month: derived recurring obligations
    // (skipping any already realised this month) + active future obligations,
    // projected across the remaining days. Transfers excluded.
    const derived = deriveObligationsFromTransactions(transactions)
      .filter(d => d.category !== 'Transfer')
    const realised = new Set(monthTx.map(t => t.recurrence_group).filter(Boolean))
    const restStart = addDays(today, 1)
    const rest = restStart > mEnd ? [] : [
      ...projectDerivedItems(derived.filter(d => !realised.has(d.group)), restStart, mEnd),
      ...projectFutureObligations(futureObligations.filter(o => o.category !== 'Transfer'), restStart, mEnd),
    ]
    let dueOut = 0
    let expectedIn = 0
    for (const p of rest) {
      if (p.amount > 0) dueOut += p.amount
      else expectedIn += -p.amount
    }

    const totalIncome = incomeReceived + expectedIn
    const totalOut = spentSoFar + dueOut
    const left = totalIncome - totalOut
    const daysLeft = Math.max(0, differenceInCalendarDays(mEnd, today))

    return { monthLabel: format(now, 'MMMM'), incomeReceived, expectedIn, spentSoFar, dueOut, totalIncome, totalOut, left, daysLeft }
  }, [transactions, futureObligations])

  const positive = pl.left >= 0
  // Bar: income is the track; spend-so-far + still-due fill it (red overflow if over).
  const denom = Math.max(pl.totalIncome, pl.totalOut, 1)
  const spentPct = (pl.spentSoFar / denom) * 100
  const duePct = (pl.dueOut / denom) * 100
  const incomePct = (pl.totalIncome / denom) * 100

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>{pl.monthLabel} — money left</span>
          <span className="text-xs font-normal text-muted-foreground">{pl.daysLeft} days left</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className={`text-3xl font-bold tracking-tight ${positive ? 'text-emerald-600' : 'text-red-600'} flex items-center gap-2`}>
            {positive ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
            {gbp(pl.left)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {positive ? 'left of your income after this month’s outgoings' : 'over your income this month'}
            {' · '}income {gbp(pl.totalIncome)} − outgoings {gbp(pl.totalOut)}
          </p>
        </div>

        {/* income track with spent + still-due fill */}
        <div className="space-y-1">
          <div className="relative h-3 rounded-full bg-muted overflow-hidden">
            {/* income extent (faint green track) */}
            <div className="absolute inset-y-0 left-0 bg-emerald-500/20" style={{ width: `${Math.min(100, incomePct)}%` }} />
            {/* spent so far */}
            <div className="absolute inset-y-0 left-0 bg-red-500" style={{ width: `${Math.min(100, spentPct)}%` }} />
            {/* still due (lighter red, stacked) */}
            <div className="absolute inset-y-0 bg-red-400/60" style={{ left: `${Math.min(100, spentPct)}%`, width: `${Math.min(100 - Math.min(100, spentPct), duePct)}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>outgoings {gbp(pl.totalOut)}</span>
            <span>income {gbp(pl.totalIncome)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row label="Income received" value={gbp(pl.incomeReceived)} tone="in" />
          <Row label="Spent so far" value={gbp(pl.spentSoFar)} tone="out" />
          {pl.expectedIn > 0 && <Row label="More income expected" value={gbp(pl.expectedIn)} tone="in" muted />}
          <Row label="Committed still due" value={gbp(pl.dueOut)} tone="out" muted />
        </div>
      </CardContent>
    </Card>
  )
}

function Row({ label, value, tone, muted }: { label: string; value: string; tone: 'in' | 'out'; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${muted ? 'text-muted-foreground' : ''}`}>{label}</span>
      <span className={`tabular-nums font-medium ${tone === 'in' ? 'text-emerald-600' : 'text-red-600'} ${muted ? 'opacity-70' : ''}`}>{value}</span>
    </div>
  )
}
