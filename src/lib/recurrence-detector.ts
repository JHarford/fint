import type { Transaction } from '@/types'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5'

export type DetectedFrequency = 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'one-off' | 'irregular'

export interface DetectedGroup {
  pattern: string                  // canonical merchant key
  category: string                 // most common category in the group
  memberIds: string[]
  amounts: number[]
  dates: string[]
  medianAmount: number
  amountVariance: number           // (max-min)/median, 0..1
  medianIntervalDays: number
  inferredFrequency: DetectedFrequency
  confidence: 'high' | 'medium' | 'low'
}

export interface DetectorOptions {
  minOccurrences?: number          // default 2
  maxAmountVariance?: number       // default 0.25
  maxDaysSinceLast?: number        // default 90 — drop groups that look ended
}

// UK bank statement noise tokens — payment-system codes / day-of-week / month
// abbreviations that aren't part of a merchant's name.
const NOISE_TOKENS = new Set([
  'DD', 'DDR', 'DCR', 'STO', 'BCC', 'CPM', 'MBP', 'ON', 'TO', 'FROM',
  'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN',
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  'INC', 'LTD', 'LLC', 'PLC', 'CO',
])

// Strip transaction-specific noise so similar memos cluster.
// Matches the canonicaliser used in categoriser.tsx so rule-cache + detection align.
export function canonicalise(memo: string): string {
  const tokens = memo
    .toUpperCase()
    .replace(/\d{2,}/g, '')          // drop long digit runs (refs, dates)
    .replace(/[^A-Z\s&]/g, ' ')      // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(t => t.length > 1 && !NOISE_TOKENS.has(t))
  return tokens.slice(0, 3).join(' ')
}

export function detectRecurringGroups(
  transactions: Transaction[],
  options: DetectorOptions = {},
): DetectedGroup[] {
  const minOcc = options.minOccurrences ?? 2
  const maxVar = options.maxAmountVariance ?? 0.25
  const maxDaysSinceLast = options.maxDaysSinceLast ?? 90
  const today = Date.now()

  // Group transactions by canonical pattern
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const pattern = canonicalise(t.memo)
    if (!pattern || pattern.length < 3) continue
    const arr = groups.get(pattern) ?? []
    arr.push(t)
    groups.set(pattern, arr)
  }

  const results: DetectedGroup[] = []
  for (const [pattern, txs] of groups) {
    if (txs.length < minOcc) continue

    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
    const amounts = sorted.map(t => Math.abs(t.amount))
    const medianAmount = median(amounts)
    if (medianAmount === 0) continue

    // Drop groups where the last occurrence is too far in the past — likely ended
    const lastDate = new Date(sorted[sorted.length - 1].date).getTime()
    const daysSinceLast = (today - lastDate) / 86_400_000
    if (daysSinceLast > maxDaysSinceLast) continue

    const variance = (Math.max(...amounts) - Math.min(...amounts)) / medianAmount
    // Income amounts swing wildly (salary + bonus + expense reimbursements +
    // tiny corrections from the same payer). Detect by checking if amounts are
    // overwhelmingly negative (LifeFlow convention: negative = money in).
    const negCount = sorted.filter(t => t.amount < 0).length
    const isIncomeSide = negCount > sorted.length / 2
    const varianceCap = isIncomeSide ? 50 : 2
    if (variance > varianceCap) continue

    const intervals = intervalsInDays(sorted.map(t => t.date))
    const medianInterval = intervals.length > 0 ? median(intervals) : 0
    const inferredFrequency = inferFrequency(medianInterval, sorted.length)

    const categoryCounts = new Map<string, number>()
    for (const t of sorted) {
      const c = t.category || ''
      if (c) categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1)
    }
    const category = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

    results.push({
      pattern,
      category,
      memberIds: sorted.map(t => t.id),
      amounts,
      dates: sorted.map(t => t.date),
      medianAmount,
      amountVariance: variance,
      medianIntervalDays: medianInterval,
      inferredFrequency,
      confidence: scoreConfidence(sorted.length, variance, maxVar, intervals, medianInterval, inferredFrequency),
    })
  }

  // Sort by confidence desc then member count desc — high-confidence + heavy hitters first
  const order = { high: 0, medium: 1, low: 2 }
  results.sort((a, b) => {
    if (order[a.confidence] !== order[b.confidence]) return order[a.confidence] - order[b.confidence]
    return b.memberIds.length - a.memberIds.length
  })
  return results
}

function intervalsInDays(dates: string[]): number[] {
  const out: number[] = []
  for (let i = 1; i < dates.length; i++) {
    const a = new Date(dates[i - 1]).getTime()
    const b = new Date(dates[i]).getTime()
    out.push(Math.round((b - a) / 86_400_000))
  }
  return out
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function inferFrequency(medianDays: number, occurrences: number): DetectedFrequency {
  if (occurrences < 2) return 'one-off'
  if (medianDays >= 5  && medianDays <= 10)   return 'weekly'
  if (medianDays >= 25 && medianDays <= 35)   return 'monthly'
  if (medianDays >= 80 && medianDays <= 100)  return 'quarterly'
  if (medianDays >= 350 && medianDays <= 380) return 'annually'
  return 'irregular'
}

// ---------- LLM second pass ----------

export interface RefinedGroup {
  displayName: string                  // human-readable, e.g. "Apple Services"
  patterns: string[]                   // one or more canonical patterns merged into this group
  memberIds: string[]                  // all transaction ids in the group
  frequency: DetectedFrequency
  category: string
  monthlyEquivalent: number            // for forecasting
  source: 'detected' | 'llm'           // who proposed this group
}

const RECURRENCE_SYSTEM_PROMPT = `You verify and refine candidate recurring-transaction groups for a UK personal finance app.

You receive:
- LOOSE_GROUPS: pattern clusters detected by amount/interval analysis (already grouped)
- UNGROUPED_SAMPLE: a sample of transactions that DIDN'T cluster — look for semantic groups the loose detector missed

Your job: return REFINED_GROUPS, a JSON array. Each group:
{
  "displayName": short human label (e.g. "Apple Services", "Octopus Energy", "Patreon"),
  "patterns": [list of canonical pattern strings this group covers],
  "memberIds": [transaction ids],
  "frequency": "weekly" | "monthly" | "quarterly" | "annually" | "one-off" | "irregular",
  "category": one of [Income, Tax, Housing, Debt, Utilities, Insurance, Savings, Subscriptions, Health, Budget, Business, Transport, Education]
}

Rules:
- Merge semantically-identical groups even if memos differ. Example: multiple "Apple.Com/Bill" charges of different amounts → one "Apple Services" group with frequency=monthly.
- Keep clean single-merchant groups as-is (Octopus Energy stays separate from Gigaclear).
- If a loose group looks like one-off (a single big purchase, no real pattern), set frequency="one-off".
- DROP groups that don't represent a real recurring obligation (e.g. random salary refunds, internal transfers).
- For semantic merges, combine ALL memberIds from the source groups.
- Only propose NEW groups from UNGROUPED_SAMPLE if you see 2+ clearly-related transactions with regular cadence. Don't fabricate.
- Return ONLY the JSON array, no prose.`

interface LooseGroupForLlm {
  pattern: string
  memberIds: string[]
  sample_memo: string
  median_amount: number
  median_interval_days: number
  inferred_frequency: DetectedFrequency
  category: string
  count: number
}

interface LlmRefinedGroup {
  displayName: string
  patterns: string[]
  memberIds: string[]
  frequency: DetectedFrequency
  category: string
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>
}

export async function refineWithLlm(
  groups: DetectedGroup[],
  ungroupedSample: Transaction[],
  allTransactions: Transaction[],
): Promise<RefinedGroup[]> {
  if (!ANTHROPIC_API_KEY) throw new Error('Missing VITE_ANTHROPIC_API_KEY — set it in .env')
  if (groups.length === 0 && ungroupedSample.length === 0) return []

  // Build a compact representation for the LLM
  const looseForLlm: LooseGroupForLlm[] = groups.map(g => ({
    pattern: g.pattern,
    memberIds: g.memberIds,
    sample_memo: g.pattern,
    median_amount: g.medianAmount,
    median_interval_days: g.medianIntervalDays,
    inferred_frequency: g.inferredFrequency,
    category: g.category,
    count: g.memberIds.length,
  }))

  const ungroupedForLlm = ungroupedSample.slice(0, 60).map(t => ({
    id: t.id, memo: t.memo, amount: t.amount, date: t.date, category: t.category,
  }))

  const userContent = `LOOSE_GROUPS:\n${JSON.stringify(looseForLlm, null, 2)}\n\nUNGROUPED_SAMPLE:\n${JSON.stringify(ungroupedForLlm, null, 2)}`

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system: [{ type: 'text', text: RECURRENCE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)

  const json = (await res.json()) as AnthropicResponse
  const text = json.content.find(b => b.type === 'text')?.text ?? ''
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1) return []

  let parsed: unknown
  try { parsed = JSON.parse(text.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(parsed)) return []

  // Build a memberId→tx lookup for monthly-equivalent calc
  const txById = new Map<string, Transaction>()
  for (const t of allTransactions) txById.set(t.id, t)

  const refined: RefinedGroup[] = []
  for (const r of parsed as LlmRefinedGroup[]) {
    if (typeof r !== 'object' || r === null) continue
    if (typeof r.displayName !== 'string' || !Array.isArray(r.memberIds)) continue
    if (typeof r.frequency !== 'string') continue
    const validIds = r.memberIds.filter(id => typeof id === 'string' && txById.has(id))
    if (validIds.length === 0) continue
    const memberAmounts = validIds
      .map(id => Math.abs(txById.get(id)?.amount ?? 0))
      .filter(a => a > 0)
    const med = median(memberAmounts)
    refined.push({
      displayName: r.displayName.slice(0, 60),
      patterns: Array.isArray(r.patterns) ? r.patterns.map(String) : [],
      memberIds: validIds,
      frequency: r.frequency as DetectedFrequency,
      category: typeof r.category === 'string' ? r.category : '',
      monthlyEquivalent: monthlyEquivalent(med, r.frequency as DetectedFrequency),
      source: 'llm',
    })
  }
  return refined
}

export function monthlyEquivalent(amount: number, frequency: DetectedFrequency): number {
  switch (frequency) {
    case 'weekly':    return amount * 52 / 12
    case 'monthly':   return amount
    case 'quarterly': return amount / 3
    case 'annually':  return amount / 12
    default:          return 0
  }
}

function scoreConfidence(
  occurrences: number,
  variance: number,
  maxVariance: number,
  intervals: number[],
  medianInterval: number,
  freq: DetectedFrequency,
): 'high' | 'medium' | 'low' {
  if (freq === 'irregular' || freq === 'one-off') return 'low'
  // Interval stability: max absolute deviation from median
  const dev = intervals.length > 0
    ? Math.max(...intervals.map(i => Math.abs(i - medianInterval)))
    : 0
  if (occurrences >= 4 && variance <= 0.10 && dev <= 3) return 'high'
  if (occurrences >= 3 && variance <= maxVariance && dev <= 7) return 'medium'
  return 'low'
}
