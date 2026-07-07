import { addYears, parseISO } from 'date-fns'
import { dateKey } from './goal-stats'
import type { CalendarEntry } from '@/types'

// Does this entry fall on the given day (multi-day spans + yearly recurrence)?
export function occursOn(entry: CalendarEntry, day: string): boolean {
  if (entry.date === day) return true
  if (entry.end_date && entry.date <= day && day <= entry.end_date) return true
  return entry.recurs_annually && entry.date.slice(5) === day.slice(5) && entry.date <= day
}

// Next occurrence of an entry on/after today (for the upcoming list)
export function nextOccurrence(entry: CalendarEntry, today: string): string | null {
  // An in-progress span (holiday we're on) counts as happening today
  if (entry.end_date && entry.date <= today && today <= entry.end_date) return today
  if (!entry.recurs_annually) return entry.date >= today ? entry.date : null
  const thisYear = `${today.slice(0, 4)}${entry.date.slice(4)}`
  if (thisYear >= today) return thisYear
  return dateKey(addYears(parseISO(thisYear), 1))
}
