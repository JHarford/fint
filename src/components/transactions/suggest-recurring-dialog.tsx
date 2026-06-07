import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, CheckCircle2, AlertCircle, Search } from 'lucide-react'
import { detectRecurringGroups, refineWithLlm, monthlyEquivalent, type DetectedGroup, type RefinedGroup, type DetectedFrequency } from '@/lib/recurrence-detector'
import type { Transaction } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  transactions: Transaction[]
  onApply: (groups: ApplyGroup[]) => Promise<void>
}

export interface ApplyGroup {
  displayName: string
  frequency: DetectedFrequency
  memberIds: string[]
  confidence: 'detected' | 'llm' | 'manual'
}

type Phase = 'idle' | 'detecting' | 'refining' | 'review' | 'applying' | 'done'

const FREQUENCY_LABELS: Record<DetectedFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
  'one-off': 'One-off',
  irregular: 'Irregular',
}

export function SuggestRecurringDialog({ open, onClose, transactions, onApply }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [loose, setLoose] = useState<DetectedGroup[]>([])
  const [refined, setRefined] = useState<RefinedGroup[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [stats, setStats] = useState<string>('')

  const candidateTxs = useMemo(
    () => transactions.filter(t => !t.recurrence),
    [transactions],
  )

  const reset = () => {
    setPhase('idle'); setLoose([]); setRefined([]); setSelected(new Set()); setError(''); setStats('')
  }

  const handleClose = () => {
    reset(); onClose()
  }

  const runDetection = async () => {
    setError(''); setPhase('detecting')
    try {
      const detected = detectRecurringGroups(candidateTxs, { minOccurrences: 2, maxAmountVariance: 0.25 })
      setLoose(detected)
      setStats(`${detected.length} candidate groups from ${candidateTxs.length} untagged transactions`)
      // Auto-select high + medium confidence groups
      const initial = new Set<number>()
      detected.forEach((g, i) => { if (g.confidence !== 'low') initial.add(i) })
      setPhase('review')
      // Stash detected as refined too (in case user skips AI pass)
      setRefined(detected.map(g => ({
        displayName: prettifyPattern(g.pattern),
        patterns: [g.pattern],
        memberIds: g.memberIds,
        frequency: g.inferredFrequency,
        category: g.category,
        monthlyEquivalent: monthlyEquivalent(g.medianAmount, g.inferredFrequency),
        source: 'detected' as const,
      })))
      setSelected(initial)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detection failed')
      setPhase('idle')
    }
  }

  const runAiRefine = async () => {
    setError(''); setPhase('refining')
    try {
      // Pass ungrouped tx sample so LLM can find groups loose detector missed
      const groupedIds = new Set(loose.flatMap(g => g.memberIds))
      const ungrouped = candidateTxs.filter(t => !groupedIds.has(t.id))
      const llmRefined = await refineWithLlm(loose, ungrouped, transactions)
      setRefined(llmRefined)
      setStats(`${llmRefined.length} groups after AI refinement`)
      const initial = new Set<number>()
      llmRefined.forEach((_, i) => initial.add(i))
      setSelected(initial)
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI refinement failed')
      setPhase('review')
    }
  }

  const toggleSelect = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === refined.length) setSelected(new Set())
    else setSelected(new Set(refined.map((_, i) => i)))
  }

  const apply = async () => {
    if (selected.size === 0) return
    setError(''); setPhase('applying')
    try {
      const groups: ApplyGroup[] = Array.from(selected).map(i => {
        const g = refined[i]
        return {
          displayName: g.displayName,
          frequency: g.frequency,
          memberIds: g.memberIds,
          confidence: g.source,
        }
      })
      await onApply(groups)
      setPhase('done')
      setStats(`Tagged ${groups.reduce((s, g) => s + g.memberIds.length, 0)} transactions across ${groups.length} groups`)
      setTimeout(handleClose, 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed')
      setPhase('review')
    }
  }

  const totalMonthly = useMemo(
    () => Array.from(selected).reduce((sum, i) => sum + refined[i].monthlyEquivalent, 0),
    [selected, refined],
  )

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Suggest Recurring Transactions
          </DialogTitle>
          <DialogDescription>
            Detected recurring patterns from your tagged-free transactions. Optionally refine with AI.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {phase === 'idle' && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Scans your {candidateTxs.length} untagged transactions for recurring patterns.
                Step 1 clusters by merchant + interval. Step 2 (optional) sends results to AI to merge
                semantically-related groups like multiple Apple charges.
              </p>
              <Button onClick={runDetection}>
                <Search className="w-4 h-4 mr-1" /> Run detection
              </Button>
            </div>
          )}

          {phase === 'detecting' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Detecting patterns…
            </div>
          )}

          {phase === 'refining' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Asking AI to merge semantic groups…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {(phase === 'review' || phase === 'applying' || phase === 'done') && refined.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{stats}</Badge>
                <Badge variant="outline">{selected.size} selected</Badge>
                {totalMonthly > 0 && (
                  <Badge variant="default">
                    ~{formatCurrency(totalMonthly)}/mo
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={toggleAll}>
                    {selected.size === refined.length ? 'Deselect all' : 'Select all'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={runAiRefine} disabled={phase !== 'review'}>
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> Refine with AI
                  </Button>
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-[28px_minmax(240px,1fr)_100px_90px_90px_60px] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b">
                  <span></span>
                  <span>Group</span>
                  <span>Frequency</span>
                  <span className="text-right">Median</span>
                  <span className="text-right">£/mo</span>
                  <span className="text-right">#</span>
                </div>
                <div className="max-h-[480px] overflow-auto">
                  {refined.map((g, i) => (
                    <div key={`${g.displayName}-${i}`} className="grid grid-cols-[28px_minmax(240px,1fr)_100px_90px_90px_60px] gap-3 px-3 py-2 items-center border-b text-sm hover:bg-muted/20">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggleSelect(i)}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate" title={g.displayName}>{g.displayName}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {g.category || 'uncategorised'}
                          {g.source === 'llm' && <span className="ml-2 text-purple-600 font-medium">AI</span>}
                        </span>
                      </div>
                      <Badge variant="outline" className="w-fit text-xs">
                        {FREQUENCY_LABELS[g.frequency]}
                      </Badge>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {formatCurrency(medianAmount(g))}
                      </span>
                      <span className="text-right tabular-nums">
                        {formatCurrency(g.monthlyEquivalent)}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">{g.memberIds.length}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button onClick={apply} disabled={selected.size === 0 || phase === 'applying'}>
                  {phase === 'applying' && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Apply to {selected.size} groups
                </Button>
              </div>
            </>
          )}

          {phase === 'done' && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <CheckCircle2 className="w-4 h-4" /> {stats}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function prettifyPattern(pattern: string): string {
  return pattern
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function medianAmount(g: RefinedGroup): number {
  if (g.frequency === 'monthly') return g.monthlyEquivalent
  if (g.frequency === 'weekly') return g.monthlyEquivalent * 12 / 52
  if (g.frequency === 'quarterly') return g.monthlyEquivalent * 3
  if (g.frequency === 'annually') return g.monthlyEquivalent * 12
  return 0
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount)
}
