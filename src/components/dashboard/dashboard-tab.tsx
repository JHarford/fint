import { SummaryCards } from './summary-cards'
import { DateGrid } from './date-grid'
import { MonthlyAnalysis } from './monthly-analysis'
import type { Source, Transaction, RecurringItem, AccountBalance, Debt, Asset, FutureObligation, CategoryBudget } from '@/types'

interface DashboardTabProps {
  sources: Source[]
  transactions: Transaction[]
  recurringItems: RecurringItem[]
  futureObligations: FutureObligation[]
  categoryBudgets: CategoryBudget[]
  balances: AccountBalance[]
  debts: Debt[]
  assets: Asset[]
  forecastMonths: number
}

export function DashboardTab({ sources, transactions, recurringItems, futureObligations, categoryBudgets, balances, debts, assets, forecastMonths }: DashboardTabProps) {
  return (
    <div className="space-y-6">
      <SummaryCards sources={sources} balances={balances} debts={debts} recurringItems={recurringItems} assets={assets} forecastMonths={forecastMonths} />
      <MonthlyAnalysis transactions={transactions} categoryBudgets={categoryBudgets} />
      <DateGrid
        transactions={transactions}
        recurringItems={recurringItems}
        futureObligations={futureObligations}
        categoryBudgets={categoryBudgets}
        balances={balances}
        debts={debts}
        sources={sources}
        forecastMonths={forecastMonths}
      />
    </div>
  )
}
