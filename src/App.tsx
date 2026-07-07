import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TodayTab } from '@/components/planner/today-tab'
import { CalendarTab } from '@/components/planner/calendar-tab'

// Heavy tabs (charts, CSV tooling) load on demand to keep first paint fast
const GoalsTab = lazy(() => import('@/components/planner/goals-tab').then(m => ({ default: m.GoalsTab })))
const CalPalTab = lazy(() => import('@/components/calpal/calpal-tab').then(m => ({ default: m.CalPalTab })))
import { FinanceTab } from '@/components/finance/finance-tab'

function TabLoading() {
  return <p className="text-sm text-muted-foreground animate-pulse py-8 text-center">Loading…</p>
}

// Swipes that start inside a horizontally scrollable element (date grid,
// heatmaps, tables) must scroll that element, not switch tabs.
function insideHorizontalScroller(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null
  while (node && node !== document.body) {
    if (node.scrollWidth > node.clientWidth + 4) {
      const overflowX = getComputedStyle(node).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    node = node.parentElement
  }
  return false
}

// Shown when the build has no Supabase credentials (e.g. env vars not set on
// the hosting platform) — much friendlier than a blank white screen.
function SetupNotice() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md min-w-0 space-y-4">
        <h1 className="font-display text-3xl font-semibold text-primary">LifeFlow</h1>
        <p className="text-sm leading-relaxed">
          This build has no database connection. Set these environment variables
          in your hosting platform (for Vercel: Settings → Environment Variables),
          then <strong>redeploy</strong> — they're baked in at build time:
        </p>
        <pre className="bg-muted border rounded-lg px-4 py-3 text-xs overflow-x-auto">
{`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_ANTHROPIC_API_KEY=<optional, for "Coach me">
VITE_VAPID_PUBLIC_KEY=<optional, for push notifications>`}
        </pre>
        <p className="text-xs text-muted-foreground">
          Both values are in your Supabase project under Settings → API. See the
          README for full setup.
        </p>
      </div>
    </div>
  )
}
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
import { useCalendarEntries } from '@/hooks/use-calendar-entries'
import { useCoachMessages } from '@/hooks/use-coach-messages'
import { useJournalDays } from '@/hooks/use-journal-days'
import { isSupabaseConfigured } from '@/lib/supabase'
import { onNavigate } from '@/lib/nav-bus'
import { DebugConsole } from '@/components/debug-console'
import { CelebrationToast } from '@/components/celebration-toast'
import { CalendarCheck2, CalendarDays, LayoutDashboard, Target, UtensilsCrossed } from 'lucide-react'

// shortLabel is used in the mobile bottom nav where space is tight
const NAV_ITEMS = [
  { value: 'today', label: 'Today', shortLabel: 'Today', icon: CalendarCheck2 },
  { value: 'goals', label: 'Goals', shortLabel: 'Goals', icon: Target },
  { value: 'calendar', label: 'Calendar', shortLabel: 'Diary', icon: CalendarDays },
  { value: 'calpal', label: 'Cal Pal', shortLabel: 'Cal Pal', icon: UtensilsCrossed },
  { value: 'finance', label: 'Finance', shortLabel: 'Finance', icon: LayoutDashboard },
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
  const { entries: calendarEntries, create: createCalendarEntry, update: updateCalendarEntry, remove: removeCalendarEntry } = useCalendarEntries()
  const { messages: coachMessages, create: createCoachMessage, markRead: markCoachMessageRead } = useCoachMessages()
  const { days: journalDays, save: saveJournal } = useJournalDays()
  const [forecastMonths, setForecastMonths] = useState(getStoredMonths)
  const [activeTab, setActiveTab] = useState('today')
  const touchStart = useRef<{ x: number; y: number; blocked: boolean } | null>(null)

  // Cross-tab deep links (e.g. CSV upload → Transactions + suggest recurring)
  useEffect(() => onNavigate(i => setActiveTab(i.tab)), [])

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY, blocked: insideHorizontalScroller(e.target) }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || start.blocked) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    // A deliberate horizontal swipe: long enough and clearly not a scroll
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy)) return
    const idx = NAV_ITEMS.findIndex(n => n.value === activeTab)
    const next = dx < 0 ? idx + 1 : idx - 1
    if (next >= 0 && next < NAV_ITEMS.length) setActiveTab(NAV_ITEMS[next].value)
  }

  const handleMonthsChange = (val: string) => {
    const n = parseInt(val, 10)
    if (n > 0 && n <= 120) {
      setForecastMonths(n)
      localStorage.setItem('fint-forecast-months', String(n))
    }
  }

  const isLoading = sourcesLoading || txLoading || riLoading || foLoading || cbLoading || balLoading || debtsLoading || assetsLoading || goalsLoading || geLoading

  if (!isSupabaseConfigured) return <SetupNotice />

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2.5">
            <h1 className="font-display text-2xl font-semibold text-primary">LifeFlow</h1>
            <span className="text-[10px] text-muted-foreground tabular-nums" title={`Build ${__COMMIT_SHA__}`}>
              v{__APP_VERSION__} · {__COMMIT_SHA__}
            </span>
            <span className="text-xs text-muted-foreground italic font-display hidden sm:inline">one day at a time</span>
          </div>
          <div className="flex items-center gap-3">
            {isLoading && (
              <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
            )}
            {activeTab === 'finance' && (
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

      <main
        className="max-w-[1600px] mx-auto px-4 py-6 pb-24 md:pb-6"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
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
              onOpenCalPal={() => setActiveTab('calpal')}
              coachMessages={coachMessages}
              createCoachMessage={createCoachMessage}
              markCoachMessageRead={markCoachMessageRead}
              journalDays={journalDays}
              calendarEntries={calendarEntries}
            />
          </TabsContent>

          <TabsContent value="calendar">
            <CalendarTab
              goals={goals}
              goalEntries={goalEntries}
              entries={calendarEntries}
              createEntry={createCalendarEntry}
              updateEntry={updateCalendarEntry}
              removeEntry={removeCalendarEntry}
              journalDays={journalDays}
              saveJournal={saveJournal}
            />
          </TabsContent>

          <TabsContent value="goals">
            <Suspense fallback={<TabLoading />}>
              <GoalsTab
                goals={goals}
                entries={goalEntries}
                createGoal={createGoal}
                updateGoal={updateGoal}
                removeGoal={removeGoal}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="calpal">
            <Suspense fallback={<TabLoading />}>
              <CalPalTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="finance">
            <FinanceTab
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

      <CelebrationToast />

      {/* TEMPORARY: on-screen error console for mobile debugging — remove when done */}
      <DebugConsole />
    </div>
  )
}

export default App
