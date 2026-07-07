import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, Sparkles, X } from 'lucide-react'
import { estimateFoods, knownCalories, type EstimatedFood } from '@/lib/calpal'
import { hasAnthropicKey } from '@/lib/coach'
import type { FoodLog } from '@/types'

// Shared logging row: name + kcal + AI estimate. Typing a food you've logged
// before pre-fills its last calorie count. Calculate splits a description
// into separate standardised items ("…and a coke" becomes its own line),
// shown as a preview to confirm before they're added.
export function FoodLogForm({ logs, onAdd }: {
  logs: FoodLog[]
  onAdd: (name: string, calories: number) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [kcalTouched, setKcalTouched] = useState(false)
  const [assumption, setAssumption] = useState('')
  const [pending, setPending] = useState<EstimatedFood[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onNameChange = (v: string) => {
    setName(v)
    setAssumption('')
    if (!kcalTouched) {
      const known = knownCalories(logs, v)
      setKcal(known !== null ? String(known) : '')
    }
  }

  const calculate = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError('')
    setPending(null)
    try {
      const items = await estimateFoods(name.trim())
      if (items.length === 1) {
        // Standardised rename + estimate straight into the fields
        setName(items[0].name)
        setKcal(String(items[0].calories))
        setKcalTouched(false)
        setAssumption(items[0].assumption)
      } else {
        setPending(items)
      }
    } catch (e) {
      console.error('Calorie estimate failed:', e)
      setError(e instanceof Error ? e.message : 'Estimate failed — enter it manually')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    const n = parseInt(kcal, 10)
    if (!name.trim() || isNaN(n) || n < 0) return
    setError('')
    try {
      await onAdd(name.trim(), n)
      setName(''); setKcal(''); setKcalTouched(false); setAssumption('')
    } catch (e) {
      console.error('Food log failed:', e)
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  const addAllPending = async () => {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    try {
      for (const item of pending) await onAdd(item.name, item.calories)
      setPending(null)
      setName(''); setKcal(''); setKcalTouched(false); setAssumption('')
    } catch (e) {
      console.error('Food log failed:', e)
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const removePending = (idx: number) => {
    setPending(prev => {
      const next = (prev ?? []).filter((_, i) => i !== idx)
      return next.length > 0 ? next : null
    })
  }

  const pendingTotal = (pending ?? []).reduce((a, i) => a + i.calories, 0)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={name}
          onChange={e => onNameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && kcal) submit() }}
          placeholder="What did you eat? e.g. burger from the pub"
          className="h-9 text-sm flex-1 min-w-0"
        />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={kcal}
          onChange={e => { setKcal(e.target.value); setKcalTouched(true); setAssumption('') }}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="kcal"
          className="h-9 text-sm w-20 shrink-0"
        />
      </div>
      <div className="flex items-center gap-1.5">
        {hasAnthropicKey() && (
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={busy || !name.trim()} onClick={calculate}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1 text-primary" />}
            Calculate
          </Button>
        )}
        <Button size="sm" className="h-8 text-xs" disabled={!name.trim() || !kcal} onClick={submit}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
        {assumption && <span className="text-[10px] text-muted-foreground truncate flex-1">{assumption}</span>}
      </div>

      {/* Multi-item estimate: confirm before logging each as its own entry */}
      {pending && (
        <div className="border rounded-lg p-2.5 space-y-1.5 bg-muted/30">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Split into {pending.length} items
          </p>
          {pending.map((item, i) => (
            <div key={`${item.name}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate" title={item.assumption}>{item.name}</span>
              <span className="tabular-nums text-muted-foreground shrink-0">{item.calories.toLocaleString()} kcal</span>
              <button className="text-muted-foreground hover:text-destructive p-0.5 shrink-0" title="Remove item" onClick={() => removePending(i)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 border-t">
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={addAllPending}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Add all · {pendingTotal.toLocaleString()} kcal
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
