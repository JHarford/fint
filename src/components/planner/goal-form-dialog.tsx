import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Goal, GoalType } from '@/types'
import { todayKey } from '@/lib/goal-stats'
import { GOAL_COLORS, GOAL_ICONS, GOAL_PRESETS, GOAL_TYPE_LABELS, goalColor } from './goal-meta'

export interface GoalFormValues {
  name: string
  description: string
  goal_type: GoalType
  icon: string
  color: string
  start_date: string
  frequency_per_week: number | null
  start_value: number
  target_value: number | null
  unit: string
  target_date: string | null
  weekly_spend: number | null
  weekly_units: number | null
}

interface GoalFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal?: Goal | null // set when editing
  onSave: (values: GoalFormValues) => Promise<void>
}

const emptyForm = (): GoalFormValues => ({
  name: '',
  description: '',
  goal_type: 'habit',
  icon: 'target',
  color: 'emerald',
  start_date: todayKey(),
  frequency_per_week: 3,
  start_value: 0,
  target_value: null,
  unit: '',
  target_date: null,
  weekly_spend: null,
  weekly_units: null,
})

export function GoalFormDialog({ open, onOpenChange, goal, onSave }: GoalFormDialogProps) {
  const [form, setForm] = useState<GoalFormValues>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (goal) {
      setForm({
        name: goal.name,
        description: goal.description,
        goal_type: goal.goal_type,
        icon: goal.icon,
        color: goal.color,
        start_date: goal.start_date,
        frequency_per_week: goal.frequency_per_week,
        start_value: Number(goal.start_value),
        target_value: goal.target_value !== null ? Number(goal.target_value) : null,
        unit: goal.unit,
        target_date: goal.target_date,
        weekly_spend: goal.weekly_spend !== null ? Number(goal.weekly_spend) : null,
        weekly_units: goal.weekly_units !== null ? Number(goal.weekly_units) : null,
      })
    } else {
      setForm(emptyForm())
    }
  }, [open, goal])

  const set = <K extends keyof GoalFormValues>(key: K, value: GoalFormValues[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const applyPreset = (presetName: string) => {
    const p = GOAL_PRESETS.find(x => x.name === presetName)
    if (!p) return
    setForm(prev => ({
      ...prev,
      name: p.name,
      description: p.description,
      goal_type: p.goal_type,
      icon: p.icon,
      color: p.color,
      frequency_per_week: p.frequency_per_week,
      unit: p.unit,
    }))
  }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        frequency_per_week: form.goal_type === 'habit' ? (form.frequency_per_week || 7) : null,
        start_value: form.goal_type === 'target' ? form.start_value : 0,
        target_value: form.goal_type === 'target' ? form.target_value : null,
        unit: form.goal_type === 'target' ? form.unit : '',
        target_date: form.goal_type === 'target' ? form.target_date : null,
        weekly_spend: form.goal_type === 'abstinence' ? form.weekly_spend : null,
        weekly_units: form.goal_type === 'abstinence' ? form.weekly_units : null,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal ? 'Edit goal' : 'New goal'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!goal && (
            <div className="flex flex-wrap gap-1.5">
              {GOAL_PRESETS.map(p => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p.name)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors hover:bg-muted ${form.name === p.name ? `${goalColor(p.color).soft} ${goalColor(p.color).text} border-transparent font-medium` : ''}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="goal-name">Name</Label>
              <Input id="goal-name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. No alcohol" />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="goal-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="goal-desc" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Why this matters to you" />
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.goal_type} onValueChange={v => set('goal_type', v as GoalType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_TYPE_LABELS) as GoalType[]).map(t => (
                    <SelectItem key={t} value={t}>{GOAL_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="goal-start">Start date</Label>
              <Input id="goal-start" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>

            {form.goal_type === 'abstinence' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="goal-spend">Weekly spend <span className="text-muted-foreground font-normal">(£, optional)</span></Label>
                  <Input
                    id="goal-spend"
                    type="number"
                    min={0}
                    value={form.weekly_spend ?? ''}
                    onChange={e => set('weekly_spend', e.target.value === '' ? null : parseFloat(e.target.value))}
                    placeholder="What it used to cost"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="goal-units">Units per week <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="goal-units"
                    type="number"
                    min={0}
                    value={form.weekly_units ?? ''}
                    onChange={e => set('weekly_units', e.target.value === '' ? null : parseFloat(e.target.value))}
                    placeholder="Drinks, cigarettes…"
                  />
                </div>
              </>
            )}

            {form.goal_type === 'habit' && (
              <div className="space-y-1.5">
                <Label htmlFor="goal-freq">Times per week</Label>
                <Input
                  id="goal-freq"
                  type="number"
                  min={1}
                  max={7}
                  value={form.frequency_per_week ?? ''}
                  onChange={e => set('frequency_per_week', parseInt(e.target.value, 10) || null)}
                />
              </div>
            )}

            {form.goal_type === 'target' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="goal-unit">Unit</Label>
                  <Input id="goal-unit" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="£, kg, km..." />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="goal-startval">Starting value</Label>
                  <Input
                    id="goal-startval"
                    type="number"
                    value={form.start_value}
                    onChange={e => set('start_value', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="goal-targetval">Target value</Label>
                  <Input
                    id="goal-targetval"
                    type="number"
                    value={form.target_value ?? ''}
                    onChange={e => set('target_value', e.target.value === '' ? null : parseFloat(e.target.value))}
                    placeholder="e.g. 10000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="goal-targetdate">Target date <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="goal-targetdate"
                    type="date"
                    value={form.target_date ?? ''}
                    onChange={e => set('target_date', e.target.value || null)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(GOAL_ICONS).map(([key, Icon]) => (
                <button
                  key={key}
                  onClick={() => set('icon', key)}
                  className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors hover:bg-muted ${form.icon === key ? `${goalColor(form.color).soft} ${goalColor(form.color).text} border-transparent` : 'text-muted-foreground'}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex gap-1.5">
              {Object.entries(GOAL_COLORS).map(([key, c]) => (
                <button
                  key={key}
                  onClick={() => set('color', key)}
                  className={`w-7 h-7 rounded-full ${c.solid} transition-transform ${form.color === key ? 'ring-2 ring-offset-2 ring-foreground/50 scale-105' : 'opacity-70 hover:opacity-100'}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : goal ? 'Save changes' : 'Create goal'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
