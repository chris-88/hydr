import { useState, type FormEvent } from 'react'
import { supabase, configured } from '@/lib/supabase'
import { Button, Card } from '@/components/ui'

type Stage = 'email' | 'code'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<Stage>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + '/' },
    })
    setBusy(false)
    if (error) {
      setError(error.message.includes('Signups not allowed') ? 'That email is not on the guest list.' : error.message)
      return
    }
    setStage('code')
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError('That code did not work. Check the newest email and try again.')
  }

  return (
    <main className="safe-top mx-auto flex min-h-full max-w-md flex-col justify-center px-6 pb-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-powder text-4xl shadow-soft">💧</div>
        <h1 className="text-3xl font-bold">Water for Laura</h1>
        <p className="mt-2 text-mute">A gentle nudge to stay hydrated.</p>
      </div>

      {!configured && (
        <Card className="mb-4 border border-rose-200 bg-rose-50 text-sm text-rose-900">
          Supabase is not configured for this build. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
        </Card>
      )}

      <Card>
        {stage === 'email' ? (
          <form onSubmit={sendCode} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-mute">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-ink/10 bg-cream px-4 py-3 text-lg outline-none focus:border-aqua-deep"
                placeholder="you@example.com"
              />
            </label>
            <Button type="submit" variant="primary" className="w-full" disabled={busy || !email}>
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-mute">
              We sent a code to <strong className="text-ink">{email}</strong>. Type it below, or tap the link in the email if you are in Safari.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-cream px-4 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-aqua-deep"
              placeholder="123456"
              autoFocus
            />
            <Button type="submit" variant="primary" className="w-full" disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </Button>
            <button type="button" className="w-full py-2 text-sm text-mute" onClick={() => setStage('email')}>
              Use a different email
            </button>
          </form>
        )}
        {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </Card>
    </main>
  )
}
