import type { RecurringItem } from '@/types'

// Pre-filled recurring items from Joseph's actual data
// amount > 0 = money going OUT (debits/expenses)
// amount < 0 = money coming IN (income)
// source_id = null initially, user associates via UI
export const defaultRecurringItems: Omit<RecurringItem, 'id' | 'created_at'>[] = [
  // === INCOME ===
  { name: 'Income', amount: -15000, next_date: '2026-01-28', frequency: 'monthly', category: 'Income', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},

  // === MONTHLY DIRECT DEBITS / BILLS ===
  { name: 'HMRC NDDS', amount: 3000, next_date: '2026-02-05', frequency: 'monthly', category: 'Tax', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Santander UK (Mortgage)', amount: 2849.20, next_date: '2026-02-05', frequency: 'monthly', category: 'Housing', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'BARCLAYS BANK UK PLC (Loan)', amount: 3386.86, next_date: '2026-02-06', frequency: 'monthly', category: 'Debt', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'FWC NPIFII Debt (STO)', amount: 2000, next_date: '2026-01-31', frequency: 'monthly', category: 'Debt', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Octopus Energy', amount: 396.67, next_date: '2026-02-02', frequency: 'monthly', category: 'Utilities', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Herefordshire Council Tax', amount: 339, next_date: '2026-01-29', frequency: 'monthly', category: 'Housing', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'FLOGAS Britain', amount: 303.73, next_date: '2026-01-15', frequency: 'monthly', category: 'Utilities', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Capital on Tap', amount: 88, next_date: '2026-02-09', frequency: 'monthly', category: 'Debt', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Gigaclear', amount: 85, next_date: '2026-01-22', frequency: 'monthly', category: 'Utilities', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Welsh Water', amount: 29.50, next_date: '2026-02-08', frequency: 'monthly', category: 'Utilities', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'O2 (Telefonica)', amount: 16.80, next_date: '2026-01-17', frequency: 'monthly', category: 'Utilities', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Royal London Insurance', amount: 12.93, next_date: '2026-02-02', frequency: 'monthly', category: 'Insurance', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Vanguard ISA', amount: 12, next_date: '2026-01-29', frequency: 'monthly', category: 'Savings', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'L&G Insurance', amount: 12.47, next_date: '2026-01-15', frequency: 'monthly', category: 'Insurance', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'TV Licence', amount: 9.75, next_date: '2026-01-22', frequency: 'monthly', category: 'Utilities', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'BARCLAYCARD 7005', amount: 133.40, next_date: '2026-01-29', frequency: 'monthly', category: 'Debt', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'BARCLAYCARD 7007', amount: 189.97, next_date: '2026-02-12', frequency: 'monthly', category: 'Debt', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Pet Health Club', amount: 16, next_date: '2026-02-02', frequency: 'monthly', category: 'Health', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},

  // === SUBSCRIPTIONS ===
  { name: 'Google Workspace', amount: 7, next_date: '2026-02-01', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Discovery+', amount: 33, next_date: '2026-01-20', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'YouTube Premium', amount: 25.99, next_date: '2026-02-11', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'CapCut', amount: 21.99, next_date: '2026-02-01', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Picsart', amount: 14, next_date: '2026-01-20', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Documents Pro', amount: 9.99, next_date: '2026-01-30', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Photoshop Express', amount: 9.99, next_date: '2026-01-26', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'GeoGuessr', amount: 9.99, next_date: '2026-01-23', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'iCloud', amount: 8.99, next_date: '2026-02-01', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Substack Unsolicited Advice', amount: 9, next_date: '2026-02-06', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Substack Benthams', amount: 8, next_date: '2026-01-23', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'GolfShot', amount: 69.99, next_date: '2026-07-26', frequency: 'annually', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Dart Counter', amount: 29.99, next_date: '2026-04-02', frequency: 'annually', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'NOW TV Entertainment', amount: 6.99, next_date: '2026-01-19', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'NOW TV GB Ultra', amount: 6, next_date: '2026-01-21', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Skillshare', amount: 90, next_date: '2026-06-19', frequency: 'annually', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Obsidian', amount: 76, next_date: '2026-03-02', frequency: 'annually', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Claude.AI', amount: 180, next_date: '2026-02-04', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'iFit', amount: 34, next_date: '2026-01-28', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Darts Atlas', amount: 25, next_date: '2026-02-03', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Netflix', amount: 24.98, next_date: '2026-01-30', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Patreon', amount: 17.07, next_date: '2026-01-28', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Amazon Prime', amount: 8.99, next_date: '2026-01-23', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Substack Erikhoel', amount: 6, next_date: '2026-01-19', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Prime Video', amount: 4.99, next_date: '2026-02-07', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Uber One', amount: 4.99, next_date: '2026-01-23', frequency: 'monthly', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Quartz', amount: 80, next_date: '2026-06-20', frequency: 'annually', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'iDrive', amount: 78, next_date: '2026-11-12', frequency: 'annually', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Audible', amount: 109.99, next_date: '2027-01-04', frequency: 'annually', category: 'Subscriptions', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Admiral Insurance', amount: 243.80, next_date: '2026-04-02', frequency: 'quarterly', category: 'Insurance', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},

  // === SCHOOL FEES (Lyra) ===
  { name: 'The Elms School (Lyra)', amount: 920, next_date: '2030-09-01', frequency: 'monthly', category: 'Education', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: '2039-07-31', annual_increase: 10 },
  { name: 'Malvern College (Lyra)', amount: 3176, next_date: '2039-09-01', frequency: 'monthly', category: 'Education', is_spread: false, is_active: true, source_id: null, target_source_id: null, end_date: '2044-07-31', annual_increase: 5 },

  // === WEEKLY BUDGET ESTIMATES (spread) ===
  { name: 'Food & Groceries', amount: 75, next_date: '2026-01-01', frequency: 'weekly', category: 'Budget', is_spread: true, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Eating Out & Coffee', amount: 62.50, next_date: '2026-01-02', frequency: 'weekly', category: 'Budget', is_spread: true, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Shopping (general)', amount: 75, next_date: '2026-01-04', frequency: 'weekly', category: 'Budget', is_spread: true, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Transport (fuel/parking/taxis)', amount: 50, next_date: '2026-01-03', frequency: 'weekly', category: 'Budget', is_spread: true, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Health & Personal', amount: 50, next_date: '2026-01-05', frequency: 'weekly', category: 'Budget', is_spread: true, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
  { name: 'Leisure & Entertainment', amount: 50, next_date: '2026-01-06', frequency: 'weekly', category: 'Budget', is_spread: true, is_active: true, source_id: null, target_source_id: null, end_date: null, annual_increase: 0},
]
