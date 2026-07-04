import { useState, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Wallet, ChevronDown, ChevronRight } from 'lucide-react'
import { useSources } from '@/hooks/use-sources'
import { useBalances } from '@/hooks/use-balances'
import { getLatestBalance } from '@/lib/calculations'
import type { Source, SourceType, AccountBalance } from '@/types'

const sourceTypeLabels: Record<SourceType, string> = {
  credit_card: 'Credit Card',
  bank_account: 'Bank Account',
  loan: 'Loan',
}

const HISTORY_LIMIT = 3

type SourceDialogState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; source: Source }

type BalanceDialogState =
  | { mode: 'closed' }
  | { mode: 'open'; source: Source }

export function AccountsManager() {
  const { sources, loading: sourcesLoading, create: createSource, update: updateSource, remove: removeSource } = useSources()
  const { balances, loading: balancesLoading, create: createBalance, remove: removeBalance } = useBalances()

  const [sourceDialog, setSourceDialog] = useState<SourceDialogState>({ mode: 'closed' })
  const [balanceDialog, setBalanceDialog] = useState<BalanceDialogState>({ mode: 'closed' })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const loading = sourcesLoading || balancesLoading

  const toggleExpanded = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const getHistory = (sourceId: string): AccountBalance[] =>
    balances
      .filter(b => b.source_id === sourceId)
      .sort((a, b) => new Date(b.as_of_date).getTime() - new Date(a.as_of_date).getTime())

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Accounts</CardTitle>
        <Button size="sm" onClick={() => setSourceDialog({ mode: 'create' })}>
          <Plus className="w-4 h-4 mr-1" /> Add Account
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : sources.length === 0 ? (
          <p className="text-muted-foreground text-sm">No accounts yet. Add your first financial account.</p>
        ) : (
          <>
          {/* Mobile: vertical card list — tap an account to update its balance */}
          <div className="md:hidden space-y-2">
            {sources.map(source => {
              const latest = getLatestBalance(balances, source.id)
              const latestEntry = getHistory(source.id)[0]
              return (
                <div key={source.id} className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between gap-2 p-3 text-left active:bg-muted/50"
                    onClick={() => setBalanceDialog({ mode: 'open', source })}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{source.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{sourceTypeLabels[source.type]}</Badge>
                        {latestEntry && <span>as of {latestEntry.as_of_date}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {latest === null ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : (
                        <span className={`font-semibold tabular-nums ${latest >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(latest)}
                        </span>
                      )}
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                        <Wallet className="w-3 h-3" /> tap to update
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center justify-end gap-1 px-2 pb-1.5 -mt-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSourceDialog({ mode: 'edit', source })}>
                      <Pencil className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => removeSource(source.id)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Desktop: full table */}
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Latest Balance</TableHead>
                <TableHead>As of</TableHead>
                <TableHead className="w-40 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map(source => {
                const history = getHistory(source.id)
                const latest = getLatestBalance(balances, source.id)
                const latestEntry = history[0]
                const isOpen = !!expanded[source.id]
                const historySlice = history.slice(0, HISTORY_LIMIT)

                return (
                  <Fragment key={source.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={history.length === 0}
                          onClick={() => toggleExpanded(source.id)}
                        >
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{source.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{sourceTypeLabels[source.type]}</Badge>
                      </TableCell>
                      <TableCell>
                        {latest === null ? (
                          <span className="text-muted-foreground text-sm">—</span>
                        ) : (
                          <span className={latest >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(latest)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {latestEntry ? latestEntry.as_of_date : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" title="Update Balance" onClick={() => setBalanceDialog({ mode: 'open', source })}>
                            <Wallet className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => setSourceDialog({ mode: 'edit', source })}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => removeSource(source.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <div className="px-6 py-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Recent Balances</p>
                            {historySlice.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No balance history.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>As of</TableHead>
                                    <TableHead>Balance</TableHead>
                                    <TableHead className="w-16 text-right"></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {historySlice.map(b => (
                                    <TableRow key={b.id}>
                                      <TableCell>{b.as_of_date}</TableCell>
                                      <TableCell className={b.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                                        {formatCurrency(b.balance)}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => removeBalance(b.id)}>
                                          <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                            {history.length > HISTORY_LIMIT && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Showing {HISTORY_LIMIT} of {history.length} entries.
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </CardContent>

      <SourceDialog
        state={sourceDialog}
        onClose={() => setSourceDialog({ mode: 'closed' })}
        onCreate={createSource}
        onUpdate={updateSource}
      />

      <BalanceDialog
        state={balanceDialog}
        onClose={() => setBalanceDialog({ mode: 'closed' })}
        onCreate={createBalance}
      />
    </Card>
  )
}

interface SourceDialogProps {
  state: SourceDialogState
  onClose: () => void
  onCreate: (name: string, type: SourceType) => Promise<void>
  onUpdate: (id: string, updates: Partial<Pick<Source, 'name' | 'type'>>) => Promise<void>
}

function SourceDialog({ state, onClose, onCreate, onUpdate }: SourceDialogProps) {
  const isOpen = state.mode !== 'closed'
  const editing = state.mode === 'edit' ? state.source : null

  const [name, setName] = useState('')
  const [type, setType] = useState<SourceType>('bank_account')
  const [initialised, setInitialised] = useState(false)

  if (isOpen && !initialised) {
    setName(editing?.name ?? '')
    setType(editing?.type ?? 'bank_account')
    setInitialised(true)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose()
      setInitialised(false)
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    if (editing) {
      await onUpdate(editing.id, { name: name.trim(), type })
    } else {
      await onCreate(name.trim(), type)
    }
    onClose()
    setInitialised(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Account' : 'Add Account'}</DialogTitle>
          <DialogDescription>Name and account type.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. HSBC Current Account"
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={v => setType(v as SourceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_account">Bank Account</SelectItem>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="loan">Loan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSubmit} className="w-full" disabled={!name.trim()}>
            {editing ? 'Update' : 'Create'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface BalanceDialogProps {
  state: BalanceDialogState
  onClose: () => void
  onCreate: (sourceId: string, balance: number, asOfDate: string) => Promise<void>
}

function BalanceDialog({ state, onClose, onCreate }: BalanceDialogProps) {
  const isOpen = state.mode === 'open'
  const source = state.mode === 'open' ? state.source : null

  const [balance, setBalance] = useState('')
  const [asOfDate, setAsOfDate] = useState(todayIso())
  const [initialised, setInitialised] = useState(false)

  if (isOpen && !initialised) {
    setBalance('')
    setAsOfDate(todayIso())
    setInitialised(true)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose()
      setInitialised(false)
    }
  }

  const handleSubmit = async () => {
    if (!source || !balance) return
    await onCreate(source.id, parseFloat(balance), asOfDate)
    onClose()
    setInitialised(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Balance{source ? ` — ${source.name}` : ''}</DialogTitle>
          <DialogDescription>Record a balance snapshot at a given date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <Label>Balance</Label>
            <Input
              type="number"
              step="0.01"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              placeholder="1234.56"
            />
          </div>
          <div>
            <Label>As of Date</Label>
            <Input
              type="date"
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
            />
          </div>
          <Button onClick={handleSubmit} className="w-full" disabled={!balance}>
            Record Balance
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}
