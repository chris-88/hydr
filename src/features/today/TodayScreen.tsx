import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { formatMl, greetingFor, localDayKey, localHour, percentOf } from '@/lib/hydration'
import { Button, Card, SectionTitle, Sheet, Spinner } from '@/components/ui'
import WaterGauge from './WaterGauge'
import EntryList from './EntryList'
import Celebration from './Celebration'

export default function TodayScreen() {
  const { settings, loading, todayTotal, addEntry, deleteEntry, tz, today, entries } = useStore()
  const [undo, setUndo] = useState<{ id: string; amount: number } | null>(null)
  const [custom, setCustom] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [highlight, setHighlight] = useState(false)
  const quickRef = useRef<HTMLDivElement>(null)
  const undoTimer = useRef<number | null>(null)

  const goal = settings.daily_goal_ml
  const pct = percentOf(todayTotal, goal)
  const remaining = Math.max(0, goal - todayTotal)
  const hour = localHour(new Date(), tz)

  // Arrived from a notification: highlight the quick-add row.
  useEffect(() => {
    if (window.location.hash === '#log') {
      setHighlight(true)
      quickRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      history.replaceState(null, '', window.location.pathname)
      const t = setTimeout(() => setHighlight(false), 4000)
      return () => clearTimeout(t)
    }
  }, [])

  async function log(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return
    const id = await addEntry(amount)
    if (navigator.vibrate) navigator.vibrate(10)
    setUndo({ id, amount })
    if (undoTimer.current) window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndo(null), 6000)
  }

  async function undoLast() {
    if (!undo) return
    await deleteEntry(undo.id)
    setUndo(null)
  }

  const todaysEntries = entries.filter((e) => localDayKey(e.consumed_at, tz) === today)

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <p className="text-lg font-semibold text-mute">{greetingFor(hour, settings.display_name || 'Laura')}</p>
      </header>

      <Celebration reached={todayTotal >= goal && goal > 0} dayKey={today} />

      <div className="flex flex-col items-center">
        <WaterGauge percent={pct} />
        <div className="mt-5 text-center">
          <div className="text-4xl font-bold tabular-nums">
            {loading ? <Spinner /> : <>{todayTotal.toLocaleString('en-IE')} <span className="text-2xl text-mute">/ {goal.toLocaleString('en-IE')} ml</span></>}
          </div>
          <div className="mt-1 text-mute">
            {pct}% completed · {remaining === 0 ? 'Goal reached 🎉' : `${formatMl(remaining)} remaining`}
          </div>
        </div>
      </div>

      <div ref={quickRef} className={`rounded-xl2 p-1 transition ${highlight ? 'animate-pulse-ring rounded-xl2' : ''}`}>
        <div className="grid grid-cols-3 gap-3">
          {settings.quick_adds.slice(0, 3).map((ml, i) => (
            <button
              key={`${ml}-${i}`}
              onClick={(e) => {
                e.currentTarget.classList.remove('animate-pop')
                void e.currentTarget.offsetWidth
                e.currentTarget.classList.add('animate-pop')
                void log(ml)
              }}
              className="flex flex-col items-center gap-1 rounded-xl2 bg-white py-5 shadow-soft transition active:scale-95 active:bg-powder/50"
            >
              <span className="text-3xl">{ml >= 500 ? '🍶' : ml >= 250 ? '🥛' : '🥃'}</span>
              <span className="text-lg font-bold">{ml} ml</span>
              <span className="text-xs text-mute">{ml >= 500 ? 'Bottle' : ml >= 250 ? 'Glass' : 'Small glass'}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setCustom(true)} className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold text-aqua-deep active:bg-aqua/20">
          + Custom amount
        </button>
      </div>

      <section>
        <SectionTitle>Today</SectionTitle>
        {todaysEntries.length === 0 ? (
          <Card className="text-center text-mute">Nothing logged yet. Your first glass is one tap away.</Card>
        ) : (
          <EntryList entries={todaysEntries} />
        )}
      </section>

      <Sheet open={custom} onClose={() => setCustom(false)} title="Custom amount">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void log(Number(customValue))
            setCustom(false)
            setCustomValue('')
          }}
          className="space-y-4"
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={10}
              max={5000}
              step={10}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-2xl outline-none focus:border-aqua-deep"
              placeholder="330"
              autoFocus
            />
            <span className="text-lg font-semibold text-mute">ml</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[100, 200, 330, 750].map((v) => (
              <button type="button" key={v} onClick={() => setCustomValue(String(v))} className="rounded-xl bg-white py-2 text-sm font-semibold shadow-soft">
                {v}
              </button>
            ))}
          </div>
          <Button type="submit" variant="primary" className="w-full" disabled={!customValue || Number(customValue) <= 0}>
            Log {customValue || '…'} ml
          </Button>
        </form>
      </Sheet>

      {undo && (
        <div className="fixed inset-x-0 bottom-28 z-30 flex justify-center px-5">
          <div className="animate-toast flex items-center gap-4 rounded-full bg-ink px-5 py-3 text-sm text-white shadow-soft">
            <span>Added {undo.amount} ml</span>
            <button onClick={undoLast} className="font-bold text-aqua">
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
