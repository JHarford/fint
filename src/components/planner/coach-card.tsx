import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Flame, HeartHandshake, Loader2, Sparkles, TrendingUp, X } from 'lucide-react'
import type { CoachMessage, Goal, GoalEntry, JournalDay } from '@/types'
import { detectInsights, generateCoaching, hasAnthropicKey, type CoachInsight, type LifeContext } from '@/lib/coach'
import { useFoodLogs } from '@/hooks/use-food-logs'
import { useCalPalSettings } from '@/hooks/use-calpal-settings'
import { useChores } from '@/hooks/use-chores'

interface CoachCardProps {
  goals: Goal[]
  goalEntries: GoalEntry[]
  messages: CoachMessage[]
  createMessage: (m: Omit<CoachMessage, 'id' | 'created_at' | 'is_read'>) => Promise<void>
  markRead: (id: string) => Promise<void>
  journalDays?: JournalDay[]
}

const TONE_ICON = {
  support: HeartHandshake,
  nudge: TrendingUp,
  celebrate: Flame,
} as const

export function CoachCard({ goals, goalEntries, messages, createMessage, markRead, journalDays = [] }: CoachCardProps) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  // The coach sees the whole app: goals, food, house jobs
  const { logs: foodLogs } = useFoodLogs()
  const { settings: calpalSettings } = useCalPalSettings()
  const { chores, logs: choreLogs } = useChores()
  const life: LifeContext = useMemo(
    () => ({ foodLogs, calpalSettings, chores, choreLogs }),
    [foodLogs, calpalSettings, chores, choreLogs],
  )

  const insights = useMemo(() => detectInsights(goals, goalEntries, life), [goals, goalEntries, life])
  const unread = messages.filter(m => !m.is_read)

  const askCoach = async () => {
    setGenerating(true)
    setError('')
    try {
      const note = await generateCoaching(goals, goalEntries, insights, journalDays, life)
      if (note) {
        await createMessage({
          message: note,
          context: insights.map(i => i.kind).join(', ') || 'daily check-in',
          goal_id: null,
          source: 'ai',
        })
      }
    } catch (e) {
      console.error('Coaching generation failed:', e)
      setError('Could not reach the coach right now — try again in a moment.')
    } finally {
      setGenerating(false)
    }
  }

  const hasContent = unread.length > 0 || insights.length > 0
  if (!hasContent && !hasAnthropicKey()) return null

  return (
    <Card className="py-4 px-4 gap-3 bg-accent/60 border-accent">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-display text-base font-semibold">Coach</span>
        </div>
        {hasAnthropicKey() && (
          <Button size="sm" variant="outline" className="h-7 text-xs bg-card" onClick={askCoach} disabled={generating}>
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
            {generating ? 'Thinking…' : 'Coach me'}
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {unread.map(m => (
        <div key={m.id} className="relative bg-card rounded-lg border px-3 py-2.5 pr-8">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.message}</p>
          <p className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wide">
            {m.source === 'droplet' ? 'From your assistant' : m.source === 'ai' ? 'AI coach' : 'Coach'}
          </p>
          <button
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
            title="Dismiss"
            onClick={() => markRead(m.id)}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {insights.map(insight => (
        <InsightRow key={`${insight.goalId}-${insight.kind}`} insight={insight} />
      ))}

      {!hasContent && (
        <p className="text-sm text-muted-foreground">
          Everything looks on track today. Ask for a coaching note whenever you want a push.
        </p>
      )}
    </Card>
  )
}

function InsightRow({ insight }: { insight: CoachInsight }) {
  const Icon = TONE_ICON[insight.tone]
  const color = insight.tone === 'celebrate'
    ? 'text-primary'
    : insight.tone === 'support' ? 'text-chart-5' : 'text-chart-4'
  return (
    <div className="flex gap-2.5 items-start">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
      <p className="text-sm leading-snug">{insight.summary}</p>
    </div>
  )
}
