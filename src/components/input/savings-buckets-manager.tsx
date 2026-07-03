import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'
import { useSavingsBuckets } from '@/hooks/use-savings-buckets'
import { bucketValue } from '@/lib/calculations'
import { GOAL_COLORS, GOAL_ICONS, goalColor } from '@/components/planner/goal-meta'
import { todayKey } from '@/lib/goal-stats'

const BUCKET_ICONS = ['piggy-bank', 'target', 'heart', 'moon', 'book', 'footprints', 'salad', 'water'] as const

export function SavingsBucketsManager() {
  const { buckets, create, update, remove } = useSavingsBuckets()
  const [name, setName] = useState('')
  const [monthly, setMonthly] = useState('')
  const [starting, setStarting] = useState('')
  const [target, setTarget] = useState('')
  const [icon, setIcon] = useState<string>('piggy-bank')
  const [color, setColor] = useState('blue')
  const [error, setError] = useState('')

  const add = async () => {
    if (!name.trim() || !monthly) return
    setError('')
    try {
      await create({
        name: name.trim(),
        monthly_allocation: parseFloat(monthly) || 0,
        current_amount: parseFloat(starting) || 0,
        target_amount: target ? parseFloat(target) : null,
        target_date: null,
        start_date: todayKey(),
        source_id: null,
        icon,
        color,
        is_active: true,
      })
      setName(''); setMonthly(''); setStarting(''); setTarget('')
    } catch (e) {
      setError(e instanceof Error ? e.message : e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Savings buckets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Virtual pots — no money moves. Each bucket grows by its monthly amount
          automatically and shows on the Finance dashboard.
        </p>

        {/* Add form */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label className="text-xs">Name</Label>
            <Input className="h-9" value={name} onChange={e => setName(e.target.value)} placeholder="Hot tub" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">£/month</Label>
            <Input className="h-9" type="number" min={0} value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="100" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Starting pot</Label>
            <Input className="h-9" type="number" min={0} value={starting} onChange={e => setStarting(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Target <span className="text-muted-foreground">(optional)</span></Label>
            <Input className="h-9" type="number" min={0} value={target} onChange={e => setTarget(e.target.value)} placeholder="6000" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {BUCKET_ICONS.map(key => {
              const Icon = GOAL_ICONS[key]
              return (
                <button
                  key={key}
                  onClick={() => setIcon(key)}
                  className={`w-7 h-7 rounded-md border flex items-center justify-center hover:bg-muted ${icon === key ? `${goalColor(color).soft} ${goalColor(color).text} border-transparent` : 'text-muted-foreground'}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              )
            })}
          </div>
          <div className="flex gap-1">
            {Object.entries(GOAL_COLORS).map(([key, c]) => (
              <button
                key={key}
                onClick={() => setColor(key)}
                className={`w-5 h-5 rounded-full ${c.solid} ${color === key ? 'ring-2 ring-offset-1 ring-foreground/50' : 'opacity-60 hover:opacity-100'}`}
              />
            ))}
          </div>
          <Button size="sm" className="h-9 ml-auto" onClick={add} disabled={!name.trim() || !monthly}>
            <Plus className="w-4 h-4 mr-1" /> Add bucket
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Existing buckets */}
        {buckets.length > 0 && (
          <div className="divide-y border rounded-md">
            {buckets.map(bucket => {
              const Icon = GOAL_ICONS[bucket.icon] ?? GOAL_ICONS['piggy-bank']
              const c = goalColor(bucket.color)
              return (
                <div key={bucket.id} className="flex items-center gap-3 px-3 py-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${c.soft}`}>
                    <Icon className={`w-3.5 h-3.5 ${c.text}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{bucket.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatGBP(bucketValue(bucket))} now · since {bucket.start_date}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="number"
                      className="h-7 w-20 text-xs"
                      defaultValue={String(bucket.monthly_allocation)}
                      title="Monthly allocation"
                      onBlur={e => {
                        const v = parseFloat(e.target.value)
                        if (!isNaN(v) && v !== Number(bucket.monthly_allocation)) update(bucket.id, { monthly_allocation: v })
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">/mo</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => { if (window.confirm(`Delete bucket "${bucket.name}"?`)) remove(bucket.id) }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
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

function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount)
}
