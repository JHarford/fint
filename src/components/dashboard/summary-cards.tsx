import { useState, useMemo, useId, useRef, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CreditCard, Landmark, TrendingDown, Wallet, EyeOff, Plus, Home, Car, PiggyBank, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Source, AccountBalance, Debt, RecurringItem, Asset } from '@/types'
import { getLatestBalance, calculateNetWorth } from '@/lib/calculations'
import { addMonths, format } from 'date-fns'

interface SummaryCardsProps {
  sources: Source[]
  balances: AccountBalance[]
  debts: Debt[]
  recurringItems: RecurringItem[]
  assets: Asset[]
  forecastMonths?: number
}

function toMonthlyAmount(item: RecurringItem, monthsFromNow: number = 0): number {
  // Apply compound annual increase
  const rate = (item.annual_increase || 0) / 100
  const amount = item.amount * Math.pow(1 + rate, monthsFromNow / 12)
  if (item.frequency === 'weekly') return amount * 52 / 12
  if (item.frequency === 'quarterly') return amount / 3
  if (item.frequency === 'annually') return amount / 12
  return amount
}

function isActiveAtMonth(item: RecurringItem, monthsFromNow: number): boolean {
  const futureDate = addMonths(new Date(), monthsFromNow)
  // Don't project before the item's start (next_date)
  const startDate = new Date(item.next_date)
  if (futureDate < startDate) return false
  // Don't project after the item's end
  if (!item.end_date) return true
  const endDate = new Date(item.end_date)
  return futureDate <= endDate
}

function calcPayoffInfo(balance: number, item: RecurringItem | undefined, interestRate: number = 0): { date: string; months: number } | null {
  if (!item || item.amount <= 0) return null
  const monthly = toMonthlyAmount(item)
  if (monthly <= 0) return null
  const monthlyRate = interestRate / 100 / 12
  let bal = balance
  let months = 0
  while (bal > 0 && months < 600) {
    bal += bal * monthlyRate
    bal -= monthly
    months++
  }
  if (bal > 0) return null // never pays off
  return { date: format(addMonths(new Date(), months), 'MMM yyyy'), months }
}

function monthLabel(offset: number): string {
  return format(addMonths(new Date(), offset), 'MMM yy')
}

function projectDebtCurve(balance: number, item: RecurringItem | undefined, interestRate: number = 0, months: number = 12): { v: number; month: number; label: string }[] {
  const points: { v: number; month: number; label: string }[] = []
  const monthlyRate = interestRate / 100 / 12
  let bal = balance
  for (let i = 0; i <= months; i++) {
    points.push({ v: -Math.max(0, bal), month: i, label: monthLabel(i) })
    bal += bal * monthlyRate
    bal -= item ? toMonthlyAmount(item, i) : 0
  }
  return points
}

// Calculate payoff month for a recurring item if it's linked to a debt
function getPayoffMonth(item: RecurringItem, debts: Debt[]): number | null {
  const debt = debts.find(d => d.recurring_item_id === item.id)
  if (!debt || item.amount <= 0) return null
  const monthly = toMonthlyAmount(item)
  if (monthly <= 0) return null
  const monthlyRate = (debt.interest_rate || 0) / 100 / 12
  let bal = debt.current_balance
  let months = 0
  while (bal > 0 && months < 600) {
    bal += bal * monthlyRate
    bal -= monthly
    months++
  }
  return bal > 0 ? null : months
}

// Project account balance forward using recurring items linked to this source
function projectAccountCurve(
  startingBalance: number,
  recurringItems: RecurringItem[],
  debts: Debt[],
  sourceId: string,
  months: number = 12,
): { v: number; month: number; label: string }[] {
  // Items where source_id matches = money leaving/entering this account
  const sourceItems = recurringItems.filter(i => i.is_active && i.source_id === sourceId)
  // Items where target_source_id matches = money arriving at this account (e.g. card payments)
  const targetItems = recurringItems.filter(i => i.is_active && i.target_source_id === sourceId)

  if (sourceItems.length === 0 && targetItems.length === 0) {
    return Array.from({ length: months + 1 }, (_, i) => ({ v: startingBalance, month: i, label: monthLabel(i) }))
  }

  // Pre-calculate payoff months for debt-linked items
  const sourcePayoffs = sourceItems.map(item => ({
    item,
    payoffMonth: getPayoffMonth(item, debts),
  }))
  const targetPayoffs = targetItems.map(item => ({
    item,
    payoffMonth: getPayoffMonth(item, debts),
  }))

  const points: { v: number; month: number; label: string }[] = []
  let bal = startingBalance
  for (let i = 0; i <= months; i++) {
    points.push({ v: bal, month: i, label: monthLabel(i) })

    // Sum only items that are still active and haven't been paid off
    let monthlyOut = 0
    for (const { item, payoffMonth } of sourcePayoffs) {
      if (isActiveAtMonth(item, i) && (payoffMonth === null || i < payoffMonth)) {
        monthlyOut += toMonthlyAmount(item, i)
      }
    }
    let monthlyIn = 0
    for (const { item, payoffMonth } of targetPayoffs) {
      if (isActiveAtMonth(item, i) && (payoffMonth === null || i < payoffMonth)) {
        monthlyIn += toMonthlyAmount(item, i)
      }
    }

    bal -= monthlyOut   // items leaving this account
    bal += monthlyIn    // items arriving at this account (target_source_id) — raises the balance
  }
  return points
}

function projectNetWorthCurve(
  totalAssets: number,
  debts: Debt[],
  recurringItems: RecurringItem[],
  assetItems: Asset[] = [],
  months: number = 12,
): { v: number; month: number; label: string }[] {
  const points: { v: number; month: number; label: string }[] = []
  let liquidBalance = totalAssets

  // Track physical/investment assets separately for appreciation
  const assetProjections = assetItems
    .filter(a => a.include_in_net_worth)
    .map(a => ({ value: a.current_value, monthlyRate: (a.annual_change || 0) / 100 / 12 }))

  // Subtract initial asset values from liquid balance (they're tracked separately)
  const initialAssetTotal = assetProjections.reduce((sum, a) => sum + a.value, 0)
  liquidBalance -= initialAssetTotal

  const debtProjections = debts
    .filter(d => d.include_in_net_worth)
    .map(d => {
      const linked = d.recurring_item_id ? recurringItems.find(i => i.id === d.recurring_item_id) : undefined
      return { balance: d.current_balance, linked, paidOff: false, monthlyRate: (d.interest_rate || 0) / 100 / 12 }
    })

  for (let i = 0; i <= months; i++) {
    const totalDebt = debtProjections.reduce((sum, d) => sum + Math.max(0, d.balance), 0)
    const totalAssetValue = assetProjections.reduce((sum, a) => sum + a.value, 0)
    points.push({ v: liquidBalance + totalAssetValue - totalDebt, month: i, label: monthLabel(i) })

    // Calculate this month's net using month-aware amounts, respecting end dates
    const monthNet = recurringItems
      .filter(ri => ri.is_active && isActiveAtMonth(ri, i))
      .reduce((sum, ri) => sum - toMonthlyAmount(ri, i), 0)

    // Add back freed payments from paid-off debts
    let freedPayments = 0
    for (const d of debtProjections) {
      if (d.paidOff && d.linked) {
        freedPayments += toMonthlyAmount(d.linked, i)
      }
    }

    liquidBalance += monthNet + freedPayments

    // Apply appreciation/depreciation to physical assets
    for (const a of assetProjections) {
      a.value += a.value * a.monthlyRate
    }

    for (const d of debtProjections) {
      if (!d.paidOff) {
        d.balance += d.balance * d.monthlyRate
        const monthly = d.linked ? toMonthlyAmount(d.linked, i) : 0
        d.balance -= monthly
        if (d.balance <= 0) {
          d.paidOff = true
        }
      }
    }
  }

  return points
}

interface HoverInfo {
  value: number
  label: string
}

interface SparklineProps {
  data: { v: number; month: number; label: string }[]
  id: string
  onHover?: (info: HoverInfo | null) => void
}

// Invisible tooltip that relays hovered data point back to parent
function HoverRelay({ active, payload, onHover }: { active?: boolean; payload?: { payload: { v: number; label: string } }[]; onHover: (info: HoverInfo | null) => void }) {
  const prev = useRef<string | null>(null)
  useEffect(() => {
    if (active && payload?.[0]) {
      const { v, label } = payload[0].payload
      const key = `${v}-${label}`
      if (prev.current !== key) {
        prev.current = key
        onHover({ value: v, label })
      }
    } else if (prev.current !== null) {
      prev.current = null
      onHover(null)
    }
  })
  return null
}

function Sparkline({ data, id, onHover }: SparklineProps) {
  const isFlat = data.every(d => d.v === data[0].v)
  if (isFlat && data[0].v === 0) return null

  const max = Math.max(...data.map(d => d.v))
  const min = Math.min(...data.map(d => d.v))
  const allPositive = min >= 0
  const allNegative = max <= 0
  // Where does zero sit as a percentage from top (0%) to bottom (100%)?
  const zeroPercent = max === min ? 50 : (max / (max - min)) * 100

  return (
    <div
      className="h-8 mt-1.5 min-w-0"
      onMouseLeave={() => onHover?.(null)}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data}>
          <defs>
            {/* Stroke gradient: green above zero, red below */}
            <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={allNegative ? '#dc2626' : '#16a34a'} />
              {!allPositive && !allNegative && (
                <>
                  <stop offset={`${zeroPercent}%`} stopColor="#16a34a" />
                  <stop offset={`${zeroPercent}%`} stopColor="#dc2626" />
                </>
              )}
              <stop offset="100%" stopColor={allPositive ? '#16a34a' : '#dc2626'} />
            </linearGradient>
            {/* Fill gradient: green/red with fade */}
            <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={allNegative ? '#dc2626' : '#16a34a'} stopOpacity={0.25} />
              {!allPositive && !allNegative && (
                <>
                  <stop offset={`${zeroPercent}%`} stopColor="#16a34a" stopOpacity={0.05} />
                  <stop offset={`${zeroPercent}%`} stopColor="#dc2626" stopOpacity={0.05} />
                </>
              )}
              <stop offset="100%" stopColor={allPositive ? '#16a34a' : '#dc2626'} stopOpacity={allPositive ? 0.05 : 0.25} />
            </linearGradient>
          </defs>
          {onHover && (
            <Tooltip
              content={<HoverRelay onHover={onHover} />}
              cursor={false}
              isAnimationActive={false}
            />
          )}
          <Area
            type="monotone"
            dataKey="v"
            stroke={`url(#stroke-${id})`}
            strokeWidth={1.5}
            fill={`url(#fill-${id})`}
            dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: { v: number } }) => (
              <circle key={cx} cx={cx} cy={cy} r={1.5} fill={payload.v >= 0 ? '#16a34a' : '#dc2626'} stroke="none" />
            )}
            activeDot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: { v: number } }) => (
              <circle key={cx} cx={cx} cy={cy} r={3} fill={payload.v >= 0 ? '#16a34a' : '#dc2626'} stroke="#fff" strokeWidth={1} />
            )}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

type CardKey = string // source-{id}, debt-{id}, networth

function getHiddenCards(): Set<string> {
  try {
    // 'fint-hidden-cards' is the pre-rename key; fall back so existing installs keep their setting
    const stored = localStorage.getItem('lifeflow-hidden-cards') ?? localStorage.getItem('fint-hidden-cards')
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

function saveHiddenCards(hidden: Set<string>) {
  localStorage.setItem('lifeflow-hidden-cards', JSON.stringify([...hidden]))
}

export function SummaryCards({ sources, balances, debts, recurringItems, assets: assetItems = [], forecastMonths = 12 }: SummaryCardsProps) {
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(getHiddenCards)
  const [showHiddenMode, setShowHiddenMode] = useState(false)
  const [hoverState, setHoverState] = useState<{ cardKey: string; value: number; label: string } | null>(null)
  const uid = useId()

  const latestBalances = new Map<string, number>()
  for (const source of sources) {
    const bal = getLatestBalance(balances, source.id)
    if (bal !== null) latestBalances.set(source.id, bal)
  }

  // Total assets = account balances + physical/investment assets
  const totalAssetValue = assetItems
    .filter(a => a.include_in_net_worth)
    .reduce((sum, a) => sum + Number(a.current_value), 0)

  const { assets: accountAssets, liabilities, netWorth: baseNetWorth } = calculateNetWorth(latestBalances, debts)
  const netWorth = baseNetWorth + totalAssetValue

  const getLinkedItem = (id: string | null) => recurringItems.find(i => i.id === id)

  const netWorthCurve = useMemo(
    () => projectNetWorthCurve(accountAssets + totalAssetValue, debts, recurringItems, assetItems, forecastMonths),
    [accountAssets, totalAssetValue, debts, recurringItems, assetItems, forecastMonths]
  )

  const hideCard = (key: CardKey) => {
    const next = new Set(hiddenCards)
    next.add(key)
    setHiddenCards(next)
    saveHiddenCards(next)
  }

  const showCard = (key: CardKey) => {
    const next = new Set(hiddenCards)
    next.delete(key)
    setHiddenCards(next)
    saveHiddenCards(next)
  }

  const hasHidden = hiddenCards.size > 0

  // In hidden mode, show all cards but hidden ones are clickable to unhide
  if (showHiddenMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Click a hidden card to show it again</span>
          <Button variant="outline" size="sm" onClick={() => setShowHiddenMode(false)}>Done</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {sources.map(source => {
            const key: CardKey = `source-${source.id}`
            const isHidden = hiddenCards.has(key)
            return (
              <Card
                key={source.id}
                className={`py-3 px-3 gap-1 cursor-pointer transition-opacity ${isHidden ? 'opacity-20 hover:opacity-50' : 'opacity-100'}`}
                onClick={() => isHidden && showCard(key)}
              >
                <span className="text-xs font-medium text-muted-foreground truncate">{source.name}</span>
              </Card>
            )
          })}
          {debts.map(debt => {
            const key: CardKey = `debt-${debt.id}`
            const isHidden = hiddenCards.has(key)
            return (
              <Card
                key={debt.id}
                className={`py-3 px-3 gap-1 cursor-pointer transition-opacity ${isHidden ? 'opacity-20 hover:opacity-50' : 'opacity-100'}`}
                onClick={() => isHidden && showCard(key)}
              >
                <span className="text-xs font-medium text-muted-foreground truncate">{debt.name}</span>
              </Card>
            )
          })}
          {assetItems.map(asset => {
            const key: CardKey = `asset-${asset.id}`
            const isHidden = hiddenCards.has(key)
            return (
              <Card
                key={asset.id}
                className={`py-3 px-3 gap-1 cursor-pointer transition-opacity ${isHidden ? 'opacity-20 hover:opacity-50' : 'opacity-100'}`}
                onClick={() => isHidden && showCard(key)}
              >
                <span className="text-xs font-medium text-muted-foreground truncate">{asset.name}</span>
              </Card>
            )
          })}
          <Card
            className={`py-3 px-3 gap-1 col-span-2 cursor-pointer transition-opacity ${hiddenCards.has('networth') ? 'opacity-20 hover:opacity-50' : 'opacity-100'}`}
            onClick={() => hiddenCards.has('networth') && showCard('networth')}
          >
            <span className="text-xs font-medium text-muted-foreground">Net Worth</span>
          </Card>
        </div>
      </div>
    )
  }

  const [mobileExpanded, setMobileExpanded] = useState(false)

  // Count visible non-networth cards
  const visibleOtherCards = [
    ...sources.filter(s => !hiddenCards.has(`source-${s.id}`)),
    ...assetItems.filter(a => !hiddenCards.has(`asset-${a.id}`)),
    ...debts.filter(d => !hiddenCards.has(`debt-${d.id}`)),
  ]

  return (
    <div className="space-y-3">
      {hasHidden && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => setShowHiddenMode(true)}>
            <Plus className="w-3 h-3 mr-1" /> Show hidden cards
          </Button>
        </div>
      )}

      {/* Net worth — always visible */}
      {!hiddenCards.has('networth') && (
        <Card className="py-3 px-4 gap-1 border-2 group relative overflow-hidden min-w-0">
          <button
            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
            onClick={() => hideCard('networth')}
          >
            <EyeOff className="w-3 h-3" />
          </button>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Net Worth</span>
            <Wallet className="w-3 h-3 text-muted-foreground shrink-0 ml-1" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold leading-tight ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(netWorth)}
            </span>
            <div className="text-xs text-muted-foreground flex gap-3">
              <span className="text-green-600">Assets {formatCurrency(accountAssets + totalAssetValue)}</span>
              <span className="text-red-600">Debts -{formatCurrency(liabilities)}</span>
            </div>
            {hoverState?.cardKey === 'networth' && (
              <span className="text-xs text-foreground/70 ml-auto">
                {formatCurrency(hoverState.value)} <span className="text-[9px] text-muted-foreground">{hoverState.label}</span>
              </span>
            )}
          </div>
          <div className="h-10">
            <Sparkline data={netWorthCurve} id={`${uid}-nw`} onHover={(info) => setHoverState(info ? { cardKey: 'networth', ...info } : null)} />
          </div>
        </Card>
      )}

      {/* Mobile expand/collapse toggle */}
      {visibleOtherCards.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden w-full h-8 text-xs text-muted-foreground"
          onClick={() => setMobileExpanded(!mobileExpanded)}
        >
          {mobileExpanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          {mobileExpanded ? 'Collapse cards' : `Show ${visibleOtherCards.length} cards`}
        </Button>
      )}

      {/* All cards in a flat grid — hidden on mobile unless expanded */}
      <div className={`${mobileExpanded ? 'grid' : 'hidden'} md:grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3`}>
        {sources.map(source => {
          const key: CardKey = `source-${source.id}`
          if (hiddenCards.has(key)) return null

          const bal = latestBalances.get(source.id) ?? 0
          const Icon = source.type === 'credit_card' ? CreditCard : Landmark
          const curve = projectAccountCurve(bal, recurringItems, debts, source.id, forecastMonths)

          return (
            <Card key={source.id} className="py-3 px-3 gap-1 group relative overflow-hidden min-w-0">
              <button
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                onClick={() => hideCard(key)}
              >
                <EyeOff className="w-3 h-3" />
              </button>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground truncate">{source.name}</span>
                <Icon className="w-3 h-3 text-muted-foreground shrink-0 ml-1" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-lg font-bold leading-tight ${bal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(bal)}
                </span>
                {hoverState?.cardKey === key && (
                  <span className="text-xs text-foreground/70">
                    {formatCurrency(hoverState.value)} <span className="text-[9px] text-muted-foreground">{hoverState.label}</span>
                  </span>
                )}
              </div>
              <Sparkline data={curve} id={`${uid}-src-${source.id}`} onHover={(info) => setHoverState(info ? { cardKey: key, ...info } : null)} />
            </Card>
          )
        })}

        {assetItems.map(asset => {
          const key: CardKey = `asset-${asset.id}`
          if (hiddenCards.has(key)) return null

          const Icon = asset.type === 'property' ? Home : asset.type === 'vehicle' ? Car : asset.type === 'investment' ? PiggyBank : Package
          const changeRate = asset.annual_change || 0
          const curve = Array.from({ length: forecastMonths + 1 }, (_, i) => ({
            v: asset.current_value * Math.pow(1 + changeRate / 100, i / 12),
            month: i,
            label: monthLabel(i),
          }))

          return (
            <Card key={asset.id} className="py-3 px-3 gap-1 group relative overflow-hidden min-w-0">
              <button
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                onClick={() => hideCard(key)}
              >
                <EyeOff className="w-3 h-3" />
              </button>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground truncate">{asset.name}</span>
                <Icon className="w-3 h-3 text-muted-foreground shrink-0 ml-1" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold leading-tight text-green-600">
                  {formatCurrency(asset.current_value)}
                </span>
                {hoverState?.cardKey === key && (
                  <span className="text-xs text-foreground/70">
                    {formatCurrency(hoverState.value)} <span className="text-[9px] text-muted-foreground">{hoverState.label}</span>
                  </span>
                )}
              </div>
              {changeRate !== 0 && (
                <span className={`text-[10px] ${changeRate > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {changeRate > 0 ? '+' : ''}{changeRate}%/yr
                </span>
              )}
              <Sparkline data={curve} id={`${uid}-asset-${asset.id}`} onHover={(info) => setHoverState(info ? { cardKey: key, ...info } : null)} />
            </Card>
          )
        })}

        {debts.map(debt => {
          const key: CardKey = `debt-${debt.id}`
          if (hiddenCards.has(key)) return null

          const linked = getLinkedItem(debt.recurring_item_id)
          const payoff = calcPayoffInfo(debt.current_balance, linked, debt.interest_rate)
          const curve = projectDebtCurve(debt.current_balance, linked, debt.interest_rate, forecastMonths)

          return (
            <Card key={debt.id} className="py-3 px-3 gap-1 group relative overflow-hidden min-w-0">
              <button
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                onClick={() => hideCard(key)}
              >
                <EyeOff className="w-3 h-3" />
              </button>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground truncate">{debt.name}</span>
                <TrendingDown className="w-3 h-3 text-destructive shrink-0 ml-1" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold leading-tight text-red-600">
                  -{formatCurrency(debt.current_balance)}
                </span>
                {hoverState?.cardKey === key && (
                  <span className="text-xs text-foreground/70">
                    {formatCurrency(hoverState.value)} <span className="text-[9px] text-muted-foreground">{hoverState.label}</span>
                  </span>
                )}
              </div>
              {payoff ? (
                <span className="text-[10px] text-muted-foreground">{payoff.date} ({payoff.months}mo)</span>
              ) : linked ? (
                <span className="text-[10px] text-muted-foreground">{formatCurrency(linked.amount)}/{linked.frequency.slice(0, 2)}</span>
              ) : null}
              <Sparkline data={curve} id={`${uid}-debt-${debt.id}`} onHover={(info) => setHoverState(info ? { cardKey: key, ...info } : null)} />
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount)
}
