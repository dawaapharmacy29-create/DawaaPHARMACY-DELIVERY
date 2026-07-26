import { useEffect, useRef } from 'react'
import Reconciliation from './Reconciliation'
import { supabase } from '../../lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BULK_WRITE_TABLES = new Set(['monthly_system_invoices', 'monthly_invoice_reconciliation_results'])
const RETRYABLE_MESSAGE = /(timeout|network|fetch|connection|statement timeout|انتهى|شبكة)/i
const INLINE_ACTION_LABELS = [
  'اعتماد يدوي',
  'استبعاد',
  'حذف مع حفظ البيان',
  'استعادة',
  'تحويل لمندوب',
  'حفظ التعديل',
  'تعديل البيانات',
]

type BulkWriteMode = 'insert' | 'upsert'

function findBatchId(value: unknown): string | null {
  if (typeof value === 'string') return UUID_RE.test(value) ? value : null
  if (!value || typeof value !== 'object') return null

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBatchId(item)
      if (found) return found
    }
    return null
  }

  const row = value as Record<string, unknown>
  for (const key of ['batch_id', 'id', 'save_monthly_invoice_import_batch']) {
    const direct = row[key]
    if (typeof direct === 'string' && UUID_RE.test(direct)) return direct
  }

  return null
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function messageOf(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  const value = error as Record<string, unknown>
  return String(value.message || value.details || value.hint || '')
}

async function withRetry<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result: any = await run()
      if (result?.error) {
        const text = messageOf(result.error)
        if (!RETRYABLE_MESSAGE.test(text) || attempt === attempts - 1) return result
        lastError = result.error
      } else {
        return result
      }
    } catch (error) {
      lastError = error
      if (!RETRYABLE_MESSAGE.test(messageOf(error)) || attempt === attempts - 1) throw error
    }
    await sleep(700 * Math.pow(2, attempt))
  }
  throw lastError
}

function createGate(maxConcurrent: number) {
  let active = 0
  const waiting: Array<() => void> = []

  const acquire = () => new Promise<void>(resolve => {
    const start = () => {
      active += 1
      resolve()
    }
    if (active < maxConcurrent) start()
    else waiting.push(start)
  })

  const release = () => {
    active = Math.max(0, active - 1)
    waiting.shift()?.()
  }

  return async <T,>(task: () => Promise<T>) => {
    await acquire()
    try {
      return await task()
    } finally {
      release()
    }
  }
}

const runLimited = createGate(4)

function wrapBuilder(builder: any): any {
  return new Proxy(builder, {
    get(target, property, receiver) {
      if (property === 'then') {
        return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
          runLimited(() => withRetry(() => Promise.resolve(target), 4)).then(resolve, reject)
        }
      }

      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const next = value.apply(target, args)
        return next && typeof next === 'object' ? wrapBuilder(next) : next
      }
    },
  })
}

function chunkSizeFor(tableName: string, mode: BulkWriteMode) {
  if (tableName === 'monthly_system_invoices') return mode === 'upsert' ? 25 : 40
  return 40
}

async function writeChunk(tableName: string, mode: BulkWriteMode, rows: unknown[], options?: unknown): Promise<any> {
  const table = (supabase as any).__reconciliationOriginalFrom(tableName)
  const run = () => Promise.resolve(mode === 'upsert' ? table.upsert(rows, options) : table.insert(rows, options))
  const result: any = await withRetry(run, 4)

  if (!result?.error) return result
  const retryable = RETRYABLE_MESSAGE.test(messageOf(result.error))
  if (!retryable || rows.length === 1) return result

  const middle = Math.ceil(rows.length / 2)
  const left = await writeChunk(tableName, mode, rows.slice(0, middle), options)
  if (left?.error) return left
  const right = await writeChunk(tableName, mode, rows.slice(middle), options)
  if (right?.error) return right

  return {
    data: null,
    error: null,
    count: Number(left?.count || rows.slice(0, middle).length) + Number(right?.count || rows.slice(middle).length),
    status: 201,
    statusText: mode === 'upsert' ? 'Upserted' : 'Created',
  }
}

async function writeInChunks(tableName: string, mode: BulkWriteMode, rows: unknown[], options?: unknown) {
  const chunkSize = chunkSizeFor(tableName, mode)
  let written = 0

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const result = await writeChunk(tableName, mode, chunk, options)
    if (result?.error) return result
    written += chunk.length
  }

  return {
    data: null,
    error: null,
    count: written,
    status: 201,
    statusText: mode === 'upsert' ? 'Upserted' : 'Created',
  }
}

const client = supabase as any
if (!client.__reconciliationNetworkPatched) {
  const originalRpc = client.rpc.bind(client)
  const originalFrom = client.from.bind(client)
  client.__reconciliationOriginalFrom = originalFrom

  client.rpc = async (functionName: string, args?: unknown, options?: unknown) => {
    const result: any = await withRetry(() => originalRpc(functionName, args, options), 4)
    if (functionName !== 'save_monthly_invoice_import_batch' || result?.error) return result

    const batchId = findBatchId(result?.data)
    if (batchId) return { ...result, data: batchId }

    return {
      ...result,
      data: null,
      error: {
        code: 'INVALID_BATCH_ID',
        message: 'تعذر تحديد رقم دفعة المطابقة الصحيح بعد حفظ الملف',
        details: 'تم رفض أي UUID غير موجود صراحة في batch_id أو id حتى لا يتم ربط الفواتير بدفعة خاطئة.',
        hint: 'راجع القيمة المرجعة من الدالة save_monthly_invoice_import_batch في Supabase.',
      },
    }
  }

  client.from = (tableName: string) => {
    const query = originalFrom(tableName)
    return new Proxy(query, {
      get(target, property, receiver) {
        if ((property === 'insert' || property === 'upsert') && BULK_WRITE_TABLES.has(tableName)) {
          return (values: unknown, options?: unknown) => {
            if (Array.isArray(values) && values.length > chunkSizeFor(tableName, property as BulkWriteMode)) {
              return writeInChunks(tableName, property as BulkWriteMode, values, options)
            }
            const builder = property === 'upsert' ? (target as any).upsert(values, options) : (target as any).insert(values, options)
            return wrapBuilder(builder)
          }
        }

        if (property === 'update' && tableName === 'delivery_orders') {
          return (...args: unknown[]) => wrapBuilder((target as any).update(...args))
        }

        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  client.__reconciliationNetworkPatched = true
}

function isInlineAction(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const button = target.closest('button')
  if (!button) return false
  const label = (button.textContent || '').replace(/\s+/g, ' ').trim()
  return INLINE_ACTION_LABELS.some(action => label.includes(action))
}

export default function ReconciliationSafe() {
  const rootRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupRef.current?.(), [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const keepViewStable = (event: Event) => {
      if (!isInlineAction(event.target)) return
      if (root.dataset.actionBusy === 'true') return

      cleanupRef.current?.()
      root.dataset.actionBusy = 'true'

      const scrollY = window.scrollY
      const minHeight = Math.max(root.scrollHeight, root.getBoundingClientRect().height)
      const snapshot = root.cloneNode(true) as HTMLDivElement
      snapshot.removeAttribute('data-action-busy')
      snapshot.setAttribute('aria-hidden', 'true')
      snapshot.style.position = 'absolute'
      snapshot.style.inset = '0'
      snapshot.style.zIndex = '20'
      snapshot.style.background = '#eef7f7'
      snapshot.style.pointerEvents = 'auto'
      snapshot.style.overflow = 'hidden'

      const badge = document.createElement('div')
      badge.textContent = 'جارٍ حفظ التعديل…'
      badge.style.position = 'fixed'
      badge.style.left = '24px'
      badge.style.bottom = '24px'
      badge.style.zIndex = '9999'
      badge.style.background = '#078f91'
      badge.style.color = '#fff'
      badge.style.padding = '10px 16px'
      badge.style.borderRadius = '999px'
      badge.style.fontWeight = '700'
      badge.style.boxShadow = '0 8px 24px rgba(0,0,0,.18)'

      const previousPosition = root.style.position
      const previousMinHeight = root.style.minHeight
      root.style.position = 'relative'
      root.style.minHeight = `${minHeight}px`
      root.appendChild(snapshot)
      document.body.appendChild(badge)

      let frames = 0
      const restoreScroll = () => {
        window.scrollTo({ top: scrollY, behavior: 'auto' })
        frames += 1
        if (frames < 120) requestAnimationFrame(restoreScroll)
      }
      requestAnimationFrame(restoreScroll)

      const cleanup = () => {
        snapshot.remove()
        badge.remove()
        root.style.position = previousPosition
        root.style.minHeight = previousMinHeight
        delete root.dataset.actionBusy
        window.scrollTo({ top: scrollY, behavior: 'auto' })
        cleanupRef.current = null
      }

      cleanupRef.current = cleanup
      window.setTimeout(cleanup, 3200)
    }

    root.addEventListener('click', keepViewStable, true)
    return () => root.removeEventListener('click', keepViewStable, true)
  }, [])

  return (
    <div ref={rootRef}>
      <Reconciliation />
    </div>
  )
}
