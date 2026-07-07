import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { estimateCalories, knownCalories } from '@/lib/calpal'
import { hasAnthropicKey } from '@/lib/coach'
import type { FoodLog } from '@/types'

// Shared logging row: name + kcal + AI estimate. Typing a food you've logged
// before pre-fills its last calorie count; the ✨ button asks Haiku.
export function FoodLogForm({ logs, onAdd }: {
  logs: FoodLog[]
  onAdd: (name: string, calories: number) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [kcalTouched, setKcalTouched] = useState(false)
  const [assumption, setAssumption] = useState('')
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
    try {
      const est = await estimateCalories(name.trim())
      setKcal(String(est.calories))
      setKcalTouched(false)
      setAssumption(est.assumption)
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
