/**
 * Pure hydration maths. No React, no Supabase, no Date.now() unless passed in.
 * Day keys are calendar dates in the user's time zone, formatted YYYY-MM-DD.
 */
import type { Entry } from './types'

export type DayKey = string

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = dayFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    dayFormatters.set(tz, f)
  }
  return f
}

/** Calendar date of an instant in the given IANA zone. */
export function localDayKey(instant: Date | string, tz: string): DayKey {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  // en-CA yields YYYY-MM-DD directly.
  return formatterFor(tz).format(d)
}

/** Day-key arithmetic. Calendar dates have no DST, so UTC maths is exact. */
export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const t = Date.UTC(y, m - 1, d + n)
  return new Date(t).toISOString().slice(0, 10)
}

export function diffDays(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number]
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** Sum of ml per local day. */
export function dailyTotals(entries: Iterable<Pick<Entry, 'amount_ml' | 'consumed_at'>>, tz: string): Map<DayKey, number> {
  const totals = new Map<DayKey, number>()
  for (const e of entries) {
    const k = localDayKey(e.consumed_at, tz)
    totals.set(k, (totals.get(k) ?? 0) + e.amount_ml)
  }
  return totals
}

export function totalFor(totals: Map<DayKey, number>, key: DayKey): number {
  return totals.get(key) ?? 0
}

export function percentOf(total: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(100, Math.round((total / goal) * 100))
}

/** The seven day keys (Monday first) of the week containing `anchor`. */
export function weekOf(anchor: DayKey): DayKey[] {
  const monday = addDays(anchor, -weekdayIndex(anchor))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export interface MonthGrid {
  year: number
  month: number // 1-12
  /** Number of empty cells before day 1 so the grid starts on Monday. */
  leadingBlanks: number
  days: DayKey[]
}

export function monthGrid(year: number, month: number): MonthGrid {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    year,
    month,
    leadingBlanks: weekdayIndex(first),
    days: Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  }
}

export interface Streaks {
  current: number
  best: number
}

/**
 * Current streak counts consecutive goal-met days ending today, or ending
 * yesterday if today is still in progress. Best streak scans all history.
 */
export function streaks(totals: Map<DayKey, number>, goal: number, today: DayKey): Streaks {
  const met = (k: DayKey) => (totals.get(k) ?? 0) >= goal

  let current = 0
  let cursor = met(today) ? today : addDays(today, -1)
  while (met(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }

  const metDays = [...totals.keys()].filter(met).sort()
  let best = 0
  let run = 0
  let prev: DayKey | null = null
  for (const k of metDays) {
    run = prev && diffDays(k, prev) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = k
  }
  return { current, best }
}

export interface PeriodStats {
  average: number
  goalsMet: number
  daysCounted: number
  completion: number // 0-100, goalsMet / daysCounted
}

/** Stats over a set of days, ignoring days after `today` (the future). */
export function periodStats(totals: Map<DayKey, number>, goal: number, days: DayKey[], today: DayKey): PeriodStats {
  const past = days.filter((d) => d <= today)
  if (past.length === 0) return { average: 0, goalsMet: 0, daysCounted: 0, completion: 0 }
  let sum = 0
  let goalsMet = 0
  for (const d of past) {
    const t = totals.get(d) ?? 0
    sum += t
    if (t >= goal) goalsMet++
  }
  return {
    average: Math.round(sum / past.length),
    goalsMet,
    daysCounted: past.length,
    completion: Math.round((goalsMet / past.length) * 100),
  }
}

export function formatMl(ml: number): string {
  return `${ml.toLocaleString('en-IE')} ml`
}

export function greetingFor(hour: number, name: string): string {
  if (hour < 5) return `Still up, ${name}? 🌙 A sip before bed.`
  if (hour < 12) return `Morning ${name} ☀️ Ready for your first glass?`
  if (hour < 17) return `Afternoon ${name} 🌤️ How's the water going?`
  if (hour < 21) return `Evening ${name} 🌆 A glass with dinner?`
  return `Night ${name} 🌙 One last sip?`
}

/** Local hour (0-23) of an instant in a zone. */
export function localHour(instant: Date, tz: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(instant)
  return Number(h)
}
