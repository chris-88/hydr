import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'soft' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-aqua-deep text-white shadow-soft active:bg-aqua',
  soft: 'bg-white text-ink shadow-soft active:bg-powder/40',
  ghost: 'bg-transparent text-ink active:bg-ink/5',
  danger: 'bg-blush text-rose-900 active:bg-rose-200',
}

export function Button({
  variant = 'soft',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold transition-transform active:scale-[0.97] disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl2 bg-white p-5 shadow-soft ${className}`}>{children}</section>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-mute">{children}</h2>
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-aqua-deep' : 'bg-ink/15'}`}
    >
      <span
        className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : ''}`}
      />
    </button>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="safe-bottom w-full max-w-md rounded-t-3xl bg-cream p-5 shadow-soft animate-toast"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink/15" />
        <h3 className="mb-4 text-xl font-bold">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function Spinner() {
  return <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-aqua-deep border-t-transparent" aria-label="Loading" />
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-cream px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-mute">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-mute">{hint}</div>}
    </div>
  )
}
