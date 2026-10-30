/**
 * send-hydration-reminders
 *
 * Cron mode:  POST with header `x-cron-secret: <CRON_SECRET>` (from pg_cron).
 * Test mode:  POST ?test=1 with `Authorization: Bearer <user JWT>`; sends a
 *             test notification to the caller's own devices.
 *
 * Deploy with `--no-verify-jwt`; this function does its own auth checks.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { ApplicationServer, importVapidKeys, PushMessageError, Urgency, type ExportedVapidKeys } from 'jsr:@negrel/webpush@0.5.0'
import { dueSlot, localTime, pickMessage, shouldSend, summariseEntries } from './reminders.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@example.com'
const VAPID_KEYS = Deno.env.get('VAPID_KEYS') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://water.chrisquinn.ie/'

interface SettingsRow {
  user_id: string
  display_name: string
  daily_goal_ml: number
  timezone: string
  reminder_enabled: boolean
  reminder_start: string
  reminder_end: string
  reminder_interval_minutes: number
  suppression_minutes: number
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

let appServer: ApplicationServer | null = null
async function getAppServer(): Promise<ApplicationServer> {
  if (appServer) return appServer
  if (!VAPID_KEYS) throw new Error('VAPID_KEYS secret is not set')
  const exported = JSON.parse(VAPID_KEYS) as ExportedVapidKeys
  const vapidKeys = await importVapidKeys(exported, { extractable: false })
  appServer = await ApplicationServer.new({ contactInformation: VAPID_SUBJECT, vapidKeys })
  return appServer
}

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...extra },
  })
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PushResult {
  subscription_id: string
  status: 'accepted' | 'gone' | 'error'
  detail?: string
}

async function pushToAll(db: SupabaseClient, subs: SubscriptionRow[], payload: { title: string; body: string; url: string; tag: string }): Promise<PushResult[]> {
  const server = await getAppServer()
  const text = JSON.stringify(payload)
  const results: PushResult[] = []
  for (const s of subs) {
    try {
      const subscriber = server.subscribe({ endpoint: s.endpoint, keys: { auth: s.auth, p256dh: s.p256dh } })
      await subscriber.pushTextMessage(text, { ttl: 60 * 60, urgency: Urgency.Normal, topic: payload.tag })
      results.push({ subscription_id: s.id, status: 'accepted' })
      await db.from('push_subscriptions').update({ last_seen_at: new Date().toISOString() }).eq('id', s.id)
    } catch (err) {
      if (err instanceof PushMessageError && err.isGone()) {
        await db.from('push_subscriptions').update({ enabled: false }).eq('id', s.id)
        results.push({ subscription_id: s.id, status: 'gone', detail: `push service ${err.response.status}` })
      } else {
        const detail = err instanceof PushMessageError ? `push service ${err.response.status}` : String(err)
        results.push({ subscription_id: s.id, status: 'error', detail })
      }
    }
  }
  return results
}

async function activeSubscriptions(db: SupabaseClient, userId: string): Promise<SubscriptionRow[]> {
  const { data, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('enabled', true)
  if (error) throw error
  return (data ?? []) as SubscriptionRow[]
}

async function runCron(now: Date) {
  const db = admin()
  const { data: rows, error } = await db
    .from('settings')
    .select('user_id, display_name, daily_goal_ml, timezone, reminder_enabled, reminder_start, reminder_end, reminder_interval_minutes, suppression_minutes')
    .eq('reminder_enabled', true)
  if (error) throw error

  const report: Record<string, unknown>[] = []
  for (const s of (rows ?? []) as SettingsRow[]) {
    const local = localTime(now, s.timezone)
    const slot = dueSlot(local, s.reminder_start, s.reminder_end, s.reminder_interval_minutes)
    if (!slot) {
      report.push({ user: s.user_id, skipped: 'no_slot_due' })
      continue
    }

    const { data: claimed, error: claimErr } = await db.rpc('claim_reminder_slot', { p_user_id: s.user_id, p_slot: slot })
    if (claimErr) throw claimErr
    if (!claimed) {
      report.push({ user: s.user_id, slot, skipped: 'already_sent' })
      continue
    }

    const since = new Date(now.getTime() - 36 * 3600 * 1000).toISOString()
    const { data: entries, error: entErr } = await db
      .from('entries')
      .select('amount_ml, consumed_at')
      .eq('user_id', s.user_id)
      .gte('consumed_at', since)
    if (entErr) throw entErr

    const { todayTotal, lastEntryAt } = summariseEntries(entries ?? [], s.timezone, local.date)
    const decision = shouldSend({ todayTotal, goal: s.daily_goal_ml, lastEntryAt, now, suppressionMinutes: s.suppression_minutes })
    if (!decision.send) {
      report.push({ user: s.user_id, slot, skipped: decision.reason, todayTotal })
      continue
    }

    const subs = await activeSubscriptions(db, s.user_id)
    if (subs.length === 0) {
      report.push({ user: s.user_id, slot, skipped: 'no_subscriptions' })
      continue
    }

    const results = await pushToAll(db, subs, {
      title: 'Water 💧',
      body: pickMessage(s.display_name || 'Laura', slot),
      url: `${APP_URL}#log`,
      tag: `reminder-${slot.replace(/[^0-9]/g, '')}`,
    })
    report.push({ user: s.user_id, slot, sent: results })
  }
  return report
}

async function runTest(jwt: string) {
  const db = admin()
  const { data: userData, error } = await db.auth.getUser(jwt)
  if (error || !userData.user) return json({ error: 'invalid token' }, 401)
  const userId = userData.user.id

  const subs = await activeSubscriptions(db, userId)
  if (subs.length === 0) return json({ results: [], note: 'no active subscriptions for this user' })

  const results = await pushToAll(db, subs, {
    title: 'Water 💧',
    body: 'Test notification. If you can read this, reminders will reach this device.',
    url: `${APP_URL}#log`,
    tag: 'test',
  })
  return json({ results })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const url = new URL(req.url)
  const cronHeader = req.headers.get('x-cron-secret')

  try {
    if (cronHeader && CRON_SECRET && cronHeader === CRON_SECRET) {
      const report = await runCron(new Date())
      return json({ ok: true, report })
    }

    const auth = req.headers.get('authorization') ?? ''
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (url.searchParams.get('test') === '1' && jwt) {
      return await runTest(jwt)
    }

    return json({ error: 'unauthorised' }, 401)
  } catch (err) {
    console.error(err)
    return json({ error: String(err) }, 500)
  }
})
