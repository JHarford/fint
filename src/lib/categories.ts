import {
  TrendingUp, Landmark, Home, CreditCard, Zap, Shield, PiggyBank,
  Repeat, HeartPulse, Wallet, Briefcase, Car, GraduationCap, HelpCircle,
  ArrowLeftRight, HandCoins,
  type LucideIcon,
} from 'lucide-react'

export const CATEGORIES = [
  'Income', 'Tax', 'Housing', 'Debt', 'Utilities', 'Insurance',
  'Savings', 'Subscriptions', 'Health', 'Budget', 'Business',
  'Transport', 'Education',
] as const

export type Category = typeof CATEGORIES[number]

export const UNCATEGORISED = 'Uncategorised' as const

// Transfer is deliberately NOT a spend category: it marks money moving between
// the user's own accounts (savings↔current, paying own card, ISA top-ups). It's
// excluded from income, spending and the cashflow in/out bars so those figures
// reflect real external money, not internal shuffling.
export const TRANSFER = 'Transfer' as const

// Payout is a sentinel like Transfer: real external money in (insurance
// settlements, windfalls, one-off receipts) that is NOT operating income. It
// stays in the cashflow bars and balance (the cash genuinely arrived) but is
// excluded from the income/spend P&L so it doesn't masquerade as salary/revenue.
export const PAYOUT = 'Payout' as const

// True for real external cashflow — money genuinely entering or leaving the
// user's total holdings (i.e. everything except internal transfers). A Payout
// IS cashflow (the money really moved), so only Transfer is excluded here.
export function isCashflow(category: string): boolean {
  return category !== TRANSFER
}

// True for rows that belong in the income/spend P&L — genuine earnings and
// spending. Excludes internal Transfers AND one-off Payouts (real cash, but not
// income or spend). This is the accrual/earnings view, distinct from isCashflow.
export function isPL(category: string): boolean {
  return category !== TRANSFER && category !== PAYOUT
}

// Tailwind needs every used class string to appear literally — no string interpolation.
export const CATEGORY_META: Record<Category | typeof UNCATEGORISED | typeof TRANSFER | typeof PAYOUT, {
  icon: LucideIcon
  color: string  // text-* for icon
  bg: string     // bg-*/dark:bg-* for tile background
  bar: string    // bg-* for progress bar
}> = {
  Income:        { icon: TrendingUp,    color: 'text-emerald-600',      bg: 'bg-emerald-100 dark:bg-emerald-950', bar: 'bg-emerald-600' },
  Tax:           { icon: Landmark,      color: 'text-rose-700',         bg: 'bg-rose-100 dark:bg-rose-950',       bar: 'bg-rose-700' },
  Housing:       { icon: Home,          color: 'text-slate-700',        bg: 'bg-slate-100 dark:bg-slate-800',     bar: 'bg-slate-700' },
  Debt:          { icon: CreditCard,    color: 'text-red-600',          bg: 'bg-red-100 dark:bg-red-950',         bar: 'bg-red-600' },
  Utilities:     { icon: Zap,           color: 'text-amber-600',        bg: 'bg-amber-100 dark:bg-amber-950',     bar: 'bg-amber-600' },
  Insurance:     { icon: Shield,        color: 'text-indigo-600',       bg: 'bg-indigo-100 dark:bg-indigo-950',   bar: 'bg-indigo-600' },
  Savings:       { icon: PiggyBank,     color: 'text-emerald-700',      bg: 'bg-emerald-100 dark:bg-emerald-950', bar: 'bg-emerald-700' },
  Subscriptions: { icon: Repeat,        color: 'text-purple-600',       bg: 'bg-purple-100 dark:bg-purple-950',   bar: 'bg-purple-600' },
  Health:        { icon: HeartPulse,    color: 'text-pink-600',         bg: 'bg-pink-100 dark:bg-pink-950',       bar: 'bg-pink-600' },
  Budget:        { icon: Wallet,        color: 'text-orange-600',       bg: 'bg-orange-100 dark:bg-orange-950',   bar: 'bg-orange-600' },
  Business:      { icon: Briefcase,     color: 'text-blue-600',         bg: 'bg-blue-100 dark:bg-blue-950',       bar: 'bg-blue-600' },
  Transport:     { icon: Car,           color: 'text-sky-600',          bg: 'bg-sky-100 dark:bg-sky-950',         bar: 'bg-sky-600' },
  Education:     { icon: GraduationCap, color: 'text-teal-600',         bg: 'bg-teal-100 dark:bg-teal-950',       bar: 'bg-teal-600' },
  Transfer:      { icon: ArrowLeftRight, color: 'text-zinc-500',        bg: 'bg-zinc-100 dark:bg-zinc-800',       bar: 'bg-zinc-400' },
  Payout:        { icon: HandCoins,     color: 'text-cyan-600',         bg: 'bg-cyan-100 dark:bg-cyan-950',       bar: 'bg-cyan-600' },
  Uncategorised: { icon: HelpCircle,    color: 'text-muted-foreground', bg: 'bg-muted',                           bar: 'bg-muted-foreground/40' },
}

export function isCategory(s: string): s is Category {
  return (CATEGORIES as readonly string[]).includes(s)
}

export function categoryOrUncategorised(s: string): Category | typeof UNCATEGORISED {
  return isCategory(s) ? s : UNCATEGORISED
}
