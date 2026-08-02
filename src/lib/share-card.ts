// Render a goal's progress as a shareable PNG (1080×1350, WhatsApp-friendly).
// Hand-drawn on canvas in the app's own visual language — paper background,
// serif display type, the goal's colour as the accent — rather than a DOM
// screenshot, so it always comes out crisp and never leaks surrounding UI.
import { addDays, format, parseISO, startOfWeek, subWeeks } from 'date-fns'
import type { Goal, GoalEntry } from '@/types'
import {
  bestStreak, currentStreak, dateKey, entryByDate, moneySaved, nextMilestone,
  heatCellAlpha, personalBest, targetProgress, thisWeekCount, totalDone,
} from '@/lib/goal-stats'
import { goalColor, GOAL_TYPE_LABELS } from '@/components/planner/goal-meta'

const W = 1080
const H = 1350
const PAD = 84
const PAPER = '#FAF9F5'
const INK = '#3D3929'
const INK_SOFT = '#83827d'
const MIST = '#E8E5DC'
const CLAY = '#C96442'
const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'
const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'

export async function renderGoalCard(goal: Goal, goalEntries: GoalEntry[]): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const hex = goalColor(goal.color).hex

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, W, 16)

  // header
  ctx.fillStyle = hex
  ctx.font = `600 30px ${SANS}`
  const eyebrow = GOAL_TYPE_LABELS[goal.goal_type].toUpperCase()
  drawTracked(ctx, eyebrow, PAD, PAD + 80, 6)

  ctx.fillStyle = INK
  ctx.font = `bold 82px ${SERIF}`
  const titleLines = wrapText(ctx, goal.name, W - PAD * 2, 2)
  let y = PAD + 160
  for (const line of titleLines) { ctx.fillText(line, PAD, y); y += 92 }

  ctx.fillStyle = INK_SOFT
  ctx.font = `italic 32px ${SERIF}`
  ctx.fillText(`since ${format(parseISO(goal.start_date), 'd MMMM yyyy')}`, PAD, y + 6)
  y += 70

  // hero + body per goal type
  if (goal.goal_type === 'abstinence') {
    const streak = currentStreak(goalEntries)
    const saved = moneySaved(goal, goalEntries)
    const milestone = nextMilestone(streak)
    y = drawHero(ctx, String(streak), streak === 1 ? 'day streak' : 'day streak', hex, y)
    if (milestone && streak > 0) {
      ctx.fillStyle = INK_SOFT
      ctx.font = `30px ${SANS}`
      ctx.fillText(`next milestone ${milestone.at} days — ${milestone.daysToGo} to go`, PAD, y)
    }
    y += 50
    y = drawGrid(ctx, goal, goalEntries, hex, y)
    drawStats(ctx, y, [
      ['best streak', `${bestStreak(goalEntries)}d`],
      ['clean days', String(totalDone(goalEntries))],
      ...(saved !== null ? [['saved', gbp(saved)] as [string, string]] : []),
    ])
  } else if (goal.goal_type === 'habit') {
    const daily = goal.daily_target && goal.daily_target > 1 ? goal.daily_target : null
    const target = goal.frequency_per_week || 7
    const weekStart = dateKey(startOfWeek(new Date(), { weekStartsOn: 1 }))
    const week = daily
      ? goalEntries.filter(e => e.date >= weekStart && Number(e.value) >= daily).length
      : thisWeekCount(goalEntries)
    const total = daily
      ? goalEntries.filter(e => Number(e.value) >= daily).length
      : totalDone(goalEntries)
    y = drawHero(ctx, `${week}/${target}`, daily ? 'full days this week' : 'this week', hex, y)
    y += 30
    y = drawGrid(ctx, goal, goalEntries, hex, y)
    drawStats(ctx, y, [
      [daily ? 'full days' : 'total done', String(total)],
      ...(daily ? [['daily target', `${daily} ${goal.unit || ''}`.trim()] as [string, string]] : []),
    ])
  } else if (goal.goal_type === 'record') {
    const pb = personalBest(goal, goalEntries)
    const sorted = [...goalEntries].sort((a, b) => a.date.localeCompare(b.date))
    const last = sorted[sorted.length - 1]
    y = drawHero(ctx, pb !== null ? `${pb}${goal.unit}` : '—', 'personal best', hex, y)
    y += 30
    y = drawChart(ctx, sorted.map(e => Number(e.value)), hex, y, pb)
    drawStats(ctx, y, [
      ['last attempt', last ? `${Number(last.value)}${goal.unit}` : '—'],
      ['attempts', String(goalEntries.length)],
      ['better is', goal.record_direction === 'higher' ? 'higher' : 'lower'],
    ])
  } else {
    const progress = targetProgress(goal, goalEntries)
    const sorted = [...goalEntries].sort((a, b) => a.date.localeCompare(b.date))
    y = drawHero(ctx, `${goal.unit}${progress.current.toLocaleString()}`, 'current', hex, y)
    y += 30
    y = drawChart(ctx, [Number(goal.start_value), ...sorted.map(e => Number(e.value))], hex, y,
      goal.target_value !== null ? Number(goal.target_value) : null)
    drawStats(ctx, y, [
      ['started at', `${goal.unit}${Number(goal.start_value).toLocaleString()}`],
      ...(goal.target_value !== null ? [
        ['target', `${goal.unit}${Number(goal.target_value).toLocaleString()}`] as [string, string],
        ['progress', `${Math.round(progress.pct)}%`] as [string, string],
      ] : []),
    ])
  }

  // footer
  ctx.strokeStyle = MIST
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(PAD, H - 150); ctx.lineTo(W - PAD, H - 150); ctx.stroke()
  ctx.fillStyle = CLAY
  ctx.font = `bold 44px ${SERIF}`
  ctx.fillText('LifeFlow', PAD, H - 84)
  ctx.fillStyle = INK_SOFT
  ctx.font = `italic 28px ${SERIF}`
  ctx.fillText('one day at a time', PAD + 200, H - 84)
  ctx.textAlign = 'right'
  ctx.font = `28px ${SANS}`
  ctx.fillText(format(new Date(), 'd MMM yyyy'), W - PAD, H - 84)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png'),
  )
}

function drawHero(ctx: CanvasRenderingContext2D, value: string, label: string, hex: string, y: number): number {
  ctx.fillStyle = hex
  ctx.font = `bold 170px ${SERIF}`
  ctx.fillText(value, PAD, y + 150)
  const w = ctx.measureText(value).width
  ctx.fillStyle = INK_SOFT
  ctx.font = `34px ${SANS}`
  ctx.fillText(label, PAD + w + 28, y + 142)
  return y + 200
}

// 16-week contribution grid, same shading rules as the on-screen heatmap
// (fractional alpha for count-per-day goals, red for slips).
function drawGrid(ctx: CanvasRenderingContext2D, goal: Goal, goalEntries: GoalEntry[], hex: string, y: number): number {
  const weeks = 16
  const byDate = entryByDate(goalEntries)
  const todayStr = dateKey(new Date())
  const gridStart = startOfWeek(subWeeks(new Date(), weeks - 1), { weekStartsOn: 1 })
  const daily = goal.goal_type === 'habit' && goal.daily_target && goal.daily_target > 1 ? goal.daily_target : null
  // Fit both ways: never wider than the page, never so tall that the grid
  // shoves the stats row into the footer (long two-line titles shrink it).
  const gap = 7
  const widthCell = Math.floor((W - PAD * 2 - (weeks - 1) * gap) / weeks)
  const heightCell = Math.floor((H - 320 - y) / 7) - gap
  const cell = Math.max(18, Math.min(widthCell, heightCell))
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = addDays(gridStart, w * 7 + d)
      const key = dateKey(day)
      const entry = byDate.get(key)
      const x = PAD + w * (cell + gap)
      const cy = y + d * (cell + gap)
      ctx.globalAlpha = 1
      if (key > todayStr || key < goal.start_date) { ctx.fillStyle = MIST; ctx.globalAlpha = 0.45 }
      else if (entry && Number(entry.value) > 0) {
        ctx.fillStyle = hex
        if (daily) ctx.globalAlpha = heatCellAlpha(Number(entry.value), daily)
      } else if (entry) ctx.fillStyle = '#ef4444'
      else ctx.fillStyle = MIST
      roundedRect(ctx, x, cy, cell, cell, 8)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  return y + 7 * (cell + gap) + 40
}

function drawChart(ctx: CanvasRenderingContext2D, values: number[], hex: string, y: number, reference: number | null): number {
  const bw = W - PAD * 2
  const bh = 330
  if (values.length >= 2) {
    const all = reference !== null ? [...values, reference] : values
    const min = Math.min(...all), max = Math.max(...all)
    const span = max - min || 1
    const px = (i: number) => PAD + (i / (values.length - 1)) * bw
    const py = (v: number) => y + bh - ((v - min) / span) * (bh - 40) - 20
    if (reference !== null) {
      ctx.strokeStyle = hex
      ctx.globalAlpha = 0.5
      ctx.setLineDash([12, 10])
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(PAD, py(reference)); ctx.lineTo(W - PAD, py(reference)); ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = hex
    ctx.lineWidth = 7
    ctx.lineJoin = 'round'
    ctx.beginPath()
    values.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))))
    ctx.stroke()
    ctx.fillStyle = hex
    values.forEach((v, i) => { ctx.beginPath(); ctx.arc(px(i), py(v), 9, 0, Math.PI * 2); ctx.fill() })
  } else {
    ctx.fillStyle = INK_SOFT
    ctx.font = `30px ${SANS}`
    ctx.fillText('Not enough attempts yet for a trend.', PAD, y + 60)
  }
  return y + bh + 70
}

function drawStats(ctx: CanvasRenderingContext2D, y: number, stats: [string, string][]) {
  y = Math.min(y, H - 280)   // never run into the footer
  let x = PAD
  for (const [label, value] of stats.slice(0, 4)) {
    ctx.fillStyle = INK
    ctx.font = `bold 46px ${SERIF}`
    ctx.fillText(value, x, y + 46)
    const w = Math.max(ctx.measureText(value).width, 120)
    ctx.fillStyle = INK_SOFT
    ctx.font = `600 22px ${SANS}`
    drawTracked(ctx, label.toUpperCase(), x, y + 88, 2.5)
    x += w + 90
  }
}

function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  let cx = x
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + tracking
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
      if (lines.length === maxLines - 1) break
    } else line = test
  }
  if (line && lines.length < maxLines) lines.push(line)
  else if (line) lines[maxLines - 1] = lines[maxLines - 1].replace(/…?$/, '…')
  return lines
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function gbp(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
}
