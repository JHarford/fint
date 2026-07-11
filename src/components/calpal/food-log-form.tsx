import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Camera, Loader2, Plus, ScanBarcode, Sparkles, X } from 'lucide-react'
import {
  estimateFoods, estimateFoodsFromPhoto, knownFood, lookupBarcode, usualFoods,
  type EstimatedFood,
} from '@/lib/calpal'
import { compressForVision } from '@/lib/image'
import { hasAnthropicKey } from '@/lib/coach'
import { todayKey } from '@/lib/goal-stats'
import { BarcodeScanner } from './barcode-scanner'
import type { FoodLog } from '@/types'

// Shared logging row: usuals chips + name/kcal/protein/fat + three capture
// paths (AI text estimate, plate photo, barcode). Repeat foods pre-fill their
// macros; multi-item estimates land in a confirm-preview.
export function FoodLogForm({ logs, onAdd, usualsLimit = 6, day }: {
  logs: FoodLog[]
  onAdd: (name: string, calories: number, protein: number, fat: number) => Promise<void>
  usualsLimit?: number
  day?: string // the day being logged (usuals already on it are hidden)
}) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')
  const [touched, setTouched] = useState(false)
  const [assumption, setAssumption] = useState('')
  const [pending, setPending] = useState<EstimatedFood[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const photoRef = useRef<HTMLInputElement>(null)

  const usuals = usualFoods(logs, day ?? todayKey(), usualsLimit)

  const fillFrom = (item: EstimatedFood) => {
    setName(item.name)
    setKcal(String(item.calories))
    setProtein(item.protein > 0 ? String(item.protein) : '')
    setFat(item.fat > 0 ? String(item.fat) : '')
    setTouched(false)
    setAssumption(item.assumption)
  }

  const clearForm = () => {
    setName(''); setKcal(''); setProtein(''); setFat(''); setTouched(false); setAssumption('')
  }

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

  const handleItems = (items: EstimatedFood[]) => {
    if (items.length === 1) fillFrom(items[0])
    else setPending(items)
  }

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      console.error('Cal Pal action failed:', e)
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const calculate = () => run(async () => {
    if (!name.trim()) return
    setPending(null)
    handleItems(await estimateFoods(name.trim()))
  })

  const onPhotoPicked = (file: File | undefined) => {
    if (!file) return
    run(async () => {
      setPending(null)
      const base64 = await compressForVision(file)
      handleItems(await estimateFoodsFromPhoto(base64))
    })
  }

  const onBarcode = (code: string) => {
    setScanning(false)
    run(async () => {
      fillFrom(await lookupBarcode(code))
    })
  }

  const submit = async () => {
    const n = parseInt(kcal, 10)
    if (!name.trim() || isNaN(n) || n < 0) return
    setError('')
    try {
      await onAdd(name.trim(), n, parseFloat(protein) || 0, parseFloat(fat) || 0)
      clearForm()
    } catch (e) {
      console.error('Food log failed:', e)
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  const addAllPending = () => run(async () => {
    for (const item of pending ?? []) await onAdd(item.name, item.calories, item.protein || 0, item.fat || 0)
    setPending(null)
    clearForm()
  })

  const removePending = (idx: number) => {
    setPending(prev => {
      const next = (prev ?? []).filter((_, i) => i !== idx)
      return next.length > 0 ? next : null
    })
  }

  const pendingTotal = (pending ?? []).reduce((a, i) => a + i.calories, 0)
  const pendingProtein = (pending ?? []).reduce((a, i) => a + (i.protein || 0), 0)
  const ai = hasAnthropicKey()

  const numProps = {
    type: 'number' as const,
    inputMode: 'numeric' as const,
    min: 0,
    className: 'h-9 text-sm min-w-0 flex-1',
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit() },
  }

  return (
    <div className="space-y-1.5">
      {/* One-tap usuals */}
      {usuals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {usuals.map(u => (
            <button
              key={u.id}
              disabled={busy}
              title={`${u.calories} kcal — tap to log`}
              onClick={() => onAdd(u.name, u.calories, Number(u.protein) || 0, Number(u.fat) || 0).catch(e => { console.error(e); setError('Could not save') })}
              className="text-xs border rounded-full px-2.5 py-1 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground max-w-full"
            >
              <span className="truncate">{u.name}</span>
              <span className="tabular-nums ml-1 opacity-70">{u.calories}</span>
            </button>
          ))}
        </div>
      )}

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { onPhotoPicked(e.target.files?.[0]); e.target.value = '' }}
      />

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
        {ai && (
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={busy || !name.trim()} onClick={calculate}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1 text-primary" />}
            Calculate
          </Button>
        )}
        {ai && (
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Photo of your plate" disabled={busy} onClick={() => photoRef.current?.click()}>
            <Camera className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Scan a barcode" disabled={busy} onClick={() => setScanning(true)}>
          <ScanBarcode className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" className="h-8 text-xs ml-auto" disabled={!name.trim() || !kcal} onClick={submit}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>
      {assumption && <p className="text-[10px] text-muted-foreground truncate">{assumption}</p>}

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

      {scanning && <BarcodeScanner onResult={onBarcode} onClose={() => setScanning(false)} />}
    </div>
  )
}
