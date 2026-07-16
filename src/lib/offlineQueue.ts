import { supabase } from './supabase'
import { backoffDelayMs } from './helpers'

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

function getStoredRiderToken(): string | null {
  try {
    const raw = localStorage.getItem('dawaa_rider_session')
    return raw ? JSON.parse(raw)?.session_token || null : null
  } catch {
    return null
  }
}

function getRpcResult<T = any>(data: any): T | null {
  return Array.isArray(data) ? (data[0] as T) : (data as T | null)
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
  const rows = getOfflineQueue()
  const requestId = input.payload?.client_request_id || input.payload?.clientRequestId
  if (input.table === 'internal_trips' && input.action === 'insert' && requestId) {
    const existingIndex = rows.findIndex(row =>
      row.table === 'internal_trips' &&
      row.action === 'insert' &&
      (row.payload?.client_request_id || row.payload?.clientRequestId) === requestId,
    )
    if (existingIndex >= 0) {
      rows[existingIndex] = {
        ...rows[existingIndex],
        ...input,
        payload: { ...rows[existingIndex].payload, ...input.payload },
      }
      setOfflineQueue(rows)
      return rows[existingIndex]
    }
  }

  const item: OfflineMutation = {
    ...input,
    id: `offline-${uuid()}`,
    created_at: new Date().toISOString(),
    attempts: 0,
  }
  rows.push(item)
  setOfflineQueue(rows)
  return item
}

async function runMutation(item: OfflineMutation) {
  if (item.action === 'insert') {
    if (item.table === 'internal_trips') {
      const clientRequestId = item.payload?.client_request_id || item.payload?.clientRequestId
      if (!clientRequestId) throw new Error('client_request_id is required for offline trips')
      const token = item.payload?.session_token || getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة، سجل الدخول مرة أخرى لاستكمال رفع إثبات المشوار.')

      const { data: rpcData, error: rpcError } = await supabase.rpc('rider_create_trip_idempotent', {
        p_token: token,
        p_payload: item.payload,
      })
      const result = getRpcResult<any>(rpcData)
      if (rpcError || !result?.success) throw new Error(rpcError?.message || result?.message || 'تعذر مزامنة المشوار')
      const trip = result.trip
      if (!trip?.id) throw new Error('trip_missing_after_sync')
      const { data: verified, error: verifyError } = await supabase
        .from('internal_trips')
        .select('*')
        .eq('client_request_id', clientRequestId)
        .maybeSingle()
      if (verifyError || !verified?.id) throw verifyError || new Error('trip_verification_failed')
      return verified
    }

    try {
      const { data, error } = await supabase.from(item.table).insert(item.payload).select('*').single()
      if (error) throw error
      return data
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase()
      const isDuplicate = msg.includes('duplicate') || msg.includes('unique constraint') || String(err?.code || '') === '23505'
      const clientRequestId = item.payload?.client_request_id || item.payload?.clientRequestId
      if (isDuplicate && clientRequestId) {
        try {
          const { data: existing } = await supabase.from(item.table).select('*').eq('client_request_id', clientRequestId).maybeSingle()
          if (existing) return existing
        } catch {}
      }
      throw err
    }
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
      const attempts = (item.attempts || 0) + 1
      if (attempts > 1) await new Promise(resolve => setTimeout(resolve, backoffDelayMs(attempts - 2)))
      remaining.push({
        ...item,
        attempts,
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
