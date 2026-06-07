import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InputTab } from '@/components/input/input-tab'
import { DashboardTab } from '@/components/dashboard/dashboard-tab'
import { TransactionsTab } from '@/components/transactions/transactions-tab'
import { useSources } from '@/hooks/use-sources'
import { useTransactions } from '@/hooks/use-transactions'
import { useRecurringItems } from '@/hooks/use-recurring-items'
import { useFutureObligations } from '@/hooks/use-future-obligations'
import { useCategoryBudgets } from '@/hooks/use-category-budgets'
import { useBalances } from '@/hooks/use-balances'
import { useDebts } from '@/hooks/use-debts'
import { useAssets } from '@/hooks/use-assets'
import { LayoutDashboard, Settings, ReceiptText } from 'lucide-react'

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
  const [forecastMonths, setForecastMonths] = useState(getStoredMonths)

  const handleMonthsChange = (val: string) => {
    const n = parseInt(val, 10)
    if (n > 0 && n <= 120) {
      setForecastMonths(n)
      localStorage.setItem('fint-forecast-months', String(n))
    }
  }

  const isLoading = sourcesLoading || txLoading || riLoading || foLoading || cbLoading || balLoading || debtsLoading || assetsLoading

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Fint</h1>
            <span className="text-xs text-muted-foreground">Personal Finance Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            {isLoading && (
              <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
            )}
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
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-6">
        <Tabs defaultValue="dashboard">
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard" className="gap-1.5">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5">
              <ReceiptText className="w-4 h-4" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="input" className="gap-1.5">
              <Settings className="w-4 h-4" />
              Input
            </TabsTrigger>
          </TabsList>

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
    </div>
  )
}

export default App
