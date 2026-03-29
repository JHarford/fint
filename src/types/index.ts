export type SourceType = 'credit_card' | 'bank_account' | 'loan'
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'annually'
export type DebtType = 'loan' | 'mortgage' | 'tax' | 'other'
export type ViewMode = 'daily' | 'weekly' | 'monthly'

export interface Source {
  id: string
  name: string
  type: SourceType
  created_at: string
}

export interface Transaction {
  id: string
  source_id: string
  number: string
  date: string
  account: string
  amount: number
  subcategory: string
  memo: string
  created_at: string
}

export interface RecurringItem {
  id: string
  name: string
  amount: number
  next_date: string
  frequency: Frequency
  category: string
  is_spread: boolean
  is_active: boolean
  source_id: string | null
  target_source_id: string | null
  end_date: string | null
  annual_increase: number
  created_at: string
}

export interface AccountBalance {
  id: string
  source_id: string
  balance: number
  as_of_date: string
  created_at: string
}

export interface Debt {
  id: string
  name: string
  current_balance: number
  recurring_item_id: string | null
  type: DebtType
  interest_rate: number
  include_in_net_worth: boolean
  created_at: string
}

export type AssetType = 'property' | 'vehicle' | 'investment' | 'other'

export interface Asset {
  id: string
  name: string
  current_value: number
  type: AssetType
  annual_change: number
  include_in_net_worth: boolean
  created_at: string
}

// For CSV upload preview
export interface CsvRow {
  number: string
  date: string
  account: string
  amount: number
  subcategory: string
  memo: string
}

export interface CsvUploadPreview {
  rows: CsvRow[]
  duplicateCount: number
  newCount: number
}
