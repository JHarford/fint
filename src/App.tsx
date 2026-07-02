import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InputTab } from '@/components/input/input-tab'
import { DashboardTab } from '@/components/dashboard/dashboard-tab'
import { TransactionsTab } from '@/components/transactions/transactions-tab'
import { TodayTab } from '@/components/planner/today-tab'
import { GoalsTab } from '@/components/planner/goals-tab'
import { useSources } from '@/hooks/use-sources'
import { useTransactions } from '@/hooks/use-transactions'
import { useRecurringItems } from '@/hooks/use-recurring-items'
import { useFutureObligations } from '@/hooks/use-future-obligations'
import { useCategoryBudgets } from '@/hooks/use-category-budgets'
import { useBalances } from '@/hooks/use-balances'
import { useDebts } from '@/hooks/use-debts'
import { useAssets } from '@/hooks/use-assets'
import { useGoals } from '@/hooks/use-goals'
import { useGoalEntries } from '@/hooks/use-goal-entries'
import { CalendarCheck2, LayoutDashboard, Settings, ReceiptText, Target } from 'lucide-react'

// shortLabel is used in the mobile bottom nav where space is tight
const NAV_ITEMS = [
  { value: 'today', label: 'Today', shortLabel: 'Today', icon: CalendarCheck2 },
  { value: 'goals', label: 'Goals', shortLabel: 'Goals', icon: Target },
  { value: 'dashboard', label: 'Finance', shortLabel: 'Finance', icon: LayoutDashboard },
  { value: 'transactions', label: 'Transactions', shortLabel: 'Activity', icon: ReceiptText },
  { value: 'input', label: 'Input', shortLabel: 'Input', icon: Settings },
]

function getStoredMonths(): number {
  try {
    const v = localStorage.getItem('fint-forecast-months')
    return v ? parseInt(v, 10) || 12 : 12
  } catch { return 12 }
}

function App() {
  const { sources, loading: sourcesLoading } = useSources()
  const { transactions, loading: txLoading } = useTransactions()
  const { items: recurringItems, loading: riLoading } = useRecurringItems()
  const { items: futureObligations, loading: foLoading } = useFutureObligations()
  const { budgets: categoryBudgets, loading: cbLoading } = useCategoryBudgets()
  const { balances, loading: balLoading } = useBalances()
  const { debts, loading: debtsLoading } = useDebts()
  const { assets, loading: assetsLoading } = useAssets()
  const { goals, loading: goalsLoading, create: createGoal, update: updateGoal, remove: removeGoal } = useGoals()
  const { entries: goalEntries, loading: geLoading, log: logGoalEntry, remove: removeGoalEntry } = useGoalEntries()
  const [forecastMonths, setForecastMonths] = useState(getStoredMonths)
  const [activeTab, setActiveTab] = useState('today')

  const handleMonthsChange = (val: string) => {
    const n = parseInt(val, 10)
    if (n > 0 && n <= 120) {
      setForecastMonths(n)
      localStorage.setItem('fint-forecast-months', String(n))
    }
  }

  const isLoading = sourcesLoading || txLoading || riLoading || foLoading || cbLoading || balLoading || debtsLoading || assetsLoading || goalsLoading || geLoading

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Fint</h1>
            <span className="text-xs text-muted-foreground">Personal Planner</span>
          </div>
          <div className="flex items-center gap-3">
            {isLoading && (
              <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
            )}
            {activeTab === 'dashboard' && (
              <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 bg-muted/50">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Forecast</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={forecastMonths}
                  onChange={e => handleMonthsChange(e.target.value)}
                  className="w-12 h-6 text-sm font-medium text-center border rounded bg-background px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-xs text-muted-foreground">months</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-6 pb-24 md:pb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Top tab bar on desktop; mobile uses the bottom nav instead */}
          <TabsList className="mb-6 hidden md:inline-flex">
            {NAV_ITEMS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className="w-4 h-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="today">
            <TodayTab
              goals={goals}
              entries={goalEntries}
              log={logGoalEntry}
              removeEntry={removeGoalEntry}
              onManageGoals={() => setActiveTab('goals')}
            />
          </TabsContent>

          <TabsContent value="goals">
            <GoalsTab
              goals={goals}
              entries={goalEntries}
              createGoal={createGoal}
              updateGoal={updateGoal}
              removeGoal={removeGoal}
            />
          </TabsContent>

          <TabsContent value="dashboard">
            <DashboardTab
              sources={sources}
              transactions={transactions}
              recurringItems={recurringItems}
              futureObligations={futureObligations}
              categoryBudgets={categoryBudgets}
              balances={balances}
              debts={debts}
              assets={assets}
              forecastMonths={forecastMonths}
            />
          </TabsContent>

          <TabsContent value="transactions">
            <TransactionsTab />
          </TabsContent>

          <TabsContent value="input">
            <InputTab />
          </TabsContent>
        </Tabs>
      </main>

      {/* App-style bottom navigation on mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {NAV_ITEMS.map(({ value, shortLabel, icon: Icon }) => {
            const active = activeTab === value
            return (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={`flex flex-col items-center gap-1 pt-2 pb-1.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.25]' : ''}`} />
                {shortLabel}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default App
