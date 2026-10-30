/**
 * Pending-write queue. Entries carry client-generated UUIDs, so replaying an
 * upsert after a flaky write never duplicates a row.
 */
import { supabase } from './supabase'
import type { Entry } from './types'

export type QueuedOp = { kind: 'upsert'; entry: Entry } | { kind: 'delete'; id: string }

const KEY = 'water.queue.v1'
const listeners = new Set<() => void>()

function read(): QueuedOp[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as QueuedOp[]) : []
  } catch {
    return []
  }
}

function write(ops: QueuedOp[]) {
  localStorage.setItem(KEY, JSON.stringify(ops))
  listeners.forEach((l) => l())
}

export function pendingOps(): QueuedOp[] {
  return read()
}

export function pendingIds(): Set<string> {
  return new Set(read().filter((o): o is Extract<QueuedOp, { kind: 'upsert' }> => o.kind === 'upsert').map((o) => o.entry.id))
}

export function onQueueChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function enqueue(op: QueuedOp) {
  const id = op.kind === 'upsert' ? op.entry.id : op.id
  // A newer op for the same id supersedes older ones.
  const ops = read().filter((o) => (o.kind === 'upsert' ? o.entry.id : o.id) !== id)
  ops.push(op)
  write(ops)
}

export async function runOp(op: QueuedOp): Promise<void> {
  if (op.kind === 'upsert') {
    const { pending: _pending, ...row } = op.entry
    const { error } = await supabase.from('entries').upsert(row, { onConflict: 'id' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('entries').delete().eq('id', op.id)
    if (error) throw error
  }
}

let flushing = false

/** Replay queued ops in order. Stops at the first failure to keep ordering. */
export async function flush(onDone?: (op: QueuedOp) => void): Promise<{ done: number; remaining: number; error?: string }> {
  if (flushing) return { done: 0, remaining: read().length }
  flushing = true
  let done = 0
  let error: string | undefined
  try {
    for (;;) {
      const ops = read()
      const op = ops[0]
      if (!op) break
      try {
        await runOp(op)
        write(ops.slice(1))
        onDone?.(op)
        done++
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
        break
      }
    }
  } finally {
    flushing = false
  }
  return { done, remaining: read().length, error }
}
