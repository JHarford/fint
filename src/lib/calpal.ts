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

export function macrosOn(logs: FoodLog[], date: string): { calories: number; protein: number; fat: number } {
  return logs.filter(l => l.date === date).reduce(
    (a, l) => ({ calories: a.calories + l.calories, protein: a.protein + Number(l.protein || 0), fat: a.fat + Number(l.fat || 0) }),
    { calories: 0, protein: 0, fat: 0 },
  )
}

// Daily protein target in grams: bodyweight × g/kg setting
export function proteinTarget(s: CalPalSettings): number {
  return Math.round(Number(s.weight_kg) * Number(s.protein_per_kg || 1.6))
}

export function normaliseFood(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

// The foods logged most often in the last 60 days — one-tap chips for the
// tea/porridge/roll you log every day. Excludes anything already logged today.
export function usualFoods(logs: FoodLog[], today: string, limit = 6): FoodLog[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 60)
  const cutoffKey = cutoff.toISOString().split('T')[0]
  const todayNames = new Set(logs.filter(l => l.date === today).map(l => normaliseFood(l.name)))
  const byName = new Map<string, { count: number; latest: FoodLog }>()
  for (const l of logs) {
    if (l.date < cutoffKey || l.date > today) continue
    const key = normaliseFood(l.name)
    if (!key || todayNames.has(key)) continue
    const e = byName.get(key)
    if (e) e.count++ // logs arrive date-desc, so the first seen is the latest
    else byName.set(key, { count: 1, latest: l })
  }
  return Array.from(byName.values())
    .filter(e => e.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(e => e.latest)
}

// Most recent macros logged for this exact food name, so repeat foods fill
// themselves in ("peanut butter roll" → 150 kcal / 6P / 8F next time).
export function knownFood(logs: FoodLog[], name: string): { calories: number; protein: number; fat: number } | null {
  const key = normaliseFood(name)
  if (!key) return null
  const match = logs.find(l => normaliseFood(l.name) === key) // logs arrive date-desc
  return match ? { calories: match.calories, protein: Number(match.protein || 0), fat: Number(match.fat || 0) } : null
}

export interface EstimatedFood {
  name: string
  calories: number
  protein: number
  fat: number
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
          protein: { type: 'integer', description: 'Rough protein content in grams' },
          fat: { type: 'integer', description: 'Rough fat content in grams' },
          assumption: { type: 'string', description: 'Short clause stating the assumed portion, e.g. "restaurant portion"' },
        },
        required: ['name', 'calories', 'protein', 'fat', 'assumption'],
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
      'Estimate realistic kcal, protein grams and fat grams per item using typical UK portion sizes — single numbers, not ranges.',
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

// Photo of a plate → the same item split, via Haiku vision.
export async function estimateFoodsFromPhoto(jpegBase64: string): Promise<EstimatedFood[]> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system:
      'A UK user photographs food they are about to eat. Identify each distinct food or drink visible and ' +
      'estimate portion sizes from the photo. Standardise each name into a short conventional label. ' +
      'Estimate realistic kcal, protein grams and fat grams per item — single numbers, not ranges.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
        { type: 'text', text: 'What am I eating, and roughly how many calories, protein and fat per item?' },
      ],
    }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  })
  const block = response.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('No response from the model')
  const parsed = JSON.parse(block.text) as { items: EstimatedFood[] }
  const items = (parsed.items ?? []).filter(i => i.name && Number.isFinite(i.calories) && i.calories >= 0)
  if (items.length === 0) throw new Error("Couldn't identify food in that photo — try the text box")
  return items
}

// Barcode → Open Food Facts (free, good UK coverage). Prefers per-serving
// figures, falls back to per-100g with the quantity noted.
export async function lookupBarcode(code: string): Promise<EstimatedFood> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments,serving_size,quantity`)
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`)
  const json = await res.json() as {
    status: number
    product?: {
      product_name?: string
      brands?: string
      serving_size?: string
      quantity?: string
      nutriments?: Record<string, number | string>
    }
  }
  if (json.status !== 1 || !json.product) throw new Error('Product not found — enter it manually')
  const p = json.product
  const n = p.nutriments ?? {}
  const num = (k: string) => {
    const v = Number(n[k])
    return Number.isFinite(v) && v > 0 ? v : null
  }
  const perServing = num('energy-kcal_serving')
  const per100 = num('energy-kcal_100g')
  const useServing = perServing !== null
  const kcal = useServing ? perServing : per100
  if (kcal === null) throw new Error('No calorie data for this product — enter it manually')
  const protein = (useServing ? num('proteins_serving') : num('proteins_100g')) ?? 0
  const fat = (useServing ? num('fat_serving') : num('fat_100g')) ?? 0
  const brand = (p.brands ?? '').split(',')[0].trim()
  const baseName = p.product_name?.trim() || 'Scanned product'
  const name = brand && !baseName.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${baseName}` : baseName
  return {
    name,
    calories: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fat),
    assumption: useServing
      ? `per serving${p.serving_size ? ` (${p.serving_size})` : ''}`
      : `per 100g${p.quantity ? ` — pack is ${p.quantity}` : ''} — adjust for what you ate`,
  }
}
