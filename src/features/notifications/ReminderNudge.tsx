import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { enablePush, getPushStatus, type PushStatus } from '@/lib/push'
import { Button, Card } from '@/components/ui'

const SNOOZE_KEY = 'hydr.reminder-nudge.snoozed-until'
const WEEK = 7 * 24 * 60 * 60 * 1000

function snoozed(): boolean {
  const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0)
  return Number.isFinite(until) && until > Date.now()
}

/**
 * The one place a first-time user is asked to allow reminders. The full
 * controls stay in Settings; this card exists because nobody opens Settings
 * unprompted, and on iOS the permission can only be requested from a tap in
 * the installed app. It shows until reminders are active, blocked, or snoozed.
 */
export default function ReminderNudge() {
  const { userId, settings } = useStore()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(snoozed)

  const refresh = useCallback(() => {
    getPushStatus(userId).then(setStatus).catch(() => setStatus('unsupported'))
  }, [userId])

  useEffect(() => {
    refresh()
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refresh])

  if (hidden || status === null || status === 'unsupported') return null
  if (status === 'active' && settings.reminder_enabled && !done) return null

  async function enable() {
    setBusy(true)
    setError(null)
    try {
      const next = await enablePush(userId)
      setStatus(next)
      if (next === 'active') setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function later() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + WEEK))
    setHidden(true)
  }

  if (done) {
    return (
      <Card className="space-y-1 bg-aqua/20">
        <p className="font-semibold">Reminders are on.</p>
        <p className="text-sm text-mute">
          Every {settings.reminder_interval_minutes / 60} hours between {settings.reminder_start.slice(0, 5)} and{' '}
          {settings.reminder_end.slice(0, 5)}. Change the times in Settings.
        </p>
      </Card>
    )
  }

  if (status === 'needs-install') {
    return (
      <Card className="space-y-2">
        <p className="font-semibold">Want gentle reminders?</p>
        <p className="text-sm text-mute">
          Add this app to your Home Screen first: tap <strong className="text-ink">Share</strong>, then{' '}
          <strong className="text-ink">Add to Home Screen</strong>. Then open it from there and come back here.
        </p>
      </Card>
    )
  }

  if (status === 'denied') {
    return (
      <Card className="space-y-2">
        <p className="font-semibold">Reminders are blocked.</p>
        <p className="text-sm text-mute">
          Allow them in iPhone Settings → Notifications → Water for Laura, then reopen the app.
        </p>
        <button className="text-sm font-semibold text-mute underline" onClick={later}>
          Not now
        </button>
      </Card>
    )
  }

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-semibold">Want gentle reminders?</p>
        <p className="text-sm text-mute">A nudge every couple of hours during the day. You can change or turn them off any time.</p>
      </div>
      <div className="flex gap-3">
        <Button variant="primary" className="flex-1" disabled={busy} onClick={() => void enable()}>
          {busy ? 'Turning on…' : 'Turn on reminders'}
        </Button>
        <Button className="flex-1" disabled={busy} onClick={later}>
          Not now
        </Button>
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    </Card>
  )
}
