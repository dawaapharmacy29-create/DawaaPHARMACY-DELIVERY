import { supabase } from './supabase'

export type OfflineMutation = {
  id: string
  created_at: string
  table: string
  action: 'insert' | 'update'
  payload: any
  match?: Record<string, any>
  label?: string
  attempts?: number
  last_error?: string
}

const KEY = 'dawaa_offline_queue_v1'

function uuid() {
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

export function setOfflineQueue(rows: OfflineMutation[]) {
  localStorage.setItem(KEY, JSON.stringify(rows))
  window.dispatchEvent(new CustomEvent('dawaa-offline-queue-change', { detail: rows.length }))
}

export function offlineQueueCount() {
  return getOfflineQueue().length
}

export function enqueueOfflineMutation(input: Omit<OfflineMutation, 'id' | 'created_at' | 'attempts'>) {
  const item: OfflineMutation = {
    ...input,
    id: `offline-${uuid()}`,
    created_at: new Date().toISOString(),
    attempts: 0,
  }
  const rows = getOfflineQueue()
  rows.push(item)
  setOfflineQueue(rows)
  return item
}

async function runMutation(item: OfflineMutation) {
  if (item.action === 'insert') {
    const { data, error } = await supabase.from(item.table).insert(item.payload).select('*').single()
    if (error) throw error
    return data
  }

  if (item.action === 'update') {
    let query = supabase.from(item.table).update(item.payload)
    Object.entries(item.match || {}).forEach(([key, value]) => {
      query = query.eq(key, value)
    })
    const { data, error } = await query.select('*').single()
    if (error) throw error
    return data
  }

  throw new Error('Unsupported offline mutation')
}

export async function flushOfflineQueue() {
  if (!navigator.onLine) return { synced: 0, remaining: getOfflineQueue().length }
  const rows = getOfflineQueue()
  if (!rows.length) return { synced: 0, remaining: 0 }

  const remaining: OfflineMutation[] = []
  let synced = 0

  for (const item of rows) {
    try {
      await runMutation(item)
      synced++
      try {
        await supabase.from('offline_sync_logs').insert({
          queue_id: item.id,
          table_name: item.table,
          action: item.action,
          label: item.label || null,
          payload_json: item.payload || {},
          status: 'synced',
          synced_at: new Date().toISOString(),
        })
      } catch {}
    } catch (error: any) {
      remaining.push({
        ...item,
        attempts: (item.attempts || 0) + 1,
        last_error: error?.message || String(error),
      })
    }
  }

  setOfflineQueue(remaining)
  return { synced, remaining: remaining.length }
}

export function setupOfflineQueueAutoFlush(onSynced?: (synced: number, remaining: number) => void) {
  let running = false

  const run = async () => {
    if (running || !navigator.onLine) return
    running = true
    try {
      const res = await flushOfflineQueue()
      if (res.synced > 0) onSynced?.(res.synced, res.remaining)
    } finally {
      running = false
    }
  }

  window.addEventListener('online', run)
  const interval = window.setInterval(run, 30000)
  void run()

  return () => {
    window.removeEventListener('online', run)
    window.clearInterval(interval)
  }
}
