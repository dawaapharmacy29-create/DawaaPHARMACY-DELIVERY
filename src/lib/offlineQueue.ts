import { supabase } from './supabase'

export type OfflineMutation = {
  id: string
  created_at: string
  table: string
  action: 'insert' | 'update'
  payload: any
  match?: Record<string, any>
  label?: string
  attempts: number
  next_retry_at?: string
  last_error?: string
  dead?: boolean
}

const KEY = 'dawaa_offline_queue_v2'
const MAX_ATTEMPTS = 5

// Errors that will never succeed on retry — skip them immediately
const PERMANENT_ERROR_PATTERNS = [
  'violates row-level security',
  'duplicate key value',
  'violates foreign key',
  'violates not-null',
  'invalid input syntax',
  'permission denied',
]

function isPermanentError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return PERMANENT_ERROR_PATTERNS.some(p => lower.includes(p))
}

function backoffMs(attempts: number): number {
  // Exponential backoff: 5s, 15s, 45s, 2min, 5min
  return Math.min(5_000 * Math.pow(3, attempts), 5 * 60_000)
}

function uuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

export function getOfflineQueue(): OfflineMutation[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

function saveQueue(rows: OfflineMutation[]) {
  localStorage.setItem(KEY, JSON.stringify(rows))
  window.dispatchEvent(new CustomEvent('dawaa-offline-queue-change', { detail: rows.length }))
}

export function offlineQueueCount(): number {
  return getOfflineQueue().filter(r => !r.dead).length
}

export function offlineQueueDeadCount(): number {
  return getOfflineQueue().filter(r => r.dead).length
}

export function enqueueOfflineMutation(
  input: Omit<OfflineMutation, 'id' | 'created_at' | 'attempts' | 'dead'>
): OfflineMutation {
  const item: OfflineMutation = {
    ...input,
    id: `offline-${uuid()}`,
    created_at: new Date().toISOString(),
    attempts: 0,
  }
  const rows = getOfflineQueue()
  rows.push(item)
  saveQueue(rows)
  return item
}

export function clearDeadItems(): void {
  const rows = getOfflineQueue().filter(r => !r.dead)
  saveQueue(rows)
}

async function runMutation(item: OfflineMutation): Promise<void> {
  if (item.action === 'insert') {
    const { error } = await supabase.from(item.table).insert(item.payload)
    if (error) throw error
    return
  }
  if (item.action === 'update') {
    let query = supabase.from(item.table).update(item.payload)
    for (const [key, value] of Object.entries(item.match || {})) {
      query = query.eq(key, value)
    }
    const { error } = await query
    if (error) throw error
    return
  }
  throw new Error(`Unsupported offline action: ${(item as any).action}`)
}

async function logSyncResult(item: OfflineMutation, status: 'synced' | 'dead', errorMsg?: string) {
  try {
    await supabase.from('offline_sync_logs').insert({
      queue_id: item.id,
      table_name: item.table,
      action: item.action,
      label: item.label ?? null,
      payload_json: item.payload ?? {},
      status,
      error_message: errorMsg ?? null,
      synced_at: new Date().toISOString(),
    })
  } catch {
    // logging failure must never break the queue flush
  }
}

export async function flushOfflineQueue(): Promise<{ synced: number; remaining: number; dead: number }> {
  if (!navigator.onLine) {
    const q = getOfflineQueue()
    return { synced: 0, remaining: q.filter(r => !r.dead).length, dead: q.filter(r => r.dead).length }
  }

  const rows = getOfflineQueue()
  if (!rows.length) return { synced: 0, remaining: 0, dead: 0 }

  const now = Date.now()
  const next: OfflineMutation[] = []
  let synced = 0
  let dead = 0

  for (const item of rows) {
    // Skip items not yet due for retry
    if (item.next_retry_at && new Date(item.next_retry_at).getTime() > now) {
      next.push(item)
      continue
    }

    // Skip already-dead items
    if (item.dead) {
      next.push(item)
      dead++
      continue
    }

    try {
      await runMutation(item)
      synced++
      void logSyncResult(item, 'synced')
    } catch (error: any) {
      const msg = error?.message || String(error)
      const newAttempts = (item.attempts ?? 0) + 1
      const isDead = newAttempts >= MAX_ATTEMPTS || isPermanentError(msg)

      if (isDead) {
        dead++
        void logSyncResult(item, 'dead', msg)
        next.push({ ...item, attempts: newAttempts, last_error: msg, dead: true })
      } else {
        const retryAt = new Date(now + backoffMs(newAttempts)).toISOString()
        next.push({ ...item, attempts: newAttempts, last_error: msg, next_retry_at: retryAt })
      }
    }
  }

  saveQueue(next)
  const remaining = next.filter(r => !r.dead).length
  return { synced, remaining, dead }
}

export function setupOfflineQueueAutoFlush(
  onSynced?: (synced: number, remaining: number, dead: number) => void
): () => void {
  let running = false

  const run = async () => {
    if (running || !navigator.onLine) return
    running = true
    try {
      const res = await flushOfflineQueue()
      if (res.synced > 0 || res.dead > 0) {
        onSynced?.(res.synced, res.remaining, res.dead)
      }
    } finally {
      running = false
    }
  }

  window.addEventListener('online', run)
  // Retry every 30s while the tab is open
  const interval = window.setInterval(run, 30_000)
  void run()

  return () => {
    window.removeEventListener('online', run)
    window.clearInterval(interval)
  }
}
