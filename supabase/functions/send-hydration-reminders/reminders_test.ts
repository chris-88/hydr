import { assertEquals } from 'jsr:@std/assert@1'
import { dueSlot, localTime, pickMessage, shouldSend, summariseEntries } from './reminders.ts'

const TZ = 'Europe/Dublin'

Deno.test('localTime converts with summer time', () => {
  assertEquals(localTime(new Date('2026-07-01T08:05:00Z'), TZ), { date: '2026-07-01', minutes: 9 * 60 + 5 })
  assertEquals(localTime(new Date('2026-01-01T08:05:00Z'), TZ), { date: '2026-01-01', minutes: 8 * 60 + 5 })
})

Deno.test('09:00 slot is due at 09:00 local on the spring-forward day', () => {
  // 29 Mar 2026: clocks go forward at 01:00 UTC. 09:00 IST = 08:00 UTC.
  const lt = localTime(new Date('2026-03-29T08:02:00Z'), TZ)
  assertEquals(dueSlot(lt, '09:00', '21:00', 120), '2026-03-29 09:00')
  // An hour earlier in UTC it is 08:02 local and nothing is due.
  assertEquals(dueSlot(localTime(new Date('2026-03-29T07:02:00Z'), TZ), '09:00', '21:00', 120), null)
})

Deno.test('09:00 slot is due at 09:00 local on the fall-back day', () => {
  // 25 Oct 2026: clocks go back at 01:00 UTC. 09:00 GMT = 09:00 UTC.
  assertEquals(dueSlot(localTime(new Date('2026-10-25T09:01:00Z'), TZ), '09:00', '21:00', 120), '2026-10-25 09:00')
  assertEquals(dueSlot(localTime(new Date('2026-10-25T08:01:00Z'), TZ), '09:00', '21:00', 120), null)
})

Deno.test('the repeated 01:xx hour yields one slot key, so the claim dedups it', () => {
  const a = dueSlot(localTime(new Date('2026-10-25T00:31:00Z'), TZ), '01:00', '03:00', 30) // 01:31 IST
  const b = dueSlot(localTime(new Date('2026-10-25T01:31:00Z'), TZ), '01:00', '03:00', 30) // 01:31 GMT
  assertEquals(a, '2026-10-25 01:30')
  assertEquals(b, '2026-10-25 01:30')
})

Deno.test('window edges and end of day', () => {
  const at = (m: number) => ({ date: '2026-10-30', minutes: m })
  assertEquals(dueSlot(at(9 * 60), '09:00', '21:00', 120), '2026-10-30 09:00')
  assertEquals(dueSlot(at(9 * 60 + 9), '09:00', '21:00', 120), '2026-10-30 09:00')
  assertEquals(dueSlot(at(9 * 60 + 10), '09:00', '21:00', 120), null)
  assertEquals(dueSlot(at(11 * 60 + 3), '09:00', '21:00', 120), '2026-10-30 11:00')
  assertEquals(dueSlot(at(21 * 60 + 4), '09:00', '21:00', 120), '2026-10-30 21:00', 'end time itself is a slot')
  assertEquals(dueSlot(at(21 * 60 + 30), '09:00', '21:00', 120), null)
  assertEquals(dueSlot(at(8 * 60 + 59), '09:00', '21:00', 120), null)
  // 90 minute interval: 09:00 10:30 12:00 … 21:00
  assertEquals(dueSlot(at(10 * 60 + 30), '09:00', '21:00', 90), '2026-10-30 10:30')
  assertEquals(dueSlot(at(20 * 60 + 30), '09:00', '21:00', 90), null, '20:30 is not a 90-minute slot from 09:00')
  // seconds in time columns are tolerated
  assertEquals(dueSlot(at(9 * 60), '09:00:00', '21:00:00', 120), '2026-10-30 09:00')
})

Deno.test('suppression rules', () => {
  const now = new Date('2026-10-30T11:00:00Z')
  const base = { goal: 2000, now, suppressionMinutes: 60 }
  assertEquals(shouldSend({ ...base, todayTotal: 2000, lastEntryAt: null }).reason, 'goal_reached')
  assertEquals(shouldSend({ ...base, todayTotal: 500, lastEntryAt: new Date('2026-10-30T10:30:00Z') }).reason, 'recent_drink')
  assertEquals(shouldSend({ ...base, todayTotal: 500, lastEntryAt: new Date('2026-10-30T09:30:00Z') }).send, true)
  assertEquals(shouldSend({ ...base, todayTotal: 0, lastEntryAt: null }).send, true)
  assertEquals(shouldSend({ ...base, suppressionMinutes: 0, todayTotal: 0, lastEntryAt: now }).send, true)
})

Deno.test('summariseEntries counts only the local day but tracks the latest entry', () => {
  const s = summariseEntries(
    [
      { amount_ml: 300, consumed_at: '2026-10-29T22:00:00Z' }, // yesterday local
      { amount_ml: 250, consumed_at: '2026-10-30T07:00:00Z' },
      { amount_ml: 150, consumed_at: '2026-10-30T09:40:00Z' },
    ],
    TZ,
    '2026-10-30',
  )
  assertEquals(s.todayTotal, 400)
  assertEquals(s.lastEntryAt?.toISOString(), '2026-10-30T09:40:00.000Z')
})

Deno.test('pickMessage is deterministic and substitutes the name', () => {
  const a = pickMessage('Laura', '2026-10-30 09:00')
  assertEquals(a, pickMessage('Laura', '2026-10-30 09:00'))
  assertEquals(pickMessage('Laura', 'x').includes('{name}'), false)
})
