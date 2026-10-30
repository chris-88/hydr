import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { addDays, localDayKey, monthGrid, periodStats, streaks, weekOf, formatMl } from '@/lib/hydration'
import { Card, SectionTitle, Sheet, Stat } from '@/components/ui'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function HistoryScreen() {
  const { totals, settings, today, entries, tz } = useStore()
  const goal = settings.daily_goal_ml
  const [view, setView] = useState<'week' | 'month'>('week')
  const [weekAnchor, setWeekAnchor] = useState(today)
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))
  const [day, setDay] = useState<string | null>(null)

  const week = useMemo(() => weekOf(weekAnchor), [weekAnchor])
  const weekStats = useMemo(() => periodStats(totals, goal, week, today), [totals, goal, week, today])
  const streak = useMemo(() => streaks(totals, goal, today), [totals, goal, today])
  const grid = useMemo(() => monthGrid(month.y, month.m), [month])
  const monthStats = useMemo(() => periodStats(totals, goal, grid.days, today), [totals, goal, grid, today])
  const maxWeek = Math.max(goal, ...week.map((d) => totals.get(d) ?? 0))

  const dayEntries = day ? entries.filter((e) => localDayKey(e.consumed_at, tz) === day) : []

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold">History</h1>
        <div className="flex rounded-full bg-white p-1 shadow-soft">
          {(['week', 'month'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${view === v ? 'bg-aqua-deep text-white' : 'text-mute'}`}>
              {v}
            </button>
          ))}
        </div>
      </header>

      {view === 'week' ? (
        <>
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <button onClick={() => setWeekAnchor(addDays(weekAnchor, -7))} className="rounded-full px-3 py-1 text-lg">‹</button>
              <div className="text-sm font-semibold text-mute">
                {fmtShort(week[0]!)} – {fmtShort(week[6]!)}
              </div>
              <button onClick={() => setWeekAnchor(addDays(weekAnchor, 7))} disabled={week[6]! >= today} className="rounded-full px-3 py-1 text-lg disabled:opacity-30">›</button>
            </div>
            <div className="relative h-44">
              <div className="absolute inset-x-0 border-t border-dashed border-lavender-deep/60" style={{ bottom: `${(goal / maxWeek) * 100}%` }}>
                <span className="absolute right-0 -top-4 text-[10px] font-semibold text-lavender-deep">goal</span>
              </div>
              <div className="grid h-full grid-cols-7 items-end gap-2">
                {week.map((d, i) => {
                  const t = totals.get(d) ?? 0
                  const h = maxWeek ? (t / maxWeek) * 100 : 0
                  const future = d > today
                  return (
                    <button key={d} onClick={() => !future && setDay(d)} className="flex h-full flex-col items-center justify-end gap-1" aria-label={`${d}: ${t} ml`}>
                      <span className="text-[10px] font-semibold text-mute">{t ? Math.round(t / 100) / 10 + 'L' : ''}</span>
                      <div
                        className={`w-full rounded-t-xl transition-[height] duration-500 ${future ? 'bg-ink/5' : t >= goal ? 'bg-aqua-deep' : 'bg-powder-deep'} ${d === today ? 'ring-2 ring-lavender-deep ring-offset-2' : ''}`}
                        style={{ height: `${Math.max(h, 2)}%` }}
                      />
                      <span className={`text-xs ${d === today ? 'font-bold text-ink' : 'text-mute'}`}>{DOW[i]}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Average" value={formatMl(weekStats.average)} hint="per day so far" />
            <Stat label="Goals met" value={`${weekStats.goalsMet} / ${weekStats.daysCounted}`} />
            <Stat label="Current streak" value={`${streak.current} day${streak.current === 1 ? '' : 's'}`} />
            <Stat label="Best streak" value={`${streak.best} day${streak.best === 1 ? '' : 's'}`} />
          </div>
        </>
      ) : (
        <>
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <button onClick={() => setMonth(prev)} className="rounded-full px-3 py-1 text-lg">‹</button>
              <div className="font-semibold">
                {MONTHS[month.m - 1]} {month.y}
              </div>
              <button onClick={() => setMonth(next)} disabled={grid.days[0]! > today} className="rounded-full px-3 py-1 text-lg disabled:opacity-30">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold text-mute">
              {DOW.map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {Array.from({ length: grid.leadingBlanks }, (_, i) => (
                <div key={`b${i}`} />
              ))}
              {grid.days.map((d) => {
                const t = totals.get(d) ?? 0
                const ratio = goal ? Math.min(1, t / goal) : 0
                const future = d > today
                return (
                  <button
                    key={d}
                    disabled={future}
                    onClick={() => setDay(d)}
                    className={`aspect-square rounded-lg text-xs font-semibold ${d === today ? 'ring-2 ring-lavender-deep' : ''} disabled:opacity-30`}
                    style={{ background: future ? '#f1efe9' : heat(ratio), color: ratio > 0.6 ? 'white' : '#2a3140' }}
                    aria-label={`${d}: ${t} ml`}
                  >
                    {Number(d.slice(8))}
                  </button>
                )
              })}
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Monthly average" value={formatMl(monthStats.average)} hint="per day so far" />
            <Stat label="Completion" value={`${monthStats.completion}%`} hint={`${monthStats.goalsMet} of ${monthStats.daysCounted} days`} />
          </div>
        </>
      )}

      <Sheet open={!!day} onClose={() => setDay(null)} title={day ? fmtLong(day) : ''}>
        <div className="mb-3 text-mute">
          {formatMl(day ? totals.get(day) ?? 0 : 0)} of {formatMl(goal)}
        </div>
        {dayEntries.length === 0 ? (
          <p className="text-sm text-mute">Nothing logged.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-ink/5 overflow-y-auto rounded-2xl bg-white">
            {dayEntries.map((e) => (
              <li key={e.id} className="flex justify-between px-4 py-2 text-sm">
                <span>{e.amount_ml} ml</span>
                <span className="text-mute">{new Intl.DateTimeFormat('en-IE', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(e.consumed_at))}</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <SectionTitle>{''}</SectionTitle>
    </div>
  )
}

function heat(ratio: number): string {
  if (ratio === 0) return '#f1efe9'
  if (ratio < 0.34) return '#e3f3f8'
  if (ratio < 0.67) return '#bfe3f0'
  if (ratio < 1) return '#7fd1c9'
  return '#3fb3a8'
}

function prev(m: { y: number; m: number }) {
  return m.m === 1 ? { y: m.y - 1, m: 12 } : { y: m.y, m: m.m - 1 }
}
function next(m: { y: number; m: number }) {
  return m.m === 12 ? { y: m.y + 1, m: 1 } : { y: m.y, m: m.m + 1 }
}
function fmtShort(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}
function fmtLong(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}
