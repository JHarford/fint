// Cal Pal maths + the Haiku calorie estimator.
import type { CalPalSettings, FoodLog } from '@/types'

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Mostly sitting' },
  { value: 1.375, label: 'Lightly active' },
  { value: 1.55, label: 'Active most days' },
  { value: 1.725, label: 'Very active' },
] as const

// Mifflin-St Jeor basal metabolic rate
export function bmr(s: CalPalSettings): number {
  const base = 10 * Number(s.weight_kg) + 6.25 * Number(s.height_cm) - 5 * s.age
  return s.sex === 'male' ? base + 5 : base - 161
}

// Daily calorie target: BMR × activity, plus the surplus/deficit slider
export function dailyTarget(s: CalPalSettings): number {
  return Math.round(bmr(s) * Number(s.activity)) + s.adjustment
}

export function caloriesOn(logs: FoodLog[], date: string): number {
  return logs.filter(l => l.date === date).reduce((a, l) => a + l.calories, 0)
}

export function normaliseFood(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Most recent calorie count logged for this exact food name, so repeat foods
// fill themselves in ("peanut butter roll" → 150 next time).
export function knownCalories(logs: FoodLog[], name: string): number | null {
  const key = normaliseFood(name)
  if (!key) return null
  const match = logs.find(l => normaliseFood(l.name) === key) // logs arrive date-desc
  return match ? match.calories : null
}

const SCHEMA = {
  type: 'object',
  properties: {
    calories: { type: 'integer', description: 'Best single estimate of total kcal for the described food/meal' },
    assumption: { type: 'string', description: 'One short clause stating the assumed portion size, e.g. "assuming a pub-sized burger with bun"' },
  },
  required: ['calories', 'assumption'],
  additionalProperties: false,
} as const

// One-line Haiku call: "burger from the pub" → { calories: 850, assumption: … }
export async function estimateCalories(text: string): Promise<{ calories: number; assumption: string }> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    system:
      'Estimate the calories in the food a UK user describes having eaten. Assume typical UK portion sizes. ' +
      'Give one realistic total, not a range.',
    messages: [{ role: 'user', content: text }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  })
  const block = response.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('No response from the model')
  const parsed = JSON.parse(block.text) as { calories: number; assumption: string }
  if (!Number.isFinite(parsed.calories) || parsed.calories < 0) throw new Error('Bad estimate — try describing it differently')
  return parsed
}
