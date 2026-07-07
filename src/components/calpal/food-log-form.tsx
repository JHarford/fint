import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, Sparkles, X } from 'lucide-react'
import { estimateFoods, knownFood, type EstimatedFood } from '@/lib/calpal'
import { hasAnthropicKey } from '@/lib/coach'
import type { FoodLog } from '@/types'

// Shared logging row: name + kcal/protein/fat + AI estimate. Typing a food
// you've logged before pre-fills its macros. Calculate splits a description
// into separate standardised items, each with kcal/P/F, shown as a preview
// to confirm before they're added.
export function FoodLogForm({ logs, onAdd }: {
  logs: FoodLog[]
  onAdd: (name: string, calories: number, protein: number, fat: number) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')
  const [touched, setTouched] = useState(false)
  const [assumption, setAssumption] = useState('')
  const [pending, setPending] = useState<EstimatedFood[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onNameChange = (v: string) => {
    setName(v)
    setAssumption('')
    if (!touched) {
      const known = knownFood(logs, v)
      setKcal(known ? String(known.calories) : '')
      setProtein(known && known.protein > 0 ? String(known.protein) : '')
      setFat(known && known.fat > 0 ? String(known.fat) : '')
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
        // Standardised rename + estimates straight into the fields
        setName(items[0].name)
        setKcal(String(items[0].calories))
        setProtein(String(items[0].protein))
        setFat(String(items[0].fat))
        setTouched(false)
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
      await onAdd(name.trim(), n, parseFloat(protein) || 0, parseFloat(fat) || 0)
      setName(''); setKcal(''); setProtein(''); setFat(''); setTouched(false); setAssumption('')
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
      for (const item of pending) await onAdd(item.name, item.calories, item.protein || 0, item.fat || 0)
      setPending(null)
      setName(''); setKcal(''); setProtein(''); setFat(''); setTouched(false); setAssumption('')
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
  const pendingProtein = (pending ?? []).reduce((a, i) => a + (i.protein || 0), 0)

  const numProps = {
    type: 'number' as const,
    inputMode: 'numeric' as const,
    min: 0,
    className: 'h-9 text-sm min-w-0 flex-1',
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit() },
  }

  return (
    <div className="space-y-1.5">
      <Input
        value={name}
        onChange={e => onNameChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && kcal) submit() }}
        placeholder="What did you eat? e.g. burger from the pub"
        className="h-9 text-sm w-full"
      />
      <div className="flex items-center gap-1.5">
        <Input {...numProps} value={kcal} placeholder="kcal"
          onChange={e => { setKcal(e.target.value); setTouched(true); setAssumption('') }} />
        <Input {...numProps} value={protein} placeholder="protein g"
          onChange={e => { setProtein(e.target.value); setTouched(true) }} />
        <Input {...numProps} value={fat} placeholder="fat g"
          onChange={e => { setFat(e.target.value); setTouched(true) }} />
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
              <span className="tabular-nums text-muted-foreground shrink-0 text-xs">
                {item.calories.toLocaleString()} kcal · {item.protein || 0}P · {item.fat || 0}F
              </span>
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
              Add all · {pendingTotal.toLocaleString()} kcal · {pendingProtein}g protein
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
