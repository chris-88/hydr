import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/lib/store'
import { Button, Card, SectionTitle, Toggle } from '@/components/ui'
import NotificationsCard from '@/features/notifications/NotificationsCard'

const INTERVALS = [30, 60, 90, 120, 180]

function hhmm(t: string): string {
  return t.slice(0, 5)
}

export default function SettingsScreen() {
  const { settings, updateSettings, entries, deleteAllEntries, session } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [customInterval, setCustomInterval] = useState(!INTERVALS.includes(settings.reminder_interval_minutes))

  function setQuickAdd(i: number, value: number) {
    const next = [...settings.quick_adds]
    next[i] = Math.max(10, Math.min(5000, Math.round(value || 0)))
    void updateSettings({ quick_adds: next })
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), settings, entries }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `water-for-laura-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-mute">{session.user.email}</p>
      </header>

      <section>
        <SectionTitle>Daily goal</SectionTitle>
        <Card>
          <div className="flex items-center justify-between">
            <button onClick={() => updateSettings({ daily_goal_ml: Math.max(250, settings.daily_goal_ml - 250) })} className="h-12 w-12 rounded-full bg-cream text-2xl font-bold">
              −
            </button>
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums">{settings.daily_goal_ml.toLocaleString('en-IE')}</div>
              <div className="text-xs text-mute">ml per day</div>
            </div>
            <button onClick={() => updateSettings({ daily_goal_ml: Math.min(10000, settings.daily_goal_ml + 250) })} className="h-12 w-12 rounded-full bg-cream text-2xl font-bold">
              +
            </button>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Quick-add buttons</SectionTitle>
        <Card>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <label key={i} className="block">
                <input
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={5000}
                  step={10}
                  defaultValue={settings.quick_adds[i] ?? 250}
                  onBlur={(e) => setQuickAdd(i, Number(e.target.value))}
                  className="w-full rounded-2xl border border-ink/10 bg-cream px-3 py-3 text-center text-lg font-semibold outline-none focus:border-aqua-deep"
                />
                <span className="mt-1 block text-center text-xs text-mute">ml</span>
              </label>
            ))}
          </div>
        </Card>
      </section>

      <NotificationsCard />

      <section>
        <SectionTitle>Reminder schedule</SectionTitle>
        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Reminders</div>
              <div className="text-xs text-mute">Sent to every device you enabled above</div>
            </div>
            <Toggle checked={settings.reminder_enabled} onChange={(v) => updateSettings({ reminder_enabled: v })} label="Reminders" />
          </div>

          <div className={`space-y-5 ${settings.reminder_enabled ? '' : 'pointer-events-none opacity-50'}`}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-mute">From</span>
                <input type="time" value={hhmm(settings.reminder_start)} onChange={(e) => updateSettings({ reminder_start: e.target.value + ':00' })} className="w-full rounded-2xl border border-ink/10 bg-cream px-3 py-3 text-lg outline-none" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-mute">Until</span>
                <input type="time" value={hhmm(settings.reminder_end)} onChange={(e) => updateSettings({ reminder_end: e.target.value + ':00' })} className="w-full rounded-2xl border border-ink/10 bg-cream px-3 py-3 text-lg outline-none" />
              </label>
            </div>

            <div>
              <span className="mb-2 block text-xs font-semibold text-mute">Every</span>
              <div className="flex flex-wrap gap-2">
                {INTERVALS.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setCustomInterval(false)
                      void updateSettings({ reminder_interval_minutes: m })
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${!customInterval && settings.reminder_interval_minutes === m ? 'bg-aqua-deep text-white' : 'bg-cream text-ink'}`}
                  >
                    {m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${m / 60} h`}
                  </button>
                ))}
                <button onClick={() => setCustomInterval(true)} className={`rounded-full px-4 py-2 text-sm font-semibold ${customInterval ? 'bg-aqua-deep text-white' : 'bg-cream text-ink'}`}>
                  Custom
                </button>
              </div>
              {customInterval && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={15}
                    max={720}
                    step={5}
                    defaultValue={settings.reminder_interval_minutes}
                    onBlur={(e) => {
                      const v = Math.max(15, Math.min(720, Number(e.target.value) || 120))
                      void updateSettings({ reminder_interval_minutes: v })
                    }}
                    className="w-28 rounded-2xl border border-ink/10 bg-cream px-3 py-2 text-center text-lg outline-none"
                  />
                  <span className="text-sm text-mute">minutes</span>
                </div>
              )}
            </div>

            <div>
              <span className="mb-2 block text-xs font-semibold text-mute">Stay quiet after a drink for</span>
              <div className="flex flex-wrap gap-2">
                {[0, 30, 60, 90].map((m) => (
                  <button key={m} onClick={() => updateSettings({ suppression_minutes: m })} className={`rounded-full px-4 py-2 text-sm font-semibold ${settings.suppression_minutes === m ? 'bg-aqua-deep text-white' : 'bg-cream text-ink'}`}>
                    {m === 0 ? 'Never' : `${m} min`}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-mute">Reminders also stop for the day once you reach your goal.</p>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Your data</SectionTitle>
        <Card className="space-y-3">
          <Button className="w-full" onClick={exportJson}>
            Export everything as JSON
          </Button>
          {!confirmDelete ? (
            <button className="w-full py-2 text-sm font-semibold text-rose-800" onClick={() => setConfirmDelete(true)}>
              Delete all water entries…
            </button>
          ) : (
            <div className="rounded-2xl bg-blush/60 p-4 text-sm">
              <p className="mb-3 font-semibold text-rose-900">This removes every entry for good. Export first if you want a copy.</p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={async () => {
                    await deleteAllEntries()
                    setConfirmDelete(false)
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </Card>
      </section>

      <Button variant="ghost" className="w-full text-mute" onClick={() => supabase.auth.signOut()}>
        Sign out
      </Button>
    </div>
  )
}
