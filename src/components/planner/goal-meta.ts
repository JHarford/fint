import {
  Ban, BookOpen, Brain, Cigarette, Dice5, Dumbbell, Footprints, GlassWater,
  Heart, Moon, PiggyBank, Salad, Target, Timer, TrendingDown, Trophy, Wine,
  type LucideIcon,
} from 'lucide-react'
import type { GoalType, RecordDirection } from '@/types'

export const GOAL_ICONS: Record<string, LucideIcon> = {
  wine: Wine,
  cigarette: Cigarette,
  ban: Ban,
  dumbbell: Dumbbell,
  footprints: Footprints,
  heart: Heart,
  salad: Salad,
  water: GlassWater,
  book: BookOpen,
  brain: Brain,
  moon: Moon,
  'piggy-bank': PiggyBank,
  'trending-down': TrendingDown,
  target: Target,
  timer: Timer,
  trophy: Trophy,
  dice: Dice5,
}

export interface GoalColor {
  solid: string
  soft: string
  text: string
  hex: string
}

export const GOAL_COLORS: Record<string, GoalColor> = {
  emerald: { solid: 'bg-emerald-500', soft: 'bg-emerald-500/15', text: 'text-emerald-600', hex: '#10b981' },
  blue: { solid: 'bg-blue-500', soft: 'bg-blue-500/15', text: 'text-blue-600', hex: '#3b82f6' },
  violet: { solid: 'bg-violet-500', soft: 'bg-violet-500/15', text: 'text-violet-600', hex: '#8b5cf6' },
  amber: { solid: 'bg-amber-500', soft: 'bg-amber-500/15', text: 'text-amber-600', hex: '#f59e0b' },
  rose: { solid: 'bg-rose-500', soft: 'bg-rose-500/15', text: 'text-rose-600', hex: '#f43f5e' },
  cyan: { solid: 'bg-cyan-500', soft: 'bg-cyan-500/15', text: 'text-cyan-600', hex: '#06b6d4' },
}

export function goalColor(name: string): GoalColor {
  return GOAL_COLORS[name] ?? GOAL_COLORS.emerald
}

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  abstinence: 'Quit / avoid',
  habit: 'Habit',
  target: 'Number target',
  record: 'Personal best',
}

export interface GoalPreset {
  name: string
  goal_type: GoalType
  icon: string
  color: string
  frequency_per_week: number | null
  daily_target?: number
  unit: string
  description: string
  record_direction?: RecordDirection
}

export const GOAL_PRESETS: GoalPreset[] = [
  { name: 'No alcohol', goal_type: 'abstinence', icon: 'wine', color: 'rose', frequency_per_week: null, unit: '', description: 'One clean day at a time' },
  { name: 'No smoking', goal_type: 'abstinence', icon: 'cigarette', color: 'amber', frequency_per_week: null, unit: '', description: '' },
  { name: 'Exercise', goal_type: 'habit', icon: 'dumbbell', color: 'emerald', frequency_per_week: 4, unit: '', description: 'Gym, run, or any workout' },
  { name: 'Running', goal_type: 'habit', icon: 'footprints', color: 'cyan', frequency_per_week: 3, unit: '', description: '' },
  { name: 'Healthy eating', goal_type: 'habit', icon: 'salad', color: 'emerald', frequency_per_week: 7, unit: '', description: '' },
  { name: 'Water', goal_type: 'habit', icon: 'water', color: 'blue', frequency_per_week: 7, daily_target: 5, unit: 'pint', description: '5 pints a day' },
  { name: 'Read', goal_type: 'habit', icon: 'book', color: 'violet', frequency_per_week: 5, unit: '', description: '' },
  { name: 'Meditate', goal_type: 'habit', icon: 'brain', color: 'blue', frequency_per_week: 7, unit: '', description: '' },
  { name: 'Early night', goal_type: 'habit', icon: 'moon', color: 'violet', frequency_per_week: 5, unit: '', description: 'In bed before 11pm' },
  { name: 'Savings', goal_type: 'target', icon: 'piggy-bank', color: 'blue', frequency_per_week: null, unit: '£', description: 'Log your savings balance as it grows' },
  { name: 'Weight', goal_type: 'target', icon: 'trending-down', color: 'amber', frequency_per_week: null, unit: 'kg', description: 'Log your weight over time' },
  { name: 'Speedcubing', goal_type: 'record', icon: 'timer', color: 'cyan', frequency_per_week: null, unit: 's', description: 'Log your best solve of the day', record_direction: 'lower' },
  { name: 'Darts', goal_type: 'record', icon: 'trophy', color: 'emerald', frequency_per_week: null, unit: 'pts', description: 'Highest checkout / best leg', record_direction: 'higher' },
]
