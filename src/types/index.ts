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

export type Recurrence = 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'one-off'

export interface Transaction {
  id: string
  source_id: string
  number: string
  date: string
  account: string
  amount: number
  category: string
  subcategory: string
  memo: string
  recurring_item_id: string | null
  recurrence: Recurrence | null
  recurrence_group: string
  recurrence_confidence: '' | 'detected' | 'llm' | 'manual'
  created_at: string
}

export interface FutureObligation {
  id: string
  name: string
  amount: number
  next_date: string
  frequency: Recurrence
  category: string
  subcategory: string
  is_active: boolean
  source_id: string | null
  target_source_id: string | null
  end_date: string | null
  annual_increase: number
  notes: string
  created_at: string
}

export interface CategoryBudget {
  id: string
  category: string
  subcategory: string
  monthly_amount: number
  notes: string
  created_at: string
}

export interface CategoryRule {
  id: string
  pattern: string
  category: string
  subcategory: string
  match_count: number
  source: 'llm' | 'manual'
  created_at: string
  updated_at: string
}

export interface SavingsBucket {
  id: string
  name: string
  target_amount: number | null
  target_date: string | null
  monthly_allocation: number
  current_amount: number
  start_date: string
  source_id: string | null
  icon: string
  color: string
  is_active: boolean
  created_at: string
}

// One row per day: tweet-length diary note + small square photo (data URL)
export interface JournalDay {
  id: string
  day: string
  note: string
  photo_data: string
  created_at: string
  updated_at: string
}

export interface RecurringItem {
  id: string
  name: string
  amount: number
  next_date: string
  frequency: Frequency
  category: string
  subcategory?: string  // optional; used for per-subcategory budget matching
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

export type GoalType = 'abstinence' | 'habit' | 'target' | 'record'
export type RecordDirection = 'lower' | 'higher'

export interface Goal {
  id: string
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
  // abstinence goals: what the habit used to cost, for money-saved / units-avoided stats
  weekly_spend: number | null
  weekly_units: number | null
  // record goals: whether a lower value (time) or higher value (score) is better
  record_direction: RecordDirection
  is_active: boolean
  sort_order: number
  created_at: string
}

// One entry per goal per day.
// abstinence: value 1 = clean day, 0 = slip. habit: value 1 = done. target: value = measured amount.
export interface GoalEntry {
  id: string
  goal_id: string
  date: string
  value: number
  note: string
  created_at: string
}

export type CalendarEntryType = 'event' | 'birthday' | 'reminder' | 'task'
export type ExternalSource = 'user' | 'droplet' | 'ai'

export interface CalendarEntry {
  id: string
  title: string
  date: string
  end_date: string | null // set = multi-day span (holidays, trips), inclusive
  event_time: string // "HH:MM", empty = all-day
  entry_type: CalendarEntryType
  notes: string
  recurs_annually: boolean
  is_done: boolean
  source: ExternalSource
  created_at: string
}

export interface CoachMessage {
  id: string
  message: string
  context: string
  goal_id: string | null
  source: 'rule' | 'ai' | 'droplet'
  is_read: boolean
  created_at: string
}

// House jobs — deliberately lighter than goals: no streaks, no coaching
export interface Chore {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface ChoreLog {
  id: string
  chore_id: string
  date: string
  created_at: string
}

// Cal Pal food tracker
export interface FoodLog {
  id: string
  date: string
  name: string
  calories: number
  protein: number // grams
  fat: number // grams
  created_at: string
}

export interface CalPalSettings {
  id: number
  weight_kg: number
  height_cm: number
  sex: 'male' | 'female'
  age: number
  activity: number // TDEE multiplier: 1.2 sedentary … 1.725 very active
  adjustment: number // kcal surplus (+) or deficit (−) on top of TDEE
  protein_per_kg: number // daily protein target in g per kg bodyweight
  updated_at: string
}

// For CSV upload preview
export interface CsvRow {
  number: string
  date: string
  account: string
  amount: number
  category: string
  subcategory: string
  memo: string
}

export interface CsvUploadPreview {
  rows: CsvRow[]
  duplicateCount: number
  newCount: number
}
