import { addMonths, format } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Banknote, PiggyBank, Wallet } from 'lucide-react'
import type { AccountBalance, SavingsBucket, Source } from '@/types'
import { bucketValue, getLatestBalance } from '@/lib/calculations'
import { useSavingsBuckets } from '@/hooks/use-savings-buckets'
import { GOAL_ICONS, goalColor } from '@/components/planner/goal-meta'

interface SavingsBucketsSectionProps {
  sources: Source[]
  balances: AccountBalance[]
}

export function SavingsBucketsSection({ sources, balances }: SavingsBucketsSectionProps) {
  const { buckets } = useSavingsBuckets()
  const active = buckets.filter(b => b.is_active)

  const liquidCash = sources
    .filter(s => s.type === 'bank_account')
    .reduce((sum, s) => sum + (getLatestBalance(balances, s.id) ?? 0), 0)
  const inBuckets = active.reduce((sum, b) => sum + bucketValue(b), 0)
  const freeCash = liquidCash - inBuckets

  return (
    <div className="space-y-3">
      {/* Right-now snapshot */}
      <div className="grid grid-cols-3 gap-3">
        <SnapshotTile icon={Banknote} label="Liquid cash" value={liquidCash} />
        <SnapshotTile icon={PiggyBank} label="In buckets" value={inBuckets} />
        <SnapshotTile icon={Wallet} label="Free to spend" value={freeCash} tone={freeCash < 0 ? 'bad' : 'good'} />
      </div>

      {active.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {active.map(bucket => <BucketCard key={bucket.id} bucket={bucket} />)}
        </div>
      )}
    </div>
  )
}

function SnapshotTile({ icon: Icon, label, value, tone }: {
  icon: typeof Wallet
  label: string
  value: number
  tone?: 'good' | 'bad'
}) {
  return (
    <Card className="py-3 px-3 gap-0.5 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-xs font-medium text-muted-foreground truncate">{label}</span>
        <Icon className="w-3 h-3 text-muted-foreground shrink-0 ml-1" />
      </div>
      <span className={`text-base sm:text-xl font-bold leading-tight truncate ${
        tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-700' : ''
      }`}>
        {formatGBP(value)}
      </span>
    </Card>
  )
}

function BucketCard({ bucket }: { bucket: SavingsBucket }) {
  const color = goalColor(bucket.color)
  const Icon = GOAL_ICONS[bucket.icon] ?? GOAL_ICONS['piggy-bank']
  const value = bucketValue(bucket)
  const target = bucket.target_amount !== null ? Number(bucket.target_amount) : null
  const pct = target ? Math.min(100, (value / target) * 100) : null
  const allocation = Number(bucket.monthly_allocation)

  let eta: string | null = null
  if (target && value < target && allocation > 0) {
    const monthsNeeded = Math.ceil((target - value) / allocation)
    eta = format(addMonths(new Date(), monthsNeeded), 'MMM yyyy')
  }

  return (
    <Card className="py-3 px-3 gap-1.5 min-w-0">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${color.soft}`}>
          <Icon className={`w-3.5 h-3.5 ${color.text}`} />
        </div>
        <span className="text-sm font-medium truncate">{bucket.name}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold leading-tight">{formatGBP(value)}</span>
        {allocation > 0 && <span className="text-[10px] text-muted-foreground">+{formatGBP(allocation)}/mo</span>}
      </div>
      {pct !== null && (
        <>
          <div className={`h-1.5 rounded-full overflow-hidden ${color.soft}`}>
            <div className={`h-full rounded-full ${color.solid}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {Math.round(pct)}% of {formatGBP(target!)}
            {pct >= 100 ? ' — reached' : eta ? ` · ${eta}` : ''}
          </span>
        </>
      )}
    </Card>
  )
}

function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount)
}
