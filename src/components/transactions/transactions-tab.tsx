import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChevronDown, X, Search, Sparkles, Repeat, type LucideIcon } from 'lucide-react'
import { format, parseISO, subMonths } from 'date-fns'
import { useTransactions } from '@/hooks/use-transactions'
import { useSources } from '@/hooks/use-sources'
import { CATEGORIES, CATEGORY_META, UNCATEGORISED, categoryOrUncategorised } from '@/lib/categories'
import { SuggestRecurringDialog, type ApplyGroup } from './suggest-recurring-dialog'
import type { Recurrence } from '@/types'

const PAGE_SIZE = 200
type TypeFilter = 'all' | 'expense' | 'income'

const RECURRENCE_LABELS: Record<Recurrence | 'none', string> = {
  weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly',
  annually: 'Annually', 'one-off': 'One-off', none: '—',
}
const RECURRENCE_STYLES: Record<Recurrence | 'none', string> = {
  weekly:    'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  monthly:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  quarterly: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  annually:  'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  'one-off': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  none:      'bg-muted text-muted-foreground',
}

export function TransactionsTab() {
  const { transactions, setRecurrence } = useTransactions()
  const { sources } = useSources()

  const [search, setSearch] = useState('')
  const [accountIds, setAccountIds] = useState<Set<string>>(new Set())
  const [categoriesF, setCategoriesF] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [minAmount, setMinAmount] = useState<string>('')
  const [maxAmount, setMaxAmount] = useState<string>('')
  const [fromMonth, setFromMonth] = useState<string>('')  // YYYY-MM
  const [toMonth, setToMonth] = useState<string>('')
  const [recurrenceFilter, setRecurrenceFilter] = useState<'all' | 'tagged' | 'untagged'>('all')
  const [page, setPage] = useState(0)
  const [suggestOpen, setSuggestOpen] = useState(false)

  const sourceById = useMemo(() => Object.fromEntries(sources.map(s => [s.id, s])), [sources])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    const min = minAmount ? parseFloat(minAmount) : null
    const max = maxAmount ? parseFloat(maxAmount) : null
    const from = fromMonth ? new Date(`${fromMonth}-01T00:00:00`) : null
    const to = toMonth ? endOfMonthFromKey(toMonth) : null

    return transactions.filter(t => {
      if (accountIds.size > 0 && !accountIds.has(t.source_id)) return false
      if (categoriesF.size > 0) {
        const c = t.category || UNCATEGORISED
        if (!categoriesF.has(c)) return false
      }
      if (typeFilter === 'expense' && t.amount <= 0) return false
      if (typeFilter === 'income' && t.amount >= 0) return false

      const abs = Math.abs(t.amount)
      if (min !== null && abs < min) return false
      if (max !== null && abs > max) return false

      if (from || to) {
        const d = parseISO(t.date)
        if (from && d < from) return false
        if (to && d > to) return false
      }

      if (recurrenceFilter === 'tagged' && !t.recurrence) return false
      if (recurrenceFilter === 'untagged' && t.recurrence) return false

      if (s) {
        const hay = `${t.memo} ${t.subcategory} ${t.category}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [transactions, search, accountIds, categoriesF, typeFilter, minAmount, maxAmount, fromMonth, toMonth, recurrenceFilter])

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE)

  const stats = useMemo(() => {
    const out = filtered.filter(t => t.amount > 0).reduce((a, t) => a + t.amount, 0)
    const inn = filtered.filter(t => t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0)
    const recurring = filtered.filter(t => !!t.recurrence).length
    return { count: filtered.length, out, inn, net: inn - out, recurring }
  }, [filtered])

  const resetFilters = () => {
    setSearch(''); setAccountIds(new Set()); setCategoriesF(new Set())
    setTypeFilter('all'); setMinAmount(''); setMaxAmount('')
    setFromMonth(''); setToMonth(''); setRecurrenceFilter('all'); setPage(0)
  }

  const toggleSet = <T,>(s: Set<T>, v: T): Set<T> => {
    const n = new Set(s)
    if (n.has(v)) n.delete(v); else n.add(v)
    return n
  }

  const setRowRecurrence = async (id: string, recurrence: Recurrence | null) => {
    const t = transactions.find(x => x.id === id)
    if (!t) return
    await setRecurrence([id], recurrence, recurrence ? (t.recurrence_group || t.memo) : '', 'manual')
  }

  const applySuggestedGroups = async (groups: ApplyGroup[]) => {
    for (const g of groups) {
      const freq = g.frequency === 'irregular' ? null : g.frequency
      await setRecurrence(g.memberIds, freq, g.displayName, g.confidence)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span>All Transactions</span>
          <div className="flex flex-wrap items-center gap-2 text-sm font-normal">
            <Badge variant="secondary">{stats.count} txs</Badge>
            <Badge variant="outline" className="text-emerald-600">+{formatCurrency(stats.inn)}</Badge>
            <Badge variant="outline" className="text-red-600">-{formatCurrency(stats.out)}</Badge>
            <Badge variant="default">Net {formatCurrency(stats.net)}</Badge>
            <Badge variant="outline" className="gap-1"><Repeat className="w-3 h-3" />{stats.recurring} recurring</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter row 1 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              placeholder="Search memo / category…"
              className="h-9 w-full sm:w-64 pl-7"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v as TypeFilter); setPage(0) }}>
              <SelectTrigger className="h-9 w-full sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="expense">Expenses</SelectItem>
                <SelectItem value="income">Income</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recurrenceFilter} onValueChange={v => { setRecurrenceFilter(v as typeof recurrenceFilter); setPage(0) }}>
              <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All recurrence states</SelectItem>
                <SelectItem value="tagged">Tagged recurring</SelectItem>
                <SelectItem value="untagged">Not tagged</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              type="number"
              value={minAmount}
              onChange={e => { setMinAmount(e.target.value); setPage(0) }}
              placeholder="Min £"
              className="h-9 flex-1 sm:flex-none sm:w-24"
            />
            <span className="text-muted-foreground text-sm">–</span>
            <Input
              type="number"
              value={maxAmount}
              onChange={e => { setMaxAmount(e.target.value); setPage(0) }}
              placeholder="Max £"
              className="h-9 flex-1 sm:flex-none sm:w-24"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <MonthSelect value={fromMonth} anyLabel="From: any" onChange={v => { setFromMonth(v); setPage(0) }} />
            <span className="text-muted-foreground text-sm">→</span>
            <MonthSelect value={toMonth} anyLabel="To: any" onChange={v => { setToMonth(v); setPage(0) }} />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button size="sm" variant="default" onClick={() => setSuggestOpen(true)} className="h-9 flex-1 sm:flex-none">
              <Sparkles className="w-3.5 h-3.5 mr-1" /> Suggest recurring
            </Button>
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9">
              <X className="w-3.5 h-3.5 mr-1" /> Reset
            </Button>
          </div>
        </div>

        {/* Mobile: compact multi-select dialogs instead of chip walls */}
        <div className="flex gap-2 sm:hidden">
          <FilterMultiSelect
            label="Accounts"
            options={sources.map(s => ({ value: s.id, label: s.name }))}
            selected={accountIds}
            onToggle={v => { setAccountIds(toggleSet(accountIds, v)); setPage(0) }}
            onClear={() => { setAccountIds(new Set()); setPage(0) }}
          />
          <FilterMultiSelect
            label="Categories"
            options={[UNCATEGORISED, ...CATEGORIES].map(c => {
              const meta = CATEGORY_META[c as keyof typeof CATEGORY_META]
              return { value: c, label: c, icon: meta.icon, color: meta.color }
            })}
            selected={categoriesF}
            onToggle={v => { setCategoriesF(toggleSet(categoriesF, v)); setPage(0) }}
            onClear={() => { setCategoriesF(new Set()); setPage(0) }}
          />
        </div>

        {/* Desktop: chip rows */}
        <div className="hidden sm:flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Account:</span>
          {sources.map(s => (
            <Badge
              key={s.id}
              variant={accountIds.has(s.id) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => { setAccountIds(toggleSet(accountIds, s.id)); setPage(0) }}
            >
              {s.name}
            </Badge>
          ))}
        </div>

        <div className="hidden sm:flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Category:</span>
          {[UNCATEGORISED, ...CATEGORIES].map(c => {
            const meta = CATEGORY_META[c as keyof typeof CATEGORY_META]
            const Icon = meta.icon
            const active = categoriesF.has(c)
            return (
              <Badge
                key={c}
                variant={active ? 'default' : 'outline'}
                className="cursor-pointer flex items-center gap-1"
                onClick={() => { setCategoriesF(toggleSet(categoriesF, c)); setPage(0) }}
              >
                <Icon className={`w-3 h-3 ${active ? '' : meta.color}`} />
                {c}
              </Badge>
            )
          })}
        </div>

        {/* Table: 7-column grid on desktop, stacked cards on mobile */}
        <div className="border rounded-md overflow-hidden">
          <div className="hidden md:grid grid-cols-[90px_140px_1fr_120px_140px_100px_140px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b">
            <span>Date</span>
            <span>Account</span>
            <span>Memo</span>
            <span>Category</span>
            <span>Subcategory</span>
            <span className="text-right">Amount</span>
            <span>Recurrence</span>
          </div>
          <div className="max-h-[640px] overflow-auto">
            {visible.map(t => {
              const meta = CATEGORY_META[categoryOrUncategorised(t.category)]
              const Icon = meta.icon
              const rec: Recurrence | 'none' = t.recurrence ?? 'none'
              const recurrenceSelect = (
                <Select
                  value={rec}
                  onValueChange={v => setRowRecurrence(t.id, v === 'none' ? null : v as Recurrence)}
                >
                  <SelectTrigger className="h-7 text-xs px-2" title={t.recurrence_group ? `Group: ${t.recurrence_group}` : 'Not recurring'}>
                    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${RECURRENCE_STYLES[rec]}`}>
                      <Repeat className="w-2.5 h-2.5" />
                      <span className="font-medium">{RECURRENCE_LABELS[rec]}</span>
                      {t.recurrence_group && (
                        <span className="opacity-75 truncate max-w-[70px]">· {t.recurrence_group}</span>
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Clear</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                    <SelectItem value="one-off">One-off</SelectItem>
                  </SelectContent>
                </Select>
              )
              return (
                <div key={t.id} className="border-b">
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-[90px_140px_1fr_120px_140px_100px_140px] gap-2 px-3 py-2 items-center text-sm">
                    <span className="text-xs text-muted-foreground tabular-nums">{format(parseISO(t.date), 'd MMM yy')}</span>
                    <span className="text-xs truncate" title={sourceById[t.source_id]?.name}>{sourceById[t.source_id]?.name}</span>
                    <span className="truncate" title={t.memo}>{t.memo}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      <span className="truncate">{t.category || UNCATEGORISED}</span>
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{t.subcategory || '—'}</span>
                    <span className={`text-right tabular-nums ${t.amount < 0 ? 'text-emerald-600' : ''}`}>
                      {formatCurrency(t.amount)}
                    </span>
                    {recurrenceSelect}
                  </div>
                  {/* Mobile card */}
                  <div className="md:hidden px-3 py-2.5 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium truncate min-w-0">{t.memo}</span>
                      <span className={`text-sm tabular-nums shrink-0 ${t.amount < 0 ? 'text-emerald-600' : ''}`}>
                        {formatCurrency(t.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 min-w-0">
                        <Icon className={`w-3 h-3 shrink-0 ${meta.color}`} />
                        <span className="truncate">
                          {t.category || UNCATEGORISED}
                          {t.subcategory ? ` · ${t.subcategory}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {format(parseISO(t.date), 'd MMM')} · {sourceById[t.source_id]?.name}
                      </span>
                    </div>
                    <div className="pt-0.5">{recurrenceSelect}</div>
                  </div>
                </div>
              )
            })}
            {visible.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">No transactions match these filters.</div>
            )}
          </div>
        </div>

        <SuggestRecurringDialog
          open={suggestOpen}
          onClose={() => setSuggestOpen(false)}
          transactions={transactions}
          onApply={applySuggestedGroups}
        />

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Showing {visible.length} of {filtered.length}
            {filtered.length > visible.length && (
              <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={() => setPage(p => p + 1)}>Load more</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// A real month picker — iOS renders empty type="month" inputs as blank boxes
function MonthSelect({ value, anyLabel, onChange }: {
  value: string
  anyLabel: string
  onChange: (v: string) => void
}) {
  const options = useMemo(() =>
    Array.from({ length: 36 }, (_, i) => {
      const d = subMonths(new Date(), i)
      return { key: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') }
    }), [])
  return (
    <Select value={value || 'any'} onValueChange={v => onChange(v === 'any' ? '' : v)}>
      <SelectTrigger className="h-9 flex-1 sm:flex-none sm:w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="any">{anyLabel}</SelectItem>
        {options.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

// Compact multi-select for mobile filter buttons
function FilterMultiSelect({ label, options, selected, onToggle, onClear }: {
  label: string
  options: { value: string; label: string; icon?: LucideIcon; color?: string }[]
  selected: Set<string>
  onToggle: (v: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant={selected.size > 0 ? 'default' : 'outline'}
        size="sm"
        className="h-9 flex-1"
        onClick={() => setOpen(true)}
      >
        {label}{selected.size > 0 && ` · ${selected.size}`}
        <ChevronDown className="w-3.5 h-3.5 ml-1" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription className="sr-only">Filter transactions by {label.toLowerCase()}</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-0.5">
            {options.map(o => {
              const Icon = o.icon
              return (
                <label key={o.value} className="flex items-center gap-2.5 px-1.5 py-2 rounded-md hover:bg-muted cursor-pointer text-sm select-none">
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => onToggle(o.value)}
                    className="accent-[var(--primary)]"
                  />
                  {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${o.color ?? ''}`} />}
                  <span className="truncate">{o.label}</span>
                </label>
              )
            })}
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={onClear} disabled={selected.size === 0}>Clear</Button>
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function endOfMonthFromKey(key: string): Date {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0, 23, 59, 59)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}
