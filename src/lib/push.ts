import { supabase, SUPABASE_URL, VAPID_PUBLIC_KEY } from './supabase'

export type PushStatus =
  | 'unsupported'
  | 'needs-install'
  | 'permission-required'
  | 'denied'
  | 'active'
  | 'disabled'
  | 'needs-repair'

export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

function deviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Browser'
}

async function saveSubscription(userId: string, sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const keys = json.keys ?? {}
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: keys.p256dh ?? '',
      auth: keys.auth ?? '',
      device_name: deviceName(),
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

/** Determine what to show Laura. */
export async function getPushStatus(userId: string): Promise<PushStatus> {
  if (!pushSupported()) {
    // iOS Safari outside the Home Screen app has no PushManager at all.
    return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  if (isIos() && !isStandalone()) return 'needs-install'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'permission-required'

  const sub = await currentSubscription()
  if (!sub) return 'disabled'

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('enabled')
    .eq('user_id', userId)
    .eq('endpoint', sub.endpoint)
    .maybeSingle()
  if (error) return 'needs-repair'
  if (!data) return 'needs-repair'
  return data.enabled ? 'active' : 'disabled'
}

/** Must be called from a user gesture. */
export async function enablePush(userId: string): Promise<PushStatus> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (!VAPID_PUBLIC_KEY) throw new Error('VAPID public key is not configured')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'permission-required'

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  await saveSubscription(userId, sub)
  await supabase.from('settings').update({ reminder_enabled: true }).eq('user_id', userId)
  return 'active'
}

/** Re-save the browser's subscription if the database lost it. */
export async function repairPush(userId: string): Promise<PushStatus> {
  return enablePush(userId)
}

export async function disablePush(userId: string): Promise<void> {
  const sub = await currentSubscription().catch(() => null)
  if (sub) {
    await supabase.from('push_subscriptions').update({ enabled: false }).eq('user_id', userId).eq('endpoint', sub.endpoint)
    await sub.unsubscribe().catch(() => undefined)
  } else {
    await supabase.from('push_subscriptions').update({ enabled: false }).eq('user_id', userId)
  }
}

export interface TestResult {
  subscription_id: string
  status: 'accepted' | 'gone' | 'error'
  detail?: string
}

export async function sendTestNotification(): Promise<{ results: TestResult[]; note?: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-hydration-reminders?test=1`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const body = (await res.json().catch(() => ({}))) as { results?: TestResult[]; note?: string; error?: string }
  if (!res.ok) throw new Error(body.error ?? `Server answered ${res.status}`)
  return { results: body.results ?? [], note: body.note }
}
