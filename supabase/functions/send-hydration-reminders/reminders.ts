/**
 * Pure reminder logic. No network, no Deno APIs, so it is trivially testable.
 */

export interface LocalTime {
  /** YYYY-MM-DD in the user's zone */
  date: string
  /** minutes since local midnight */
  minutes: number
}

/** Wall-clock time of `now` in an IANA zone. Intl handles DST. */
export function localTime(now: Date, tz: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

/** "HH:MM" or "HH:MM:SS" to minutes since midnight. */
export function parseClock(s: string): number {
  const [h = '0', m = '0'] = s.split(':')
  return Number(h) * 60 + Number(m)
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * Returns the slot key ("YYYY-MM-DD HH:MM") that is due right now, or null.
 * Slots are start, start+interval, … while <= end. A slot is due if the local
 * time is within [slot, slot + windowMinutes). The window is wider than the
 * cron period so jitter cannot skip a slot; the slot claim prevents doubles.
 */
export function dueSlot(
  local: LocalTime,
  start: string,
  end: string,
  intervalMinutes: number,
  windowMinutes = 10,
): string | null {
  const startMin = parseClock(start)
  const endMin = parseClock(end)
  if (intervalMinutes <= 0 || endMin < startMin) return null
  if (local.minutes < startMin || local.minutes >= endMin + windowMinutes) return null
  const sinceStart = local.minutes - startMin
  const k = Math.floor(sinceStart / intervalMinutes)
  const slotMin = startMin + k * intervalMinutes
  if (slotMin > endMin) return null
  if (local.minutes - slotMin >= windowMinutes) return null
  return `${local.date} ${clock(slotMin)}`
}

export interface SendDecision {
  send: boolean
  reason: 'ok' | 'goal_reached' | 'recent_drink'
}

export function shouldSend(input: {
  todayTotal: number
  goal: number
  lastEntryAt: Date | null
  now: Date
  suppressionMinutes: number
}): SendDecision {
  if (input.todayTotal >= input.goal) return { send: false, reason: 'goal_reached' }
  if (input.lastEntryAt) {
    const ageMin = (input.now.getTime() - input.lastEntryAt.getTime()) / 60_000
    if (ageMin >= 0 && ageMin < input.suppressionMinutes) return { send: false, reason: 'recent_drink' }
  }
  return { send: true, reason: 'ok' }
}

export const MESSAGES = [
  'A little water break? 💧',
  'Hey {name}, time for a sip.',
  'Your water bottle misses you.',
  'A quick glass of water would be lovely.',
  "You're making good progress today.",
  'Just a gentle reminder to hydrate.',
] as const

/** Deterministic per slot so a retried invocation picks the same text. */
export function pickMessage(name: string, slotKey: string): string {
  let h = 0
  for (const ch of slotKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const template = MESSAGES[h % MESSAGES.length] ?? MESSAGES[0]
  return template.replace('{name}', name)
}

export interface EntryLike {
  amount_ml: number
  consumed_at: string
}

/** Total for the given local date, plus the most recent entry instant. */
export function summariseEntries(entries: EntryLike[], tz: string, localDate: string): { todayTotal: number; lastEntryAt: Date | null } {
  let todayTotal = 0
  let last: Date | null = null
  for (const e of entries) {
    const at = new Date(e.consumed_at)
    if (localTime(at, tz).date === localDate) todayTotal += e.amount_ml
    if (!last || at > last) last = at
  }
  return { todayTotal, lastEntryAt: last }
}
