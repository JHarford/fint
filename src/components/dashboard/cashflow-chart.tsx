import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, addMonths,
  isWithinInterval, format, parseISO, isAfter, min as minDate,
} from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Source, Transaction, AccountBalance, Debt, Asset } from '@/types'
import { getLatestBalance } from '@/lib/calculations'

type Period = 'weekly' | 'monthly'
type Metric = 'cash' | 'networth'

interface CashflowChartProps {
  sources: Source[]
  transactions: Transaction[]
  balances: AccountBalance[]
  debts: Debt[]
  assets: Asset[]
}

const CASH_COLOR = '#2563eb'   // blue-600
const IN_COLOR = '#16a34a'     // green-600
const OUT_COLOR = '#dc2626'    // red-600

const gbp = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
const gbpFull = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)

interface PeriodPoint {
  label: string
  end: Date
  moneyIn: number    // positive
  moneyOut: number   // stored negative so bars point down
  cash: number | null
}

export function CashflowChart({ sources, transactions, balances, debts, assets }: CashflowChartProps) {
  const [period, setPeriod] = useState<Period>('monthly')
  const [metric, setMetric] = useState<Metric>('cash')

  // Sources worth showing: have transactions or a recorded balance.
  const usableSources = useMemo(() => {
    const withTxn = new Set(transactions.map(t => t.source_id))
    const withBal = new Set(balances.map(b => b.source_id))
    return sources.filter(s => withTxn.has(s.id) || withBal.has(s.id))
  }, [sources, transactions, balances])

  const [selected, setSelected] = useState<Set<string>>(() => new Set(usableSources.map(s => s.id)))

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  const selectAll = () => setSelected(new Set(usableSources.map(s => s.id)))
  const selectNone = () => setSelected(new Set())

  // Net-worth offset from the currently-selected accounts: fold in whole-portfolio
  // assets and liabilities as a constant shift on the cash line. Approximate
  // (assets/debts are point-in-time), but gives the right level.
  const netWorthOffset = useMemo(() => {
    const liabilities = debts.filter(d => d.include_in_net_worth).reduce((s, d) => s + Number(d.current_balance), 0)
    const assetTotal = assets.filter(a => a.include_in_net_worth).reduce((s, a) => s + Number(a.current_value), 0)
    return assetTotal - liabilities
  }, [debts, assets])

  const data = useMemo<PeriodPoint[]>(() => {
    const sel = [...selected]
    if (sel.length === 0) return []

    const txns = transactions.filter(t => selected.has(t.source_id))

    // X-axis span: earliest selected transaction → today.
    const today = new Date()
    let earliest = today
    for (const t of txns) {
      const d = parseISO(t.date)
      if (d < earliest) earliest = d
    }
    if (!txns.length) earliest = today

    const startOf = period === 'weekly' ? startOfWeek : startOfMonth
    const endOf = period === 'weekly' ? endOfWeek : endOfMonth
    const addP = period === 'weekly' ? addWeeks : addMonths
    const opts = period === 'weekly' ? { weekStartsOn: 1 as const } : undefined

    // Pre-anchor each selected source to its latest balance snapshot so we can
    // reconstruct historical balances by walking transactions back in time.
    const anchors = sel.map(id => {
      const bal = getLatestBalance(balances, id)
      const rows = balances.filter(b => b.source_id === id)
      let asOf: Date | null = null
      for (const b of rows) {
        const d = parseISO(b.as_of_date)
        if (!asOf || d > asOf) asOf = d
      }
      return { id, balance: bal, asOf }
    }).filter(a => a.balance != null && a.asOf) as { id: string; balance: number; asOf: Date }[]

    const points: PeriodPoint[] = []
    let cursor = startOf(earliest, opts as never)
    let guard = 0
    while (!isAfter(cursor, today) && guard++ < 600) {
      const start = cursor
      const end = endOf(cursor, opts as never)
      const inRange = (d: Date) => isWithinInterval(d, { start, end })

      let moneyIn = 0
      let moneyOut = 0
      for (const t of txns) {
        if (!inRange(parseISO(t.date))) continue
        if (t.amount < 0) moneyIn += -t.amount     // negative = money in
        else moneyOut += t.amount                  // positive = money out
      }

      // Reconstructed available cash at period end = latest balance + net of all
      // transactions dated after this period end (each txn moved balance by -amount).
      const periodEnd = minDate([end, today])
      let cash: number | null = anchors.length ? 0 : null
      if (anchors.length) {
        for (const a of anchors) {
          let sumAfter = 0
          for (const t of transactions) {
            if (t.source_id !== a.id) continue
            const d = parseISO(t.date)
            if (isAfter(d, periodEnd) && !isAfter(d, a.asOf)) sumAfter += t.amount
          }
          cash! += a.balance + sumAfter
        }
        if (metric === 'networth') cash! += netWorthOffset
      }

      points.push({
        label: period === 'weekly' ? format(start, 'd MMM') : format(start, 'MMM yy'),
        end,
        moneyIn: Math.round(moneyIn),
        moneyOut: -Math.round(moneyOut),
        cash: cash == null ? null : Math.round(cash),
      })
      cursor = addP(cursor, 1)
    }
    return points
  }, [selected, transactions, balances, period, metric, netWorthOffset])

  const hasData = data.length > 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>Cashflow & Balance</CardTitle>
          <div className="flex gap-2">
            <Segmented
              value={metric}
              onChange={v => setMetric(v as Metric)}
              options={[{ value: 'cash', label: 'Available cash' }, { value: 'networth', label: 'Net worth' }]}
            />
            <Segmented
              value={period}
              onChange={v => setPeriod(v as Period)}
              options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Account multi-select */}
        <div className="flex flex-wrap items-center gap-1.5">
          {usableSources.map(s => {
            const on = selected.has(s.id)
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  on
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40'
                }`}
              >
                {s.name}
              </button>
            )
          })}
          <span className="mx-1 text-muted-foreground/40">|</span>
          <button onClick={selectAll} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">All</button>
          <button onClick={selectNone} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">None</button>
        </div>

        {!hasData ? (
          <p className="text-sm text-muted-foreground py-16 text-center">Select at least one account to see the chart.</p>
        ) : (
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                <YAxis
                  yAxisId="cash"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => gbp(v)}
                  width={56}
                />
                <YAxis
                  yAxisId="flow"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => gbp(Math.abs(v))}
                  width={56}
                />
                <Tooltip content={<CashflowTooltip metric={metric} />} />
                <ReferenceLine yAxisId="flow" y={0} stroke="currentColor" className="text-border" />
                <Bar yAxisId="flow" dataKey="moneyIn" name="Money in" fill={IN_COLOR} radius={[2, 2, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="flow" dataKey="moneyOut" name="Money out" fill={OUT_COLOR} radius={[0, 0, 2, 2]} maxBarSize={22} />
                <Line
                  yAxisId="cash"
                  type="monotone"
                  dataKey="cash"
                  name={metric === 'networth' ? 'Net worth' : 'Available cash'}
                  stroke={CASH_COLOR}
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Legend color={CASH_COLOR} label={metric === 'networth' ? 'Net worth (left axis)' : 'Available cash (left axis)'} line />
          <Legend color={IN_COLOR} label="Money in (right axis)" />
          <Legend color={OUT_COLOR} label="Money out (right axis)" />
        </div>
      </CardContent>
    </Card>
  )
}

function Segmented({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex rounded-lg border bg-muted/40 p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            value === o.value ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block rounded-sm"
        style={line ? { width: 14, height: 3, background: color } : { width: 10, height: 10, background: color }}
      />
      {label}
    </span>
  )
}

function CashflowTooltip({ active, payload, label, metric }: {
  active?: boolean
  payload?: Array<{ payload: PeriodPoint }>
  label?: string
  metric: Metric
}) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload
  const net = p.moneyIn + p.moneyOut // moneyOut is negative
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md space-y-1">
      <p className="font-medium">{label}</p>
      <p className="flex justify-between gap-4"><span className="text-green-600">Money in</span><span>{gbpFull(p.moneyIn)}</span></p>
      <p className="flex justify-between gap-4"><span className="text-red-600">Money out</span><span>{gbpFull(-p.moneyOut)}</span></p>
      <p className="flex justify-between gap-4 border-t pt-1"><span>Net</span><span className={net >= 0 ? 'text-green-600' : 'text-red-600'}>{gbpFull(net)}</span></p>
      {p.cash != null && (
        <p className="flex justify-between gap-4 border-t pt-1">
          <span>{metric === 'networth' ? 'Net worth' : 'Available cash'}</span>
          <span className="font-medium">{gbpFull(p.cash)}</span>
        </p>
      )}
    </div>
  )
}
