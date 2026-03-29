import { SummaryCards } from './summary-cards'
import { DateGrid } from './date-grid'
import type { Source, Transaction, RecurringItem, AccountBalance, Debt, Asset } from '@/types'

interface DashboardTabProps {
  sources: Source[]
  transactions: Transaction[]
  recurringItems: RecurringItem[]
  balances: AccountBalance[]
  debts: Debt[]
  assets: Asset[]
  forecastMonths: number
}

export function DashboardTab({ sources, transactions, recurringItems, balances, debts, assets, forecastMonths }: DashboardTabProps) {
  return (
    <div className="space-y-6">
      <SummaryCards sources={sources} balances={balances} debts={debts} recurringItems={recurringItems} assets={assets} forecastMonths={forecastMonths} />
      <DateGrid
        transactions={transactions}
        recurringItems={recurringItems}
        balances={balances}
        debts={debts}
        sources={sources}
        forecastMonths={forecastMonths}
      />
    </div>
  )
}
