import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { DEFAULT_SETTINGS, type Entry, type Settings } from './types'
import { enqueue, flush, onQueueChange, pendingIds, pendingOps, runOp } from './queue'
import { addDays, dailyTotals, localDayKey, type DayKey } from './hydration'

interface Store {
  session: Session
  userId: string
  settings: Settings
  entries: Entry[]
  loading: boolean
  tz: string
  today: DayKey
  todayTotal: number
  totals: Map<DayKey, number>
  pendingCount: number
  syncError: string | null
  addEntry: (amountMl: number, consumedAt?: Date) => Promise<string>
  updateEntry: (id: string, patch: Partial<Pick<Entry, 'amount_ml' | 'consumed_at'>>) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  refresh: () => Promise<void>
  deleteAllEntries: () => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

const HISTORY_DAYS = 400

export function StoreProvider({ session, children }: { session: Session; children: ReactNode }) {
  const userId = session.user.id
  const [settings, setSettings] = useState<Settings>({ user_id: userId, ...DEFAULT_SETTINGS })
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(() => pendingOps().length)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const tz = settings.timezone || 'Europe/Dublin'

  // Keep "today" fresh if the app stays open past midnight.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const today = useMemo(() => localDayKey(now, tz), [now, tz])

  const markSynced = useCallback((id: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, pending: false } : e)))
  }, [])

  const flushQueue = useCallback(async () => {
    const result = await flush((op) => {
      if (op.kind === 'upsert') markSynced(op.entry.id)
    })
    setSyncError(result.error ?? null)
  }, [markSynced])

  const refresh = useCallback(async () => {
    const since = addDays(localDayKey(new Date(), tz), -HISTORY_DAYS)
    const [{ data: s, error: sErr }, { data: e, error: eErr }] = await Promise.all([
      supabase.from('settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('entries').select('*').eq('user_id', userId).gte('consumed_at', `${since}T00:00:00Z`).order('consumed_at', { ascending: false }),
    ])
    if (sErr || eErr) {
      setSyncError((sErr ?? eErr)?.message ?? 'Could not load')
      return
    }
    if (s) {
      setSettings(s as Settings)
    } else {
      // Row missing (user predates the trigger); create defaults.
      const row = { user_id: userId, ...DEFAULT_SETTINGS }
      await supabase.from('settings').upsert(row)
      setSettings(row)
    }
    // Merge: anything still pending locally overlays the server view.
    const pending = pendingIds()
    const queuedUpserts = pendingOps().flatMap((op) => (op.kind === 'upsert' ? [op.entry] : []))
    const queuedDeletes = new Set(pendingOps().flatMap((op) => (op.kind === 'delete' ? [op.id] : [])))
    const serverRows = ((e ?? []) as Entry[]).filter((r) => !queuedDeletes.has(r.id) && !pending.has(r.id))
    const merged = [...queuedUpserts.map((q) => ({ ...q, pending: true })), ...serverRows].sort((a, b) =>
      b.consumed_at.localeCompare(a.consumed_at),
    )
    setEntries(merged)
    setSyncError(null)
  }, [tz, userId])

  // Initial load, then sync on reconnect / foreground.
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    ;(async () => {
      await flushQueue()
      await refresh()
      setLoading(false)
    })()
  }, [flushQueue, refresh])

  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === 'visible') void flushQueue().then(refresh)
    }
    window.addEventListener('online', onWake)
    document.addEventListener('visibilitychange', onWake)
    const off = onQueueChange(() => setPendingCount(pendingOps().length))
    return () => {
      window.removeEventListener('online', onWake)
      document.removeEventListener('visibilitychange', onWake)
      off()
    }
  }, [flushQueue, refresh])

  const persist = useCallback(
    async (op: Parameters<typeof runOp>[0]) => {
      try {
        await runOp(op)
        if (op.kind === 'upsert') markSynced(op.entry.id)
        setSyncError(null)
      } catch (err) {
        enqueue(op)
        setSyncError(err instanceof Error ? err.message : 'Saved on this phone, will sync later')
      }
    },
    [markSynced],
  )

  const addEntry = useCallback(
    async (amountMl: number, consumedAt: Date = new Date()) => {
      const entry: Entry = {
        id: crypto.randomUUID(),
        user_id: userId,
        amount_ml: Math.round(amountMl),
        consumed_at: consumedAt.toISOString(),
        pending: true,
      }
      setEntries((prev) => [entry, ...prev].sort((a, b) => b.consumed_at.localeCompare(a.consumed_at)))
      void persist({ kind: 'upsert', entry })
      return entry.id
    },
    [persist, userId],
  )

  const updateEntry = useCallback(
    async (id: string, patch: Partial<Pick<Entry, 'amount_ml' | 'consumed_at'>>) => {
      let updated: Entry | undefined
      setEntries((prev) => {
        const next = prev.map((e) => {
          if (e.id !== id) return e
          updated = { ...e, ...patch, pending: true }
          return updated
        })
        return next.sort((a, b) => b.consumed_at.localeCompare(a.consumed_at))
      })
      // setState callbacks run synchronously in React 18+ for this pattern; guard anyway.
      const target = updated ?? entries.find((e) => e.id === id)
      if (target) await persist({ kind: 'upsert', entry: { ...target, ...patch } })
    },
    [entries, persist],
  )

  const deleteEntry = useCallback(
    async (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id))
      await persist({ kind: 'delete', id })
    },
    [persist],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch }
      setSettings(next)
      const { error } = await supabase.from('settings').update(patch).eq('user_id', userId)
      if (error) setSyncError(error.message)
    },
    [settings, userId],
  )

  const deleteAllEntries = useCallback(async () => {
    setEntries([])
    const { error } = await supabase.from('entries').delete().eq('user_id', userId)
    if (error) setSyncError(error.message)
  }, [userId])

  const totals = useMemo(() => dailyTotals(entries, tz), [entries, tz])
  const todayTotal = totals.get(today) ?? 0

  const value: Store = {
    session,
    userId,
    settings,
    entries,
    loading,
    tz,
    today,
    todayTotal,
    totals,
    pendingCount,
    syncError,
    addEntry,
    updateEntry,
    deleteEntry,
    updateSettings,
    refresh,
    deleteAllEntries,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
