import { useState } from 'react'
import type { Entry } from '@/lib/types'
import { useStore } from '@/lib/store'
import { Button, Sheet } from '@/components/ui'

function timeOf(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-IE', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

function toLocalInput(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

export default function EntryList({ entries }: { entries: Entry[] }) {
  const { tz, updateEntry, deleteEntry } = useStore()
  const [editing, setEditing] = useState<Entry | null>(null)
  const [amount, setAmount] = useState('')
  const [when, setWhen] = useState('')

  function open(e: Entry) {
    setEditing(e)
    setAmount(String(e.amount_ml))
    setWhen(toLocalInput(e.consumed_at, tz))
  }

  async function save() {
    if (!editing) return
    const patch: Partial<Pick<Entry, 'amount_ml' | 'consumed_at'>> = {}
    const ml = Number(amount)
    if (ml > 0 && ml !== editing.amount_ml) patch.amount_ml = Math.round(ml)
    if (when && when !== toLocalInput(editing.consumed_at, tz)) {
      // datetime-local is interpreted in the device zone, which matches tz for Laura.
      patch.consumed_at = new Date(when).toISOString()
    }
    if (Object.keys(patch).length) await updateEntry(editing.id, patch)
    setEditing(null)
  }

  return (
    <>
      <ul className="divide-y divide-ink/5 overflow-hidden rounded-xl2 bg-white shadow-soft">
        {entries.map((e) => (
          <li key={e.id}>
            <button onClick={() => open(e)} className="flex w-full items-center justify-between px-5 py-3 text-left active:bg-cream">
              <div className="flex items-center gap-3">
                <span className="text-xl">💧</span>
                <div>
                  <div className="font-semibold">{e.amount_ml} ml</div>
                  <div className="text-xs text-mute">{timeOf(e.consumed_at, tz)}</div>
                </div>
              </div>
              {e.pending ? <span className="rounded-full bg-lavender px-2 py-0.5 text-[10px] font-semibold">syncing</span> : <span className="text-mute">›</span>}
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Edit entry">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-mute">Amount (ml)</span>
            <input type="number" inputMode="numeric" min={10} max={5000} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-xl outline-none focus:border-aqua-deep" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-mute">When</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-aqua-deep" />
          </label>
          <div className="flex gap-3">
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => {
                if (editing) await deleteEntry(editing.id)
                setEditing(null)
              }}
            >
              Delete
            </Button>
            <Button variant="primary" className="flex-1" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
