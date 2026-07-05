// Natural-language calendar entry: type (or dictate with the keyboard mic)
// "anniversary at 3pm on 28th August, thinking of Royal Oak for dinner" and
// Haiku turns it into a structured calendar entry. Needs VITE_ANTHROPIC_API_KEY.
import type { CalendarEntry } from '@/types'

export type ParsedEntry = Omit<CalendarEntry, 'id' | 'created_at' | 'is_done' | 'source'>

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short title for the entry, e.g. "Anniversary"' },
    date: { type: 'string', format: 'date', description: 'Start date, YYYY-MM-DD' },
    end_date: {
      anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }],
      description: 'YYYY-MM-DD end date for multi-day spans (holidays, trips); null for single-day entries',
    },
    event_time: { type: 'string', description: '24h HH:MM start time, or empty string if no time given' },
    entry_type: { type: 'string', enum: ['event', 'birthday', 'reminder', 'task'] },
    notes: { type: 'string', description: 'Any extra detail from the message (plans, gift ideas, places)' },
    recurs_annually: { type: 'boolean', description: 'true for birthdays, anniversaries and other yearly things' },
  },
  required: ['title', 'date', 'end_date', 'event_time', 'entry_type', 'notes', 'recurs_annually'],
  additionalProperties: false,
} as const

export async function parseQuickAdd(text: string): Promise<ParsedEntry> {
  // Lazy-load the SDK so it stays out of the main bundle
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  })

  const today = new Date()
  const todayIso = today.toISOString().split('T')[0]
  const weekday = today.toLocaleDateString('en-GB', { weekday: 'long' })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system:
      `You convert a casual spoken or typed note into a calendar entry. Today is ${weekday} ${todayIso}. ` +
      'Resolve relative dates ("tomorrow", "next Friday") against today. If a date has no year, use the next ' +
      'occurrence on or after today. Dates are UK style: 5/8 means 5 August. Anniversaries and birthdays recur ' +
      'annually. A stay, trip or holiday with a range ("10th to 17th") is one entry with an end_date. ' +
      'Keep the title short; put everything else the user said into notes.',
    messages: [{ role: 'user', content: text }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  })

  const block = response.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('No response from the model')
  const parsed = JSON.parse(block.text) as ParsedEntry

  if (!parsed.title || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
    throw new Error("Couldn't work out a date from that — try including one")
  }
  if (parsed.end_date && parsed.end_date <= parsed.date) parsed.end_date = null
  return parsed
}
