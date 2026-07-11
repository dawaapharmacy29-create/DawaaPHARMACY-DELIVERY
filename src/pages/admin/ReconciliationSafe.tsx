import Reconciliation from './Reconciliation'
import { supabase } from '../../lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BULK_INSERT_TABLES = new Set(['monthly_system_invoices', 'monthly_invoice_reconciliation_results'])
const RETRYABLE_MESSAGE = /(timeout|network|fetch|connection|انتهى|شبكة)/i

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

  // لا نبحث داخل كل قيم الكائن عشوائياً؛ قد يحتوي رد الـ RPC على UUID آخر
  // مثل uploaded_by أو auth_user_id، واستخدامه كـ batch_id يسبب خطأ foreign key.
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

const runLimited = createGate(5)

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

async function insertInChunks(tableName: string, rows: unknown[], options?: unknown) {
  const chunkSize = tableName === 'monthly_system_invoices' ? 75 : 60
  let inserted = 0

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const result: any = await withRetry(
      () => Promise.resolve((supabase as any).__reconciliationOriginalFrom(tableName).insert(chunk, options)),
      4,
    )
    if (result?.error) return result
    inserted += chunk.length
  }

  return { data: null, error: null, count: inserted, status: 201, statusText: 'Created' }
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
        if (property === 'insert' && BULK_INSERT_TABLES.has(tableName)) {
          return (values: unknown, options?: unknown) => {
            if (Array.isArray(values) && values.length > 60) return insertInChunks(tableName, values, options)
            return wrapBuilder(target.insert(values, options))
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

export default Reconciliation
