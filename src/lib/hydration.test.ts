import { describe, expect, it } from 'vitest'
import {
  addDays,
  dailyTotals,
  localDayKey,
  monthGrid,
  periodStats,
  streaks,
  weekOf,
  weekdayIndex,
} from './hydration'

const TZ = 'Europe/Dublin'

describe('localDayKey across Dublin clock changes', () => {
  it('buckets just before the spring change into the 28th', () => {
    expect(localDayKey('2026-03-28T23:30:00Z', TZ)).toBe('2026-03-28')
  })
  it('buckets late UTC evening in summer into the next local day', () => {
    // 23:30 UTC on 24 Oct is 00:30 IST on 25 Oct (still summer time).
    expect(localDayKey('2026-10-24T23:30:00Z', TZ)).toBe('2026-10-25')
  })
  it('buckets late UTC evening after the autumn change into the same day', () => {
    expect(localDayKey('2026-10-25T23:30:00Z', TZ)).toBe('2026-10-25')
  })
  it('handles the repeated hour on 25 Oct', () => {
    expect(localDayKey('2026-10-25T00:30:00Z', TZ)).toBe('2026-10-25') // 01:30 IST
    expect(localDayKey('2026-10-25T01:30:00Z', TZ)).toBe('2026-10-25') // 01:30 GMT
  })
})

describe('day arithmetic', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('knows weekdays, Monday first', () => {
    expect(weekdayIndex('2026-10-26')).toBe(0) // Monday
    expect(weekdayIndex('2026-11-01')).toBe(6) // Sunday
  })
  it('returns Monday-to-Sunday week containing the anchor', () => {
    expect(weekOf('2026-10-30')).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ])
  })
  it('builds a month grid with leading blanks', () => {
    const g = monthGrid(2026, 10)
    expect(g.days).toHaveLength(31)
    expect(g.leadingBlanks).toBe(3) // 1 Oct 2026 is a Thursday
    expect(monthGrid(2026, 2).days).toHaveLength(28)
  })
})

describe('totals and streaks', () => {
  const entries = [
    { amount_ml: 500, consumed_at: '2026-10-27T08:00:00Z' },
    { amount_ml: 1500, consumed_at: '2026-10-27T18:00:00Z' },
    { amount_ml: 2000, consumed_at: '2026-10-28T12:00:00Z' },
    { amount_ml: 2200, consumed_at: '2026-10-29T12:00:00Z' },
    { amount_ml: 300, consumed_at: '2026-10-30T07:00:00Z' },
    // an older isolated run of two
    { amount_ml: 2000, consumed_at: '2026-10-01T12:00:00Z' },
    { amount_ml: 2000, consumed_at: '2026-10-02T12:00:00Z' },
  ]
  const totals = dailyTotals(entries, TZ)

  it('sums per local day', () => {
    expect(totals.get('2026-10-27')).toBe(2000)
    expect(totals.get('2026-10-30')).toBe(300)
  })

  it('counts the current streak from yesterday when today is unfinished', () => {
    expect(streaks(totals, 2000, '2026-10-30')).toEqual({ current: 3, best: 3 })
  })

  it('includes today once the goal is met', () => {
    const t = new Map(totals)
    t.set('2026-10-30', 2100)
    expect(streaks(t, 2000, '2026-10-30').current).toBe(4)
  })

  it('breaks the streak on a missed day', () => {
    expect(streaks(totals, 2000, '2026-11-02').current).toBe(0)
  })

  it('computes period stats ignoring future days', () => {
    const s = periodStats(totals, 2000, weekOf('2026-10-30'), '2026-10-30')
    expect(s.daysCounted).toBe(5) // Mon-Fri
    expect(s.goalsMet).toBe(3)
    expect(s.average).toBe(Math.round((2000 + 2000 + 2200 + 300) / 5))
    expect(s.completion).toBe(60)
  })
})
