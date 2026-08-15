import { useEffect, useRef, type FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
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

type SystemInvoiceWriteRow = Record<string, unknown> & {
  batch_id?: string
  period_start?: string
  period_end?: string
  invoice_number?: string
  branch_name?: string
  normalized_branch_name?: string
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeDigits(value: unknown): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩'
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹'
  return clean(value).replace(/[٠-٩۰-۹]/g, digit => {
    const arabicIndex = arabicDigits.indexOf(digit)
    if (arabicIndex >= 0) return String(arabicIndex)
    const persianIndex = persianDigits.indexOf(digit)
    return persianIndex >= 0 ? String(persianIndex) : digit
  })
}

function normalizeInvoiceKey(value: unknown): string {
  return normalizeDigits(value).replace(/\.0$/, '').replace(/[^0-9A-Za-z-]/g, '')
}

function normalizeBranchKey(value: unknown): string {
  let branch = clean(value)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '')
    .toLowerCase()

  if (!branch) return ''
  if (branch.includes('شكري') || ['shkri', 'shokry', 'shukri', 'shokri'].includes(branch)) return 'شكري'
  if (branch.includes('شامي') || ['shamy', 'shami', 'elshamy', 'alshamy'].includes(branch)) return 'الشامي'
  if (branch.includes('بسيس') || ['basisa', 'bsisa', 'bseesa'].includes(branch)) return 'بسيسة'
  if (branch.includes('زكريا') || ['zakaria', 'zakarya'].includes(branch)) return 'زكريا'
  if (branch.includes('منشي') || ['mansheya', 'manshia', 'elmansheya'].includes(branch)) return 'المنشية'

  branch = branch.replace('الاداره', '').replace('الفرعيه', '').replace('فرع', '')
  return branch
}

function prepareSystemInvoiceRows(rows: unknown[]): SystemInvoiceWriteRow[] {
  const importedAt = new Date().toISOString()
  return (rows as SystemInvoiceWriteRow[]).map(row => {
    const invoiceNumber = normalizeInvoiceKey(row.invoice_number)
    const normalizedBranch = normalizeBranchKey(row.normalized_branch_name || row.branch_name)
    const periodStart = clean(row.period_start)
    const periodEnd = clean(row.period_end)

    return {
      ...row,
      invoice_number: invoiceNumber,
      normalized_branch_name: normalizedBranch,
      invoice_cycle_key: `${periodStart}|${periodEnd}|${normalizedBranch}|${invoiceNumber}`,
      last_seen_batch_id: row.batch_id || null,
      last_imported_at: importedAt,
    }
  })
}

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
  const preparedRows = tableName === 'monthly_system_invoices' ? prepareSystemInvoiceRows(rows) : rows

  const run = () => {
    if (tableName === 'monthly_system_invoices') {
      return Promise.resolve(table.upsert(preparedRows, { onConflict: 'invoice_cycle_key' }))
    }
    return Promise.resolve(mode === 'upsert' ? table.upsert(preparedRows, options) : table.insert(preparedRows, options))
  }

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
    statusText: tableName === 'monthly_system_invoices' || mode === 'upsert' ? 'Upserted' : 'Created',
  }
}

async function writeInChunks(tableName: string, mode: BulkWriteMode, rows: unknown[], options?: unknown) {
  const chunkSize = chunkSizeFor(tableName, tableName === 'monthly_system_invoices' ? 'upsert' : mode)
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
    statusText: tableName === 'monthly_system_invoices' || mode === 'upsert' ? 'Upserted' : 'Created',
  }
}

function isQuestionOnly(value: unknown): boolean {
  const compact = clean(value).replace(/\s+/g, '')
  return compact.length > 0 && /^\?+$/.test(compact)
}

function questionWordLengths(value: unknown): number[] {
  return clean(value).split(/\s+/).filter(Boolean).map(word => word.length)
}

async function normalizeGarbledBConnectFile(file: File): Promise<{ file: File; repaired: boolean }> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false })
  if (matrix.length < 3) return { file, repaired: false }

  const headerIndex = 1
  const header = matrix[headerIndex] || []
  const questionHeaders = header.filter(isQuestionOnly).length
  if (questionHeaders < 5) return { file, repaired: false }

  // بعض صادرات B-Connect الحالية تصل بعلامات ? بدل العربية، لكن ترتيب الأعمدة ثابت.
  // نعيد أسماء الأعمدة الأساسية فقط، ونفك نوع الفاتورة والفرع من البنية الثابتة للملف.
  header[0] = 'المخزن'
  header[1] = 'الرقم'
  header[2] = 'النوع'
  header[3] = 'الكود'
  header[4] = 'العميل'
  header[5] = 'التاريخ'
  header[8] = 'ق.الفاتورة'
  header[9] = 'ق.الصافى'
  matrix[headerIndex] = header

  for (let index = headerIndex + 1; index < matrix.length; index++) {
    const row = matrix[index] || []

    if (isQuestionOnly(row[0])) {
      const lengths = questionWordLengths(row[0])
      if (lengths.join(',') === '7,3,4') row[0] = 'الادارة فرع شكري'
      else if (lengths.join(',') === '7,6') row[0] = 'الفرعية الشامي'
    }

    if (isQuestionOnly(row[2])) {
      const compactLength = clean(row[2]).replace(/\s+/g, '').length
      row[2] = compactLength >= 8 ? 'توصيل منزلى' : 'كاش'
    }
  }

  workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(matrix)
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const normalizedFile = new File([output], file.name, {
    type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    lastModified: file.lastModified,
  })
  return { file: normalizedFile, repaired: true }
}

const client = supabase as any
if (!client.__reconciliationNetworkPatched) {
  const originalRpc = client.rpc.bind(client)
  const originalFrom = client.from.bind(client)
  client.__reconciliationOriginalFrom = originalFrom

  client.rpc = async (functionName: string, args?: any, options?: unknown) => {
    if (functionName === 'archive_monthly_rider_performance') {
      const preciseResult: any = await withRetry(() => originalRpc('reconcile_delivery_orders_precise', {
        p_period_start: args?.p_period_start,
        p_period_end: args?.p_period_end,
        p_batch_id: args?.p_batch_id,
      }), 4)

      if (preciseResult?.error) return preciseResult
      const archiveResult: any = await withRetry(() => originalRpc(functionName, args, options), 4)
      if (archiveResult?.error) return archiveResult
      return { ...archiveResult, precise_summary: preciseResult?.data ?? null }
    }

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
            if (Array.isArray(values)) {
              if (values.length > chunkSizeFor(tableName, property as BulkWriteMode)) {
                return writeInChunks(tableName, property as BulkWriteMode, values, options)
              }
              return writeChunk(tableName, property as BulkWriteMode, values, options)
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
  const normalizingFileRef = useRef(false)

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

  async function handleFileChangeCapture(event: FormEvent<HTMLDivElement>) {
    const input = event.target as HTMLInputElement | null
    if (!input || input.tagName !== 'INPUT' || input.type !== 'file' || !input.files?.[0]) return

    if (input.dataset.preciseReconciliationNormalized === 'true') {
      delete input.dataset.preciseReconciliationNormalized
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (normalizingFileRef.current) return
    normalizingFileRef.current = true

    try {
      const { file, repaired } = await normalizeGarbledBConnectFile(input.files[0])
      const transfer = new DataTransfer()
      transfer.items.add(file)
      input.files = transfer.files
      input.dataset.preciseReconciliationNormalized = 'true'
      if (repaired) toast.info('تم إصلاح ترميز ملف السيستم تلقائيًا قبل المطابقة')
      input.dispatchEvent(new Event('change', { bubbles: true }))
    } catch (error) {
      console.error('Failed to normalize reconciliation file', error)
      toast.error('تعذر تجهيز ملف المطابقة قبل الرفع')
    } finally {
      normalizingFileRef.current = false
    }
  }

  return (
    <div ref={rootRef} onChangeCapture={handleFileChangeCapture}>
      <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800" dir="rtl">
        المطابقة الدقيقة مفعلة: رقم الفاتورة + الفرع الصحيح من قاعدة البيانات، مع مراجعة التاريخ وكود العميل والقيمة والتكرارات قبل الاحتساب.
      </div>
      <Reconciliation />
    </div>
  )
}
