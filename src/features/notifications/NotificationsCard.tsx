import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { disablePush, enablePush, getPushStatus, isIos, repairPush, sendTestNotification, type PushStatus, type TestResult } from '@/lib/push'
import { Button, Card, SectionTitle } from '@/components/ui'

const LABELS: Record<PushStatus, { text: string; tone: string }> = {
  active: { text: 'Notifications active', tone: 'bg-aqua/30 text-aqua-deep' },
  'permission-required': { text: 'Permission required', tone: 'bg-lavender text-ink' },
  denied: { text: 'Blocked in iPhone Settings', tone: 'bg-blush text-rose-900' },
  disabled: { text: 'Notifications disabled', tone: 'bg-ink/5 text-mute' },
  unsupported: { text: 'Device unsupported', tone: 'bg-ink/5 text-mute' },
  'needs-install': { text: 'Install first', tone: 'bg-lavender text-ink' },
  'needs-repair': { text: 'Subscription needs repair', tone: 'bg-blush text-rose-900' },
}

export default function NotificationsCard() {
  const { userId, settings, updateSettings } = useStore()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<{ results: TestResult[]; note?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    getPushStatus(userId).then(setStatus).catch(() => setStatus('unsupported'))
  }, [userId])

  useEffect(() => {
    refresh()
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refresh])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const label = status ? LABELS[status] : null

  return (
    <section>
      <SectionTitle>Reminders on this device</SectionTitle>
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Status</span>
          {label && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${label.tone}`}>{label.text}</span>}
        </div>

        {status === 'needs-install' && (
          <ol className="list-decimal space-y-2 pl-5 text-sm text-mute">
            <li>
              Tap the <strong className="text-ink">Share</strong> button in Safari (the square with an arrow).
            </li>
            <li>
              Choose <strong className="text-ink">Add to Home Screen</strong>, then <strong className="text-ink">Add</strong>.
            </li>
            <li>Open <strong className="text-ink">Water</strong> from your Home Screen and come back here.</li>
          </ol>
        )}

        {status === 'unsupported' && (
          <p className="text-sm text-mute">
            This browser cannot receive push notifications. {isIos() ? 'On iPhone you need iOS 16.4 or newer and the app installed on the Home Screen.' : 'Try Chrome, Edge, Firefox or Safari 16+.'}
          </p>
        )}

        {status === 'denied' && (
          <p className="text-sm text-mute">
            Notifications were blocked. On iPhone open <strong className="text-ink">Settings → Notifications → Water</strong> and allow them, then reopen the app.
          </p>
        )}

        {(status === 'permission-required' || status === 'disabled') && (
          <Button variant="primary" className="w-full" disabled={busy} onClick={() => run(() => enablePush(userId))}>
            {busy ? 'Enabling…' : 'Enable reminders on this device'}
          </Button>
        )}

        {status === 'needs-repair' && (
          <Button variant="primary" className="w-full" disabled={busy} onClick={() => run(() => repairPush(userId))}>
            {busy ? 'Repairing…' : 'Repair subscription'}
          </Button>
        )}

        {status === 'active' && (
          <div className="space-y-3">
            <Button className="w-full" disabled={busy} onClick={() => run(async () => setTest(await sendTestNotification()))}>
              {busy ? 'Sending…' : 'Send test notification'}
            </Button>
            {test && (
              <div className="rounded-2xl bg-cream px-4 py-3 text-sm">
                {test.results.length === 0 && <p className="text-mute">{test.note ?? 'No devices registered.'}</p>}
                {test.results.map((r) => (
                  <p key={r.subscription_id} className={r.status === 'accepted' ? 'text-aqua-deep' : 'text-rose-800'}>
                    {r.status === 'accepted'
                      ? 'The push service accepted it. It should appear on this device within a few seconds.'
                      : `Could not send: ${r.detail ?? r.status}`}
                  </p>
                ))}
              </div>
            )}
            <button
              className="w-full py-2 text-sm font-semibold text-rose-800"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await disablePush(userId)
                  await updateSettings({ reminder_enabled: false })
                })
              }
            >
              Turn off on this device
            </button>
          </div>
        )}

        {status === 'active' && !settings.reminder_enabled && (
          <p className="rounded-2xl bg-lavender/50 px-4 py-2 text-xs">This device is registered, but the reminder schedule below is switched off.</p>
        )}

        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </Card>
    </section>
  )
}
