import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { StoreProvider, useStore } from '@/lib/store'
import SignIn from '@/features/auth/SignIn'
import TodayScreen from '@/features/today/TodayScreen'
import HistoryScreen from '@/features/history/HistoryScreen'
import SettingsScreen from '@/features/settings/SettingsScreen'
import { Spinner } from '@/components/ui'

type Tab = 'today' | 'history' | 'settings'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (!session) return <SignIn />

  return (
    <StoreProvider session={session}>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const [tab, setTab] = useState<Tab>('today')
  const { pendingCount, syncError } = useStore()

  // A notification tap lands on Today.
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#log') setTab('today')
    }
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <main className="safe-top flex-1 px-5 pb-28">
        {tab === 'today' && <TodayScreen />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      {(pendingCount > 0 || syncError) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-5">
          <div className="rounded-full bg-lavender px-4 py-1.5 text-xs font-semibold text-ink shadow-soft">
            {pendingCount > 0 ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync` : 'Sync problem — will retry'}
          </div>
        </div>
      )}

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ink/5 bg-white/90 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 px-2 pt-2">
          {(
            [
              ['today', 'Today', '💧'],
              ['history', 'History', '📅'],
              ['settings', 'Settings', '⚙️'],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-xs font-semibold ${tab === key ? 'text-aqua-deep' : 'text-mute'}`}
              aria-current={tab === key ? 'page' : undefined}
            >
              <span className={`text-xl transition-transform ${tab === key ? 'scale-110' : ''}`}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
