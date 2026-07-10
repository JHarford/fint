import { useMemo, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { Bar, BarChart, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Scale, Trash2, TrendingDown, TrendingUp, UtensilsCrossed } from 'lucide-react'
import { useFoodLogs } from '@/hooks/use-food-logs'
import { useWeightLogs } from '@/hooks/use-weight-logs'
import { useCalPalSettings } from '@/hooks/use-calpal-settings'
import { ACTIVITY_LEVELS, caloriesOn, dailyTarget, macrosOn, proteinTarget } from '@/lib/calpal'
import { dateKey, todayKey } from '@/lib/goal-stats'
import { FoodLogForm } from './food-log-form'

export function CalPalTab() {
  const { logs, loading, add, remove } = useFoodLogs()
  const { settings, saved, save } = useCalPalSettings()
  const today = todayKey()

  const target = dailyTarget(settings)
  const macros = macrosOn(logs, today)
  const eaten = macros.calories
  const remaining = target - eaten
  const proteinGoal = proteinTarget(settings)
  const todayLogs = logs.filter(l => l.date === today)

  // Last 30 days of daily totals for the chart (only days with logs)
  const history = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => dateKey(subDays(new Date(), 29 - i)))
    return days.map(d => ({ date: d, total: caloriesOn(logs, d) }))
  }, [logs])
  const anyHistory = history.some(h => h.total > 0)

  if (loading) return <p className="text-sm text-muted-foreground animate-pulse py-8 text-center">Loading…</p>

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <UtensilsCrossed className="w-5 h-5 text-primary" /> Cal Pal
        </h2>
        <p className="text-sm text-muted-foreground">Log what you eat — repeat foods remember their calories</p>
      </div>

      {/* Today */}
      <Card className="py-4 px-4 gap-3">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {eaten.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">/ {target.toLocaleString()} kcal</span>
            </p>
            <p className={`text-sm ${remaining < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
              {remaining >= 0
                ? `${remaining.toLocaleString()} kcal left today`
                : `${Math.abs(remaining).toLocaleString()} kcal over today's target`}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Target: {settings.adjustment === 0 ? 'maintenance' : settings.adjustment > 0 ? `+${settings.adjustment} surplus` : `${settings.adjustment} deficit`}
          </p>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all ${eaten > target ? 'bg-red-500' : 'bg-primary'}`}
            style={{ width: `${Math.min(100, target > 0 ? (eaten / target) * 100 : 0)}%` }}
          />
        </div>

        {/* Protein against the g/kg target */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Protein</span>
            <span className="tabular-nums">
              <span className={macros.protein >= proteinGoal ? 'text-emerald-600 font-medium' : ''}>{Math.round(macros.protein)}g</span>
              <span className="text-muted-foreground"> / {proteinGoal}g</span>
              <span className="text-muted-foreground"> · fat {Math.round(macros.fat)}g</span>
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, proteinGoal > 0 ? (macros.protein / proteinGoal) * 100 : 0)}%` }}
            />
          </div>
        </div>

        <FoodLogForm logs={logs} onAdd={(name, kcal, p, f) => add(today, name, kcal, p, f)} />

        {todayLogs.length > 0 && (
          <div className="divide-y">
            {todayLogs.map(l => (
              <div key={l.id} className="flex items-center gap-2 py-1.5">
                <span className="text-sm flex-1 min-w-0 truncate">{l.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                  {l.calories.toLocaleString()} kcal{Number(l.protein) > 0 ? ` · ${Math.round(Number(l.protein))}P` : ''}{Number(l.fat) > 0 ? ` · ${Math.round(Number(l.fat))}F` : ''}
                </span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" title="Remove" onClick={() => remove(l.id).catch(e => console.error(e))}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* History */}
      <Card className="py-4 px-4 gap-2">
        <span className="font-display font-semibold">Last 30 days</span>
        {anyHistory ? (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={d => format(parseISO(d), 'd/M')}
                  tick={{ fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                />
                <YAxis hide domain={[0, (max: number) => Math.max(max, target * 1.2)]} />
                <Tooltip
                  formatter={(v) => [`${Number(v).toLocaleString()} kcal`, 'Eaten']}
                  labelFormatter={d => format(parseISO(String(d)), 'EEE d MMM')}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine y={target} stroke="var(--primary)" strokeDasharray="4 4" strokeOpacity={0.6} />
                <Bar dataKey="total" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {history.map(h => (
                    <Cell key={h.date} fill={h.total > target ? '#dc2626' : 'var(--primary)'} fillOpacity={h.total === 0 ? 0 : 0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Daily totals appear here once you've logged a few days. The dashed line is your target.</p>
        )}
      </Card>

      <WeightCard settings={settings} save={save} />

      <SettingsCard settings={settings} saved={saved} save={save} target={target} />
    </div>
  )
}

// Weigh-ins over time. Logging also updates the live bodyweight in settings,
// so the calorie target and g/kg protein goal follow your actual weight.
function WeightCard({ settings, save }: {
  settings: ReturnType<typeof useCalPalSettings>['settings']
  save: ReturnType<typeof useCalPalSettings>['save']
}) {
  const { logs, logWeight } = useWeightLogs()
  const [val, setVal] = useState('')
  const [error, setError] = useState('')
  const today = todayKey()
  const todayLog = logs.find(l => l.date === today)

  const data = useMemo(() =>
    [...logs]
      .filter(l => parseISO(l.date) >= subDays(new Date(), 90))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(l => ({ date: l.date, kg: Number(l.weight_kg) })),
  [logs])

  const latest = data[data.length - 1]
  const monthAgoKey = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const monthAgo = data.filter(d => d.date <= monthAgoKey).pop() ?? data[0]
  const delta = latest && monthAgo && latest.date !== monthAgo.date ? latest.kg - monthAgo.kg : null

  const submit = async () => {
    const w = parseFloat(val)
    if (isNaN(w) || w < 25 || w > 350) return
    setError('')
    try {
      await logWeight(today, w)
      await save({ weight_kg: w }) // target + protein goal follow the scale
      setVal('')
    } catch (e) {
      console.error('Weigh-in failed:', e)
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  return (
    <Card className="py-4 px-4 gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-muted-foreground" />
          <span className="font-display font-semibold">Weight</span>
          {latest && (
            <span className="text-sm tabular-nums">
              <span className="font-semibold">{latest.kg}kg</span>
              {delta !== null && Math.abs(delta) >= 0.1 && (
                <span className={`ml-1.5 text-xs inline-flex items-center gap-0.5 ${delta < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {delta < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}kg / 30d
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={25}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder={todayLog ? `${Number(todayLog.weight_kg)}kg today` : 'kg'}
            className="h-8 w-24 text-sm"
          />
          <Button size="sm" className="h-8 text-xs" disabled={!val} onClick={submit}>
            {todayLog ? 'Update' : 'Weigh in'}
          </Button>
        </div>
      </div>

      {data.length >= 2 ? (
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
              <XAxis
                dataKey="date"
                tickFormatter={d => format(parseISO(d), 'd/M')}
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(1)} kg`, 'Weight']}
                labelFormatter={d => format(parseISO(String(d)), 'EEE d MMM')}
                contentStyle={{ fontSize: 12 }}
              />
              <Line type="monotone" dataKey="kg" stroke="var(--primary)" strokeWidth={2}
                dot={{ r: 2, fill: 'var(--primary)', strokeWidth: 0 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Weigh in each morning and the trend shows up here — that's how you know the
          {settings.adjustment < 0 ? ' deficit' : settings.adjustment > 0 ? ' surplus' : ' target'} is actually working.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  )
}

function SettingsCard({ settings, saved, save, target }: {
  settings: ReturnType<typeof useCalPalSettings>['settings']
  saved: boolean
  save: ReturnType<typeof useCalPalSettings>['save']
  target: number
}) {
  const [form, setForm] = useState({
    weight_kg: String(settings.weight_kg),
    height_cm: String(settings.height_cm),
    age: String(settings.age),
  })
  const [lastSettings, setLastSettings] = useState(settings)
  if (settings !== lastSettings) {
    setLastSettings(settings)
    setForm({ weight_kg: String(settings.weight_kg), height_cm: String(settings.height_cm), age: String(settings.age) })
  }

  const commitNumbers = () => {
    const w = parseFloat(form.weight_kg), h = parseFloat(form.height_cm), a = parseInt(form.age, 10)
    const updates: Record<string, number> = {}
    if (!isNaN(w) && w > 20 && w !== Number(settings.weight_kg)) updates.weight_kg = w
    if (!isNaN(h) && h > 100 && h !== Number(settings.height_cm)) updates.height_cm = h
    if (!isNaN(a) && a > 10 && a !== settings.age) updates.age = a
    if (Object.keys(updates).length > 0) save(updates).catch(e => console.error('Settings save failed:', e))
  }

  return (
    <Card className="py-4 px-4 gap-3">
      <div className="flex items-center justify-between">
        <span className="font-display font-semibold">Settings</span>
        <span className="text-xs text-muted-foreground">Daily target: <span className="font-semibold text-foreground tabular-nums">{target.toLocaleString()} kcal</span></span>
      </div>
      {!saved && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          These are defaults — set your real numbers so the target means something.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Weight (kg)</Label>
          <Input type="number" inputMode="decimal" className="h-9" value={form.weight_kg}
            onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} onBlur={commitNumbers} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Height (cm)</Label>
          <Input type="number" inputMode="decimal" className="h-9" value={form.height_cm}
            onChange={e => setForm(f => ({ ...f, height_cm: e.target.value }))} onBlur={commitNumbers} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Age</Label>
          <Input type="number" inputMode="numeric" className="h-9" value={form.age}
            onChange={e => setForm(f => ({ ...f, age: e.target.value }))} onBlur={commitNumbers} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Sex</Label>
          <Select value={settings.sex} onValueChange={v => save({ sex: v as 'male' | 'female' }).catch(e => console.error(e))}>
            <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Activity</Label>
          <Select value={String(settings.activity)} onValueChange={v => save({ activity: parseFloat(v) }).catch(e => console.error(e))}>
            <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIVITY_LEVELS.map(a => <SelectItem key={a.value} value={String(a.value)}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Deficit ↔ surplus</Label>
          <span className={`text-xs tabular-nums font-medium ${settings.adjustment < 0 ? 'text-emerald-600' : settings.adjustment > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
            {settings.adjustment > 0 ? `+${settings.adjustment}` : settings.adjustment} kcal/day
          </span>
        </div>
        <input
          type="range"
          min={-1000}
          max={1000}
          step={50}
          value={settings.adjustment}
          onChange={e => save({ adjustment: parseInt(e.target.value, 10) }).catch(err => console.error(err))}
          className="w-full accent-[var(--primary)]"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>−1000 (cut)</span><span>maintain</span><span>+1000 (bulk)</span>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Protein target</Label>
          <span className="text-xs tabular-nums">
            <span className="font-medium">{Number(settings.protein_per_kg).toFixed(1)} g/kg</span>
            <span className="text-muted-foreground"> = {proteinTarget(settings)}g/day</span>
          </span>
        </div>
        <input
          type="range"
          min={0.8}
          max={2.4}
          step={0.1}
          value={Number(settings.protein_per_kg)}
          onChange={e => save({ protein_per_kg: parseFloat(e.target.value) }).catch(err => console.error(err))}
          className="w-full accent-[var(--primary)]"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0.8 maintain</span><span>1.6–2.2 building muscle</span><span>2.4</span>
        </div>
      </div>
    </Card>
  )
}
