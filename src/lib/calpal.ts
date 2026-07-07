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

export interface EstimatedFood {
  name: string
  calories: number
  assumption: string
}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'One entry per distinct food or drink mentioned',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short standardised label with portion where relevant, e.g. "Youvetsi", "Greek salad (small)", "Coca-Cola (330ml)"',
          },
          calories: { type: 'integer', description: 'Best single kcal estimate for this item' },
          assumption: { type: 'string', description: 'Short clause stating the assumed portion, e.g. "restaurant portion"' },
        },
        required: ['name', 'calories', 'assumption'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const

// One Haiku call: "youvetsi with a small greek salad, chorizo starter and a
// coke" → separate standardised items, each with its own kcal estimate.
export async function estimateFoods(text: string): Promise<EstimatedFood[]> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system:
      'A UK user describes food they have eaten. Split the description into separate items — a main, a side, ' +
      'a starter and a drink are each their own item. Standardise each name into a short conventional label ' +
      '(capitalised, portion in brackets when it matters) so the same food always gets the same name. ' +
      'Estimate realistic kcal per item using typical UK portion sizes — one number, not a range.',
    messages: [{ role: 'user', content: text }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  })
  const block = response.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('No response from the model')
  const parsed = JSON.parse(block.text) as { items: EstimatedFood[] }
  const items = (parsed.items ?? []).filter(i => i.name && Number.isFinite(i.calories) && i.calories >= 0)
  if (items.length === 0) throw new Error("Couldn't estimate that — try describing it differently")
  return items
}
