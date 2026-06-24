import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Upload, CheckCircle2, XCircle, Search, AlertTriangle, FileSpreadsheet, Trash2, RotateCcw, Printer, Download, Pencil } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { DeliveryOrder, Rider, InternalTrip, Attendance } from '../../lib/types'
import { getRiders } from '../../lib/delivery'
import { formatMoney, getOperationalPeriod, wildcardMatchText } from '../../lib/helpers'

type FilterKey = 'all' | 'counted' | 'pending' | 'not_found' | 'failed' | 'duplicate' | 'multiplier' | 'deleted'

type BConnectRow = {
  invoice_number: string
  invoice_type: string
  branch_name: string
  customer_code: string
  customer_name: string
  phone: string
  address: string
  invoice_date: string
  invoice_amount: number
  gross_total: number
  net_total: number
  system_user: string
  close_time: string
  raw: Record<string, unknown>
}

type ReconciliationReport = {
  importedRows: number
  bconnectInvoices: number
  riderRegistered: number
  counted: number
  failedExcluded: number
  notFound: number
  duplicatesPending: number
  multiplierReview: number
  bconnectWithoutRider: number
}

type OrderEditForm = {
  invoice_number: string
  invoice_amount: string
  customer_code: string
  customer_name: string
  customer_phone: string
  notes: string
  edit_reason: string
}

const BRANCH_KEYS = ['branch_name', 'branch', 'المخزن', 'الفرع', 'فرع']
const INVOICE_KEYS = ['invoice_number', 'invoice_no', 'رقم الفاتورة', 'فاتورة', 'رقم', 'الرقم', 'رقم الفاتوره']
const TYPE_KEYS = ['invoice_type', 'type', 'النوع', 'نوع']
const CODE_KEYS = ['customer_code', 'code', 'كود العميل', 'الكود', 'كود', 'كود عميل']
const NAME_KEYS = ['customer_name', 'name', 'اسم العميل', 'العميل', 'عميل']
const PHONE_KEYS = ['phone', 'mobile', 'customer_phone', 'تليفون', 'هاتف', 'موبايل', 'رقم التليفون']
const ADDRESS_KEYS = ['address', 'customer_address', 'العنوان', 'عنوان', 'عنوان التوصيل', 'منطقة']
const DATE_KEYS = ['invoice_date', 'date', 'التاريخ', 'تاريخ']
const GROSS_AMOUNT_KEYS = ['gross_total', 'invoice_amount', 'invoice_value', 'ق.الفاتورة', 'قيمة الفاتورة', 'الإجمالي']
const NET_AMOUNT_KEYS = ['net_total', 'ق.الصافى', 'ق.الصافي', 'الصافي', 'ق.بعد الخصم', 'المطلوب']
const SYSTEM_USER_KEYS = ['system_user', 'user', 'المستخدم', 'الدكتور', 'البائع']
const CLOSE_TIME_KEYS = ['close_time', 'وقت الإقفال', 'وقت الاقفال', 'وقت الإغلاق', 'وقت الاغلاق']
function clean(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeArabicText(value: unknown): string {
  return clean(value)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function normalizeBranchName(value: unknown): string {
  const v = normalizeArabicText(value)
  if (!v) return ''
  if (v.includes('الشامي')) return 'الشامي'
  if (v.includes('شكري')) return 'شكري'
  if (v.includes('بسيسه')) return 'بسيسة'
  if (v.includes('زكريا')) return 'زكريا'
  if (v.includes('المنشيه')) return 'المنشية'
  return v.replace('الاداره', '').replace('الفرعيه', '').replace('فرع', '')
}

function isDeliveryInvoiceType(value: unknown): boolean {
  const v = normalizeArabicText(value)
  return v.includes('توصيلمنزلي') || v.includes('توصيلمنزلى') || v.includes('delivery')
}

function normalizeDigits(value: unknown): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩'
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹'
  return clean(value).replace(/[٠-٩۰-۹]/g, d => {
    const ar = arabicDigits.indexOf(d)
    if (ar >= 0) return String(ar)
    const fa = persianDigits.indexOf(d)
    if (fa >= 0) return String(fa)
    return d
  })
}

function normalizeInvoice(value: unknown): string {
  const v = normalizeDigits(value)
  // يدعم أرقام Excel الرقمية مثل 21511 أو 21511.0، ويزيل أي مسافات أو رموز مخفية
  return v.replace(/\.0$/, '').replace(/[^0-9A-Za-z\u0600-\u06FF-]/g, '')
}

function first(row: Record<string, unknown>, keys: string[]): string {
  const normalizedMap = new Map<string, unknown>()
  Object.entries(row).forEach(([k, v]) => {
    normalizedMap.set(k.trim().toLowerCase(), v)
    normalizedMap.set(normalizeArabicText(k), v)
  })
  for (const key of keys) {
    const direct = row[key]
    if (clean(direct)) return clean(direct)
    const lowered = normalizedMap.get(key.trim().toLowerCase())
    if (clean(lowered)) return clean(lowered)
    const arabicNormalized = normalizedMap.get(normalizeArabicText(key))
    if (clean(arabicNormalized)) return clean(arabicNormalized)
  }
  return ''
}

function toNumber(value: unknown): number {
  const n = Number(String(value ?? '').replace(/,/g, '').replace(/[جنيهجم\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function csvCell(value: unknown): string {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim()
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(fileName: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) {
    toast.error('لا توجد بيانات للتصدير')
    return
  }
  const headers = Object.keys(rows[0])
  const csv = ['\ufeff' + headers.map(csvCell).join(','), ...rows.map(row => headers.map(h => csvCell(row[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

function parseBConnectRows(rows: Record<string, unknown>[]): BConnectRow[] {
  const out: BConnectRow[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const invoiceType = first(row, TYPE_KEYS)
    // المطابقة الرسمية للدليفري تكون على فواتير التوصيل فقط، وليس الكاش.
    if (!isDeliveryInvoiceType(invoiceType)) continue

    const invoice = normalizeInvoice(first(row, INVOICE_KEYS))
    if (!invoice || seen.has(invoice)) continue
    seen.add(invoice)

    const gross = toNumber(first(row, GROSS_AMOUNT_KEYS))
    const net = toNumber(first(row, NET_AMOUNT_KEYS)) || gross

    out.push({
      invoice_number: invoice,
      invoice_type: invoiceType,
      branch_name: first(row, BRANCH_KEYS),
      customer_code: first(row, CODE_KEYS),
      customer_name: first(row, NAME_KEYS),
      phone: first(row, PHONE_KEYS),
      address: first(row, ADDRESS_KEYS),
      invoice_date: first(row, DATE_KEYS),
      invoice_amount: net || gross,
      gross_total: gross,
      net_total: net,
      system_user: first(row, SYSTEM_USER_KEYS),
      close_time: first(row, CLOSE_TIME_KEYS),
      raw: row,
    })
  }

  return out
}

function normalizeOrderInvoice(order: DeliveryOrder): string {
  return normalizeInvoice((order as any).invoice_number || (order as any).invoice_no)
}

export default function Reconciliation() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [attendanceRows, setAttendanceRows] = useState<Attendance[]>([])
  const [riderActions, setRiderActions] = useState<any[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [uploading, setUploading] = useState(false)
  const [report, setReport] = useState<ReconciliationReport | null>(null)
  const [missingFromRiders, setMissingFromRiders] = useState<BConnectRow[]>([])
  const [, setLastBatchId] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<DeliveryOrder | null>(null)
  const [editForm, setEditForm] = useState<OrderEditForm>({
    invoice_number: '',
    invoice_amount: '',
    customer_code: '',
    customer_name: '',
    customer_phone: '',
    notes: '',
    edit_reason: '',
  })
  const activeDrillFilters = useMemo(() => {
    const out: Record<string, string> = {}
    ;['status', 'review_status', 'branch', 'rider_id', 'multiplier', 'countable', 'date', 'from', 'to', 'issue'].forEach(key => {
      const value = searchParams.get(key)
      if (value) out[key] = value
    })
    return out
  }, [searchParams])
  const hasDrillFilters = Object.keys(activeDrillFilters).length > 0

  useEffect(() => {
    const incoming = searchParams.get('filter') as FilterKey | null
    if (incoming && ['all','counted','pending','not_found','failed','duplicate','multiplier','deleted'].includes(incoming)) setFilter(incoming)
    const q = searchParams.get('q')
    if (q) setSearchTerm(q)
    void loadAll()
  }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const fromDate = searchParams.get('date') === 'today'
        ? new Date().toISOString().slice(0, 10)
        : (searchParams.get('from') || period.start)
      const toDate = searchParams.get('date') === 'today'
        ? new Date().toISOString().slice(0, 10)
        : (searchParams.get('to') || period.end)
      const [ordersRes, ridersRes, tripsRes, attendanceRes, actionsRes] = await Promise.allSettled([
        supabase
          .from('delivery_orders')
          .select('*')
          .gte('delivery_date', fromDate)
          .lte('delivery_date', toDate)
          .order('registered_at', { ascending: false }),
        getRiders(),
        supabase
          .from('internal_trips')
          .select('*')
          .gte('trip_date', fromDate)
          .lte('trip_date', toDate)
          .order('registered_at', { ascending: false }),
        supabase
          .from('attendance')
          .select('*')
          .gte('work_date', fromDate)
          .lte('work_date', toDate),
        supabase
          .from('rider_shift_actions')
          .select('*')
          .gte('shift_date', fromDate)
          .lte('shift_date', toDate)
          .order('incident_at', { ascending: false }),
      ])
      if (ordersRes.status === 'fulfilled') setOrders((ordersRes.value.data ?? []) as DeliveryOrder[])
      if (ridersRes.status === 'fulfilled') setRiders(ridersRes.value)
      if (tripsRes.status === 'fulfilled') setTrips((tripsRes.value.data ?? []) as InternalTrip[])
      if (attendanceRes.status === 'fulfilled') setAttendanceRows((attendanceRes.value.data ?? []) as Attendance[])
      if (actionsRes.status === 'fulfilled') setRiderActions((actionsRes.value.data ?? []) as any[])

    } catch (error) {
      console.error(error)
      toast.error('فشل تحميل بيانات المطابقة')
    } finally {
      setLoading(false)
    }
  }

  const riderMap = new Map(riders.map(r => [r.id, r]))
  const duplicateInvoiceSet = useMemo(() => {
    const counts = new Map<string, number>()
    orders.forEach(o => {
      const inv = normalizeOrderInvoice(o)
      if (inv) counts.set(inv, (counts.get(inv) ?? 0) + 1)
    })
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([inv]) => inv))
  }, [orders])

  const filteredOrders = orders.filter(order => {
    const inv = normalizeOrderInvoice(order)
    const isFailed = order.status === 'failed'
    const isDeleted = Boolean((order as any).deleted_at)
    const isDuplicate = duplicateInvoiceSet.has(inv) || order.is_duplicate_invoice
    const isMultiplier = (order.order_multiplier ?? 1) >= 1.5
    const finalStatus = (order as any).final_count_status
    const branchName = String((order as any).branch_name || '')
    const reviewStatus = String((order as any).review_status || (order as any).duplicate_review_status || '')
    const issue = activeDrillFilters.issue
    const matchesDrill =
      (!activeDrillFilters.status || String(order.status || '') === activeDrillFilters.status) &&
      (!activeDrillFilters.review_status || reviewStatus === activeDrillFilters.review_status || (activeDrillFilters.review_status === 'pending' && reviewStatus.startsWith('pending'))) &&
      (!activeDrillFilters.branch || branchName === activeDrillFilters.branch || normalizeBranchName(branchName) === normalizeBranchName(activeDrillFilters.branch)) &&
      (!activeDrillFilters.rider_id || order.rider_id === activeDrillFilters.rider_id) &&
      (!activeDrillFilters.multiplier || Number(order.order_multiplier || 1) >= Number(activeDrillFilters.multiplier)) &&
      (!activeDrillFilters.countable || String((order as any).is_countable) === activeDrillFilters.countable) &&
      (!issue ||
        (issue === 'missing_branch' && !order.branch_id && !branchName) ||
        (issue === 'missing_rider' && !order.rider_id) ||
        (issue === 'missing_invoice' && !inv) ||
        (issue === 'duplicate' && isDuplicate) ||
        (issue === 'failed' && isFailed))
    const matchesFilter =
      (filter === 'all' && !isDeleted) ||
      (filter === 'counted' && ((order as any).is_countable === true || finalStatus === 'counted')) ||
      (filter === 'pending' && (!finalStatus || String(finalStatus).startsWith('pending'))) ||
      (filter === 'not_found' && order.bconnect_match_status === 'invoice_not_found') ||
      (filter === 'failed' && isFailed) ||
      (filter === 'duplicate' && isDuplicate && !isDeleted) ||
      (filter === 'multiplier' && isMultiplier && !isDeleted) ||
      (filter === 'deleted' && isDeleted)
    const rider = riderMap.get(order.rider_id)
    const haystack = [
      inv,
      order.customer_name_snapshot,
      (order as any).customer_name,
      order.customer_phone_snapshot,
      (order as any).customer_phone,
      (order as any).customer_code,
      (order as any).invoice_no,
      order.invoice_number,
      (order as any).order_no,
      rider?.name,
      rider?.username,
      (order as any).rider_name,
      (order as any).driver_name,
    ].map(v => String(v || ''))
    const matchesSearch = !searchTerm.trim() || haystack.some(v => wildcardMatchText(v, searchTerm))
    return matchesFilter && matchesSearch && matchesDrill
  })

  async function readImportFile(file: File): Promise<Record<string, unknown>[]> {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false })

    // ملفات B-Connect غالباً أول صف فيها عنوان التقرير، والصف الثاني هو الهيدر:
    // المخزن، الرقم، النوع، الكود، العميل... لذلك لا نعتبر أول صف هو الهيدر تلقائياً.
    let headerIndex = -1
    for (let i = 0; i < Math.min(matrix.length, 15); i++) {
      const cells = (matrix[i] || []).map(clean)
      const normalizedCells = cells.map(normalizeArabicText)
      const hasInvoice = cells.includes('الرقم') || normalizedCells.includes('الرقم') || normalizedCells.includes('رقمالفاتوره')
      const hasType = cells.includes('النوع') || normalizedCells.includes('النوع')
      const hasCustomer = cells.includes('العميل') || normalizedCells.includes('العميل')
      const hasBranch = cells.includes('المخزن') || normalizedCells.includes('المخزن') || normalizedCells.includes('الفرع')
      if (hasInvoice && hasType && hasCustomer && hasBranch) {
        headerIndex = i
        break
      }
    }

    // fallback على صيغة ملف السيستم الظاهرة عندك: العنوان في الصف الأول والهيدر في الصف الثاني
    if (headerIndex < 0 && matrix.length > 1) headerIndex = 1
    if (headerIndex < 0) headerIndex = 0

    const headers = (matrix[headerIndex] || []).map((h: unknown, idx: number) => clean(h) || `column_${idx + 1}`)
    return matrix.slice(headerIndex + 1)
      .filter(row => (row || []).some((cell: unknown) => clean(cell)))
      .map(row => {
        const out: Record<string, unknown> = {}
        const duplicateCounts = new Map<string, number>()
        headers.forEach((h: string, idx: number) => {
          const value = row?.[idx] ?? ''
          const count = duplicateCounts.get(h) ?? 0
          duplicateCounts.set(h, count + 1)

          // ملفات B-Connect فيها عمودان بنفس الاسم "النوع":
          // الأول هو نوع الفاتورة (كاش/توصيل منزلى)، والثاني هو حالة الفاتورة (تم حفظها/معلقة).
          // كان العمود الثاني يكتب فوق الأول، فتفشل قراءة كل فواتير التوصيل.
          if (count === 0) {
            out[h] = value
          } else {
            out[`${h}.${count}`] = value
          }
        })
        return out
      })
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      const rows = await readImportFile(file)
      const bconnect = parseBConnectRows(rows)

      if (!bconnect.length) {
        toast.error('لم يتم قراءة أي فاتورة توصيل من الملف. تأكد أن الملف هو ملف فواتير السيستم وفيه أعمدة: المخزن، الرقم، النوع، الكود، العميل.')
        console.warn('Reconciliation import parsed rows but no delivery invoices found', { sample: rows.slice(0, 5) })
        return
      }

      console.info('Reconciliation import sample invoices', bconnect.slice(0, 10).map(r => r.invoice_number))

      const { data: batchData, error: batchError } = await supabase.rpc('save_monthly_invoice_import_batch', {
        p_period_start: period.start,
        p_period_end: period.end,
        p_file_name: file.name,
        p_total_rows: rows.length,
        p_delivery_rows: bconnect.length
      })
      if (batchError) throw batchError
      const batchId = (Array.isArray(batchData) ? batchData[0] : batchData) as string
      setLastBatchId(batchId)

      if (batchId && bconnect.length) {
        const { error: invoiceInsertError } = await supabase.from('monthly_system_invoices').insert(
          bconnect.map(row => ({
            batch_id: batchId,
            period_start: period.start,
            period_end: period.end,
            invoice_number: row.invoice_number,
            invoice_type: row.invoice_type,
            branch_name: row.branch_name,
            normalized_branch_name: normalizeBranchName(row.branch_name),
            customer_code: row.customer_code,
            customer_name: row.customer_name,
            customer_phone: row.phone,
            delivery_address: row.address,
            invoice_date_text: row.invoice_date,
            gross_total: row.gross_total,
            net_total: row.net_total || row.invoice_amount,
            system_user_name: row.system_user,
            close_time_text: row.close_time,
            raw_json: row.raw,
          }))
        )
        if (invoiceInsertError) throw invoiceInsertError
      }

      const bconnectMap = new Map(bconnect.map(row => [row.invoice_number, row])) // رقم الفاتورة هو العلامة المميزة الأساسية
      const currentOrders = orders.length ? orders : ((await supabase
        .from('delivery_orders')
        .select('*')
        .gte('delivery_date', period.start)
        .lte('delivery_date', period.end)).data ?? []) as DeliveryOrder[]

      const orderInvoices = new Set(currentOrders.map(normalizeOrderInvoice).filter(Boolean))
      const updates: any[] = []
      let counted = 0
      let failedExcluded = 0
      let notFound = 0
      let duplicatesPending = 0
      let multiplierReview = 0
      const resultRows: any[] = []

      for (const order of currentOrders) {
        const inv = normalizeOrderInvoice(order)
        const isFailed = order.status === 'failed'
        const isDuplicate = duplicateInvoiceSet.has(inv) || order.is_duplicate_invoice
        const isMultiplier = (order.order_multiplier ?? 1) >= 1.5
        const match = inv ? bconnectMap.get(inv) : null
        let reconciliationStatus = 'needs_manual_review'
        let differenceReason = ''

        let patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        }

        if (isFailed) {
          reconciliationStatus = match ? 'matched_failed_excluded' : 'app_only_failed'
          differenceReason = 'أوردر فاشل لا يحتسب'
          failedExcluded++
          patch = {
            ...patch,
            bconnect_match_status: match ? 'matched' : 'pending',
            is_countable: false,
            final_count_status: 'excluded_failed',
            count_exclusion_reason: 'failed_order',
            order_earning: 0,
          }
        } else if (!match) {
          reconciliationStatus = 'app_only'
          differenceReason = 'مسجل في التطبيق وغير موجود في ملف السيستم'
          notFound++
          patch = {
            ...patch,
            bconnect_match_status: 'invoice_not_found',
            is_countable: false,
            final_count_status: 'excluded_invoice_not_found',
            count_exclusion_reason: 'invoice_not_found_in_bconnect',
            reconciliation_notes: 'الفاتورة غير موجودة في ملف السيستم لهذه الدورة',
          }
        } else if (isDuplicate) {
          reconciliationStatus = 'duplicate_in_app'
          differenceReason = 'رقم فاتورة مكرر في التطبيق ويحتاج مراجعة'
          duplicatesPending++
          patch = {
            ...patch,
            bconnect_match_status: 'matched',
            matched_at: new Date().toISOString(),
            matched_amount: match.invoice_amount,
            is_countable: false,
            final_count_status: 'pending_duplicate_review',
            count_exclusion_reason: 'duplicate_requires_admin_approval',
            reconciliation_notes: 'الفاتورة موجودة في ملف السيستم لكنها مكررة وتحتاج اعتماد إداري',
          }
        } else {
          reconciliationStatus = 'matched'
          differenceReason = ''
          counted++
          if (isMultiplier) multiplierReview++
          patch = {
            ...patch,
            bconnect_match_status: 'matched',
            matched_at: new Date().toISOString(),
            matched_amount: match.invoice_amount,
            is_countable: true,
            final_count_status: isMultiplier ? 'counted_multiplier_pending_value_review' : 'counted',
            count_exclusion_reason: null,
            reconciliation_notes: isMultiplier ? 'مطابقة ومحتاجة مراجعة قيمة ×1.5' : 'مطابقة مع ملف السيستم وتحتسب',
          }
        }

        resultRows.push({
          batch_id: batchId,
          period_start: period.start,
          period_end: period.end,
          invoice_number: inv || null,
          rider_id: order.rider_id,
          rider_name: (order as any).rider_name || riderMap.get(order.rider_id)?.name || null,
          app_order_id: order.id,
          match_status: reconciliationStatus,
          difference_reason: differenceReason || null,
          app_amount: Number((order as any).invoice_amount ?? (order as any).invoice_value ?? 0),
          system_amount: match?.invoice_amount ?? null,
          app_customer_code: (order as any).customer_code || (order as any).customer_code_snapshot || null,
          system_customer_code: match?.customer_code ?? null,
          app_customer_name: (order as any).customer_name || (order as any).customer_name_snapshot || null,
          system_customer_name: match?.customer_name ?? null,
          app_branch_name: (order as any).branch_name || null,
          system_branch_name: match?.branch_name ?? null,
          is_countable: Boolean((patch as any).is_countable),
          needs_review: !Boolean((patch as any).is_countable),
          raw_json: { order, system: match || null },
        })

        updates.push(supabase.from('delivery_orders').update(patch).eq('id', order.id))
      }

      await Promise.all(updates)
      const bconnectOnly = bconnect.filter(row => !orderInvoices.has(row.invoice_number))
      resultRows.push(...bconnectOnly.map(row => ({
        batch_id: batchId,
        period_start: period.start,
        period_end: period.end,
        invoice_number: row.invoice_number,
        rider_id: null,
        rider_name: null,
        app_order_id: null,
        match_status: 'system_only',
        difference_reason: 'موجودة في ملف السيستم وغير مسجلة في التطبيق',
        app_amount: null,
        system_amount: row.invoice_amount,
        app_customer_code: null,
        system_customer_code: row.customer_code,
        app_customer_name: null,
        system_customer_name: row.customer_name,
        app_branch_name: null,
        system_branch_name: row.branch_name,
        is_countable: false,
        needs_review: true,
        raw_json: { system: row },
      })))

      if (batchId && resultRows.length) {
        const { error: resultInsertError } = await supabase.from('monthly_invoice_reconciliation_results').insert(resultRows)
        if (resultInsertError) throw resultInsertError
        await supabase.rpc('archive_monthly_rider_performance', {
          p_batch_id: batchId,
          p_period_start: period.start,
          p_period_end: period.end
        })
      }

      setMissingFromRiders(bconnectOnly.slice(0, 300))
      setReport({
        importedRows: rows.length,
        bconnectInvoices: bconnect.length,
        riderRegistered: currentOrders.length,
        counted,
        failedExcluded,
        notFound,
        duplicatesPending,
        multiplierReview,
        bconnectWithoutRider: bconnectOnly.length,
      })
      toast.success('تمت المطابقة وحفظ أرشيف الشهر لكل دليفري')
      await loadAll()
    } catch (error: any) {
      console.error(error)
      toast.error('فشل رفع/مطابقة الملف: ' + (error?.message ?? ''))
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  function openEditOrder(order: DeliveryOrder) {
    setEditingOrder(order)
    setEditForm({
      invoice_number: normalizeOrderInvoice(order),
      invoice_amount: String(order.invoice_amount || (order as any).invoice_value || ''),
      customer_code: String((order as any).customer_code_snapshot || (order as any).customer_code || ''),
      customer_name: String(order.customer_name_snapshot || (order as any).customer_name || ''),
      customer_phone: String(order.customer_phone_snapshot || (order as any).customer_phone || ''),
      notes: String(order.notes || ''),
      edit_reason: '',
    })
  }

  async function handleSaveOrderEdit() {
    if (!editingOrder) return
    const reason = editForm.edit_reason.trim()
    if (reason.length < 5) {
      toast.error('اكتب سبب تعديل واضح عشان نحفظ سجل المراجعة')
      return
    }

    const invoiceNumber = normalizeInvoice(editForm.invoice_number)
    if (!invoiceNumber) {
      toast.error('رقم الفاتورة مطلوب')
      return
    }

    const amount = toNumber(editForm.invoice_amount)
    const oldInvoice = normalizeOrderInvoice(editingOrder)
    const oldCode = String((editingOrder as any).customer_code_snapshot || (editingOrder as any).customer_code || '')
    const oldName = String(editingOrder.customer_name_snapshot || (editingOrder as any).customer_name || '')
    const oldPhone = String(editingOrder.customer_phone_snapshot || (editingOrder as any).customer_phone || '')

    const changes = [
      oldInvoice !== invoiceNumber ? `رقم الفاتورة: ${oldInvoice || '—'} ← ${invoiceNumber}` : '',
      String(editingOrder.invoice_amount || (editingOrder as any).invoice_value || '') !== String(amount || '') ? `قيمة الفاتورة: ${editingOrder.invoice_amount || (editingOrder as any).invoice_value || '—'} ← ${amount || '—'}` : '',
      oldCode !== editForm.customer_code.trim() ? `كود العميل: ${oldCode || '—'} ← ${editForm.customer_code.trim() || '—'}` : '',
      oldName !== editForm.customer_name.trim() ? `العميل: ${oldName || '—'} ← ${editForm.customer_name.trim() || '—'}` : '',
      oldPhone !== editForm.customer_phone.trim() ? `التليفون: ${oldPhone || '—'} ← ${editForm.customer_phone.trim() || '—'}` : '',
    ].filter(Boolean)

    try {
      const previousNotes = String(editingOrder.reconciliation_notes || '')
      const editNote = `تعديل إداري (${new Date().toLocaleString('ar-EG')}): ${reason}${changes.length ? ' — ' + changes.join(' | ') : ''}`

      const { error } = await supabase.from('delivery_orders').update({
        invoice_number: invoiceNumber,
        invoice_amount: amount || null,
        customer_code_snapshot: editForm.customer_code.trim() || null,
        customer_name_snapshot: editForm.customer_name.trim() || null,
        customer_phone_snapshot: editForm.customer_phone.trim() || null,
        notes: editForm.notes.trim() || null,
        bconnect_match_status: 'pending',
        is_countable: false,
        final_count_status: 'pending_reconciliation',
        count_exclusion_reason: null,
        matched_at: null,
        matched_amount: 0,
        reconciliation_notes: previousNotes ? `${previousNotes}\n${editNote}` : editNote,
        updated_at: new Date().toISOString(),
      }).eq('id', editingOrder.id)

      if (error) throw error

      // نحاول نحفظ سجل تعديل مستقل لو الجدول موجود، ولو فشل لا نعطل التعديل الأساسي.
      try {
        await supabase.from('delivery_order_invoice_edit_history').insert({
          order_id: editingOrder.id,
          old_invoice_number: oldInvoice,
          new_invoice_number: invoiceNumber,
          old_customer_code: oldCode || null,
          new_customer_code: editForm.customer_code.trim() || null,
          old_customer_name: oldName || null,
          new_customer_name: editForm.customer_name.trim() || null,
          old_customer_phone: oldPhone || null,
          new_customer_phone: editForm.customer_phone.trim() || null,
          reason,
          edited_by_name: 'مدير الفرع',
          edited_at: new Date().toISOString(),
        } as any)
      } catch (auditError) {
        console.warn('Order edit history was not saved, main order update succeeded', auditError)
      }

      toast.success('تم تعديل بيانات الأوردر وإرجاعه للمطابقة')
      setEditingOrder(null)
      await loadAll()
    } catch (error: any) {
      console.error(error)
      toast.error('فشل تعديل الأوردر: ' + (error?.message ?? ''))
    }
  }

  async function handleManualMatch(orderId: string) {
    try {
      const order = orders.find(o => o.id === orderId)
      const isMultiplier = ((order?.order_multiplier ?? 1) >= 1.5)
      await supabase.from('delivery_orders').update({
        bconnect_match_status: 'manually_approved',
        is_countable: true,
        final_count_status: isMultiplier ? 'counted_multiplier_manual_approval' : 'counted_manual_approval',
        reconciliation_notes: isMultiplier ? 'اعتماد يدوي — أوردر ×1.5 ما زال للمراجعة الإدارية' : 'اعتماد يدوي بواسطة الإدارة',
        updated_at: new Date().toISOString(),
      }).eq('id', orderId)
      toast.success('تمت المطابقة اليدوية')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('فشل المطابقة اليدوية')
    }
  }

  async function handleMarkNotFound(orderId: string) {
    try {
      await supabase.from('delivery_orders').update({
        bconnect_match_status: 'invoice_not_found',
        is_countable: false,
        final_count_status: 'excluded_invoice_not_found',
        count_exclusion_reason: 'marked_not_found_by_admin',
        updated_at: new Date().toISOString(),
      }).eq('id', orderId)
      toast.success('تم استبعاد الفاتورة من الحساب')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('فشل التحديث')
    }
  }


  async function handleSoftDelete(order: DeliveryOrder) {
    const reason = window.prompt(`سبب حذف الفاتورة ${normalizeOrderInvoice(order)}؟`)
    if (!reason || reason.trim().length < 5) {
      toast.error('لازم تكتب سبب حذف واضح')
      return
    }
    try {
      await supabase.from('delivery_orders').update({
        deleted_at: new Date().toISOString(),
        deleted_by_name: 'مدير الفرع',
        deletion_reason: reason.trim(),
        is_countable: false,
        final_count_status: 'deleted_not_counted',
        count_exclusion_reason: 'soft_deleted_by_manager',
        updated_at: new Date().toISOString(),
      }).eq('id', order.id)
      toast.success('تم حذف الأوردر من الحساب مع حفظ البيان')
      await loadAll()
    } catch (error: any) {
      console.error(error)
      toast.error('فشل حذف الأوردر: ' + (error?.message ?? ''))
    }
  }

  async function handleRestore(order: DeliveryOrder) {
    const reason = window.prompt(`سبب استعادة الفاتورة ${normalizeOrderInvoice(order)}؟`)
    if (!reason || reason.trim().length < 5) {
      toast.error('لازم تكتب سبب الاستعادة')
      return
    }
    try {
      await supabase.from('delivery_orders').update({
        deleted_at: null,
        restored_at: new Date().toISOString(),
        restored_by_name: 'مدير الفرع',
        restore_reason: reason.trim(),
        final_count_status: 'pending_reconciliation',
        count_exclusion_reason: null,
        updated_at: new Date().toISOString(),
      }).eq('id', order.id)
      toast.success('تمت استعادة الأوردر للمراجعة')
      await loadAll()
    } catch (error: any) {
      console.error(error)
      toast.error('فشل الاستعادة: ' + (error?.message ?? ''))
    }
  }

  async function handleReassign(order: DeliveryOrder) {
    const usernameOrName = window.prompt('اكتب اسم أو username المندوب الجديد')
    if (!usernameOrName?.trim()) return
    const target = riders.find(r =>
      r.name?.trim() === usernameOrName.trim() ||
      r.username?.trim().toUpperCase() === usernameOrName.trim().toUpperCase()
    )
    if (!target) {
      toast.error('لم أجد المندوب. اكتب الاسم أو username كما هو في صفحة الدليفري')
      return
    }
    const reason = window.prompt(`سبب تحويل الفاتورة ${normalizeOrderInvoice(order)} إلى ${target.name}؟`)
    if (!reason || reason.trim().length < 5) {
      toast.error('لازم تكتب سبب التحويل')
      return
    }
    try {
      await supabase.from('delivery_orders').update({
        reassigned_from_rider_id: order.rider_id,
        reassigned_to_rider_id: target.id,
        reassignment_reason: reason.trim(),
        reassigned_by_name: 'مدير الفرع',
        reassigned_at: new Date().toISOString(),
        rider_id: target.id,
        rider_name: target.name,
        branch_id: target.branch_id,
        branch_name: target.branch_name,
        final_count_status: 'pending_reconciliation',
        is_countable: false,
        updated_at: new Date().toISOString(),
      }).eq('id', order.id)
      toast.success('تم تحويل الأوردر للمندوب الجديد')
      await loadAll()
    } catch (error: any) {
      console.error(error)
      toast.error('فشل التحويل: ' + (error?.message ?? ''))
    }
  }

  function buildRiderSummaryRows() {
    return riders.map(rider => {
      const riderOrders = orders.filter(o => o.rider_id === rider.id && !(o as any).deleted_at)
      const normal = riderOrders.filter(o => ((o as any).is_countable === true || (o as any).final_count_status === 'counted' || (o as any).final_count_status === 'counted_manual_approval') && (o.order_multiplier ?? 1) < 1.5).length
      const multiplier = riderOrders.filter(o => ((o as any).is_countable === true || String((o as any).final_count_status || '').startsWith('counted')) && (o.order_multiplier ?? 1) >= 1.5).length
      const failed = riderOrders.filter(o => o.status === 'failed').length
      const wrongAfterReview = riderOrders.filter(o => ['rejected','excluded','excluded_failed','excluded_duplicate','excluded_legacy_unassigned'].includes(String((o as any).final_count_status || ''))).length
      const notFound = riderOrders.filter(o => o.bconnect_match_status === 'invoice_not_found' || String((o as any).final_count_status || '').includes('not_found')).length
      const duplicates = riderOrders.filter(o => duplicateInvoiceSet.has(normalizeOrderInvoice(o)) || o.is_duplicate_invoice).length
      const pending = riderOrders.filter(o => !((o as any).is_countable === true) && !['failed'].includes(o.status) && !String((o as any).final_count_status || '').startsWith('excluded')).length
      const deleted = orders.filter(o => o.rider_id === rider.id && Boolean((o as any).deleted_at)).length
      const approvedTrips = trips.filter(t => t.rider_id === rider.id && ['approved','completed'].includes(t.status)).length
      const pendingTrips = trips.filter(t => t.rider_id === rider.id && ['pending','pending_approval'].includes(t.status as any)).length
      const allTrips = trips.filter(t => t.rider_id === rider.id).length
      const riderAttendance = attendanceRows.filter(a => a.rider_id === rider.id)
      const attendanceDays = new Set(riderAttendance.filter(a => a.check_in_at).map(a => a.work_date)).size
      const attendanceMinutes = riderAttendance.reduce((sum, a: any) => {
        if (typeof a.total_minutes === 'number' && a.total_minutes > 0) return sum + a.total_minutes
        if (a.check_in_at && a.check_out_at) {
          return sum + Math.max(0, Math.round((new Date(a.check_out_at).getTime() - new Date(a.check_in_at).getTime()) / 60000))
        }
        return sum
      }, 0)
      const permissions = riderActions.filter(a => a.rider_id === rider.id && ['permission','early_leave','late_permission','absence','leave'].includes(String(a.action_type || a.final_action_type || ''))).length
      const approvedDeductions = riderActions.filter(a => a.rider_id === rider.id && a.review_status === 'approved' && ['deduction','deduction_request'].includes(String(a.final_action_type || a.action_type || '')))
      const approvedRewards = riderActions.filter(a => a.rider_id === rider.id && a.review_status === 'approved' && ['reward','reward_request'].includes(String(a.final_action_type || a.action_type || '')))
      const deductionsAmount = approvedDeductions.reduce((sum, a) => sum + Number(a.final_amount ?? a.requested_amount ?? 0), 0)
      const rewardsAmount = approvedRewards.reduce((sum, a) => sum + Number(a.final_amount ?? a.requested_amount ?? 0), 0)
      const incentiveBase = Number((rider as any).monthly_incentive_base ?? (rider as any).monthly_bonus_base ?? 0)
      const incentiveAfterDeductions = Math.max(0, incentiveBase - deductionsAmount) + rewardsAmount
      const deductionDetails = approvedDeductions.map(a => `${String(a.shift_date || a.incident_at || '').slice(0,10)}: ${Number(a.final_amount ?? a.requested_amount ?? 0)} ج - ${a.summary || a.general_manager_note || 'خصم'}`)
      const rewardDetails = approvedRewards.map(a => `${String(a.shift_date || a.incident_at || '').slice(0,10)}: ${Number(a.final_amount ?? a.requested_amount ?? 0)} ج - ${a.summary || a.general_manager_note || 'مكافأة'}`)
      const countedUnits = normal + (multiplier * 1.5)
      const riskScore = failed + notFound + duplicates + deleted + pendingTrips + wrongAfterReview
      return {
        rider, normal, multiplier, countedUnits, failed, wrongAfterReview, notFound, duplicates, pending, deleted,
        approvedTrips, pendingTrips, allTrips, riskScore, totalOrders: riderOrders.length,
        attendanceDays, attendanceHours: Math.round((attendanceMinutes / 60) * 100) / 100, permissions,
        deductionsAmount, rewardsAmount, incentiveBase, incentiveAfterDeductions, deductionDetails, rewardDetails,
      }
    }).filter(row => row.totalOrders || row.allTrips || row.deleted || row.attendanceDays || row.deductionsAmount || row.rewardsAmount)
  }

  function printMonthlyReport() {
    const rowsByRider = buildRiderSummaryRows()
    const nowText = new Date().toLocaleString('ar-EG')
    const html = `
      <html dir="rtl"><head><title>تقرير الدليفري الشهري</title>
      <style>
        @page{size:A4 landscape;margin:12mm} body{font-family:Arial,Tahoma,sans-serif;padding:14px;color:#061827} h1,h2{text-align:center;margin:6px 0}
        table{width:100%;border-collapse:collapse;margin-top:14px} th,td{border:1px solid #cbd5e1;padding:6px;text-align:center;font-size:11px;vertical-align:top}
        th{background:#008E92;color:white}.note{margin-top:14px;padding:10px;border:1px solid #f59e0b;background:#fffbeb;font-weight:bold}
        .danger{color:#b91c1c;font-weight:bold}.ok{color:#047857;font-weight:bold}.muted{color:#64748b}.details{text-align:right;font-size:10px;line-height:1.6}
      </style></head><body>
      <h1>تقرير الدليفري الشهري النهائي</h1>
      <h2>الدورة: ${period.start} إلى ${period.end} — تم التصدير: ${nowText}</h2>
      <table><thead><tr>
        <th>المندوب</th><th>الفرع</th><th>حضور أيام</th><th>ساعات حضور</th><th>أذونات</th><th>حافز البداية</th><th>خصومات</th><th>مكافآت</th><th>حافز بعد القرار</th>
        <th>أوردرات إجمالي</th><th>أوردرات ×1</th><th>أوردرات ×1.5</th><th>وحدات الأوردرات</th><th>مشاوير</th><th>فاشلة/خاطئة</th><th>مكررة/مراجعة</th><th>محذوفة</th><th>تفاصيل الخصم/المكافأة</th>
      </tr></thead>
      <tbody>${rowsByRider.map(row => `<tr>
        <td><b>${row.rider.name}</b><br/><span class="muted">${row.rider.username || ''}</span></td>
        <td>${(row.rider as any).branch_name || ''}</td>
        <td>${row.attendanceDays}</td><td>${row.attendanceHours}</td><td>${row.permissions}</td>
        <td>${row.incentiveBase}</td><td class="danger">${row.deductionsAmount}</td><td class="ok">${row.rewardsAmount}</td><td class="ok">${row.incentiveAfterDeductions}</td>
        <td>${row.totalOrders}</td><td>${row.normal}</td><td>${row.multiplier}</td><td class="ok">${row.countedUnits}</td><td>${row.allTrips}</td>
        <td class="danger">${row.failed + row.wrongAfterReview}</td><td>${row.duplicates + row.pending}</td><td>${row.deleted}</td>
        <td class="details">${[...row.deductionDetails, ...row.rewardDetails].join('<br/>') || '—'}</td>
      </tr>`).join('')}</tbody></table>
      <div class="note">ملاحظات مهمة: الدورة تبدأ يوم 26 وتنتهي بنهاية يوم 25. الأوردر الفاشل أو الخاطئ لا يحتسب. أوردر ×1.5 يحتاج موافقة مدير. الحافز المعروض = حافز البداية - الخصومات المعتمدة + المكافآت المعتمدة، ولا يمثل راتبًا نهائيًا إلا بعد اعتماد الإدارة.</div>
      </body></html>`
    const w = window.open('', '_blank')
    if (!w) { toast.error('المتصفح منع فتح نافذة التقرير'); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }


  if (loading) return <div className="min-h-screen bg-[#F3F7F8] p-8 text-center text-lg font-bold">جاري التحميل...</div>

  const activeOrders = orders.filter(o => !(o as any).deleted_at)
  const deletedTotal = orders.filter(o => Boolean((o as any).deleted_at)).length
  const countedTotal = activeOrders.filter(o => (o as any).is_countable === true || (o as any).final_count_status === 'counted').length
  const failedTotal = activeOrders.filter(o => o.status === 'failed').length
  const notFoundTotal = activeOrders.filter(o => o.bconnect_match_status === 'invoice_not_found').length
  const duplicateTotal = activeOrders.filter(o => duplicateInvoiceSet.has(normalizeOrderInvoice(o)) || o.is_duplicate_invoice).length
  const multiplierTotal = activeOrders.filter(o => (o.order_multiplier ?? 1) >= 1.5).length
  const pendingTotal = activeOrders.filter(o => String((o as any).final_count_status || '').startsWith('pending')).length
  const riskTotal = failedTotal + notFoundTotal + duplicateTotal + deletedTotal
  const riderSummaryRows = buildRiderSummaryRows()

  function exportSummaryCsv() {
    downloadCsv(`delivery-summary-${period.start}-${period.end}.csv`, riderSummaryRows.map(row => ({
      period_start: period.start,
      period_end: period.end,
      rider_name: row.rider.name,
      username: row.rider.username,
      normal_counted_orders: row.normal,
      multiplier_1_5_orders: row.multiplier,
      counted_order_units: row.countedUnits,
      approved_trips: row.approvedTrips,
      pending_trips: row.pendingTrips,
      failed_orders: row.failed,
      not_found_in_bconnect: row.notFound,
      duplicate_or_review_orders: row.duplicates,
      deleted_orders: row.deleted,
      risk_score: row.riskScore,
      attendance_days: row.attendanceDays,
      attendance_hours: row.attendanceHours,
      permissions_count: row.permissions,
      incentive_base: row.incentiveBase,
      deductions_amount: row.deductionsAmount,
      rewards_amount: row.rewardsAmount,
      incentive_after_deductions: row.incentiveAfterDeductions,
      deduction_details: row.deductionDetails.join(' | '),
      reward_details: row.rewardDetails.join(' | '),
      total_registered_orders: row.totalOrders,
    })))
  }

  function exportOrdersCsv() {
    downloadCsv(`delivery-orders-audit-${period.start}-${period.end}.csv`, filteredOrders.map(order => ({
      invoice_number: normalizeOrderInvoice(order),
      rider_name: riderMap.get(order.rider_id)?.name || (order as any).rider_name || '',
      customer_code: (order as any).customer_code_snapshot || (order as any).customer_code || '',
      customer_name: order.customer_name_snapshot || (order as any).customer_name || '',
      customer_phone: order.customer_phone_snapshot || (order as any).customer_phone || '',
      customer_address: order.customer_address_snapshot || (order as any).customer_address || '',
      invoice_amount: order.invoice_amount || (order as any).invoice_value || 0,
      order_status: order.status,
      bconnect_status: order.bconnect_match_status || '',
      final_count_status: (order as any).final_count_status || '',
      is_countable: (order as any).is_countable === true ? 'yes' : 'no',
      multiplier: order.order_multiplier || 1,
      multiplier_reason: order.multiplier_reason || '',
      duplicate: order.is_duplicate_invoice ? 'yes' : 'no',
      duplicate_reason: order.duplicate_reason || '',
      preparing_doctor_name: (order as any).preparing_doctor_name || '',
      failed_reason: order.failed_reason || '',
      deletion_reason: (order as any).deletion_reason || '',
      registered_at: order.registered_at,
    })))
  }

  function exportMissingBconnectCsv() {
    downloadCsv(`bconnect-without-rider-${period.start}-${period.end}.csv`, missingFromRiders.map(row => ({
      invoice_number: row.invoice_number,
      customer_code: row.customer_code,
      customer_name: row.customer_name,
      phone: row.phone,
      address: row.address,
      invoice_amount: row.invoice_amount,
    })))
  }

  return (
    <div className="min-h-screen bg-[#F3F7F8] pb-12" dir="rtl">
      <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin')} className="rounded-full bg-white/20 p-2 hover:bg-white/30"><ArrowLeft size={24} /></button>
          <div>
            <h1 className="text-2xl font-black">مطابقة بي كونكت وحساب الدليفري</h1>
            <p className="text-sm text-white/80">الدورة الحالية: {period.start} إلى {period.end} — الفاشل لا يحتسب، والتكرار يحتاج مراجعة</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Kpi label="تسجيلات الدليفري" value={orders.length} />
          <Kpi label="محتسبة بعد المطابقة" value={countedTotal} tone="green" />
          <Kpi label="فاشلة لا تحتسب" value={failedTotal} tone="red" />
          <Kpi label="غير موجودة ببي كونكت" value={notFoundTotal} tone="red" />
          <Kpi label="فواتير مكررة" value={duplicateTotal} tone="amber" />
          <Kpi label="أوردرات ×1.5" value={multiplierTotal} tone="blue" />
          <Kpi label="محذوفة محفوظة" value={deletedTotal} tone="amber" />
          <Kpi label="قيد المراجعة" value={pendingTotal} tone="blue" />
          <Kpi label="مؤشر مخاطر" value={riskTotal} tone="red" />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={printMonthlyReport} className="flex items-center gap-2 rounded-2xl bg-[#061827] px-5 py-3 font-black text-white shadow-sm hover:bg-[#0b2a42]">
            <Printer size={18} /> تصدير تقرير نهاية الدورة PDF
          </button>
          <button onClick={exportSummaryCsv} className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-sm hover:bg-emerald-700">
            <Download size={18} /> CSV ملخص المندوبين
          </button>
          <button onClick={exportOrdersCsv} className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-sm hover:bg-blue-700">
            <Download size={18} /> CSV تفاصيل الفواتير
          </button>
          {missingFromRiders.length > 0 && (
            <button onClick={exportMissingBconnectCsv} className="flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 font-black text-white shadow-sm hover:bg-amber-600">
              <Download size={18} /> CSV فواتير غير مسجلة
            </button>
          )}
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xl font-black text-[#061827]">ملخص المندوبين للدورة الحالية</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 text-right">المندوب</th>
                  <th className="p-2">1</th>
                  <th className="p-2">×1.5</th>
                  <th className="p-2">وحدات</th>
                  <th className="p-2">فاشل</th>
                  <th className="p-2">غير موجود</th>
                  <th className="p-2">مكرر</th>
                  <th className="p-2">مشاوير معلقة</th>
                  <th className="p-2">مخاطر</th>
                </tr>
              </thead>
              <tbody>
                {riderSummaryRows.map(row => (
                  <tr key={row.rider.id} className="border-t">
                    <td className="p-2 font-black">{row.rider.name}</td>
                    <td className="p-2 text-center">{row.normal}</td>
                    <td className="p-2 text-center">{row.multiplier}</td>
                    <td className="p-2 text-center font-black text-emerald-700">{row.countedUnits}</td>
                    <td className="p-2 text-center text-rose-700">{row.failed}</td>
                    <td className="p-2 text-center text-rose-700">{row.notFound}</td>
                    <td className="p-2 text-center text-amber-700">{row.duplicates}</td>
                    <td className="p-2 text-center text-blue-700">{row.pendingTrips}</td>
                    <td className={`p-2 text-center font-black ${row.riskScore > 5 ? 'text-rose-700' : row.riskScore > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{row.riskScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dawaa-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-black"><FileSpreadsheet size={22} /> رفع ملف فواتير السيستم للدورة</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} disabled={uploading} className="flex-1 rounded-xl border bg-white p-3" />
            <button disabled={uploading} className="dawaa-btn-primary bg-[#008E92] hover:bg-[#05777B] flex items-center justify-center gap-2">
              <Upload size={20} /> {uploading ? 'جاري المطابقة...' : 'رفع ومطابقة'}
            </button>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-500">بعد الرفع سيحدد النظام: الفواتير الصحيحة، الفاشلة، غير الموجودة في ملف السيستم، المكررة، وأوردرات ×1.5 للمراجعة.</p>
        </div>

        {report && (
          <div className="rounded-3xl border border-teal-200 bg-teal-50 p-5">
            <h3 className="mb-3 text-lg font-black text-teal-800">نتيجة آخر مطابقة</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Kpi label="فواتير التوصيل في الملف" value={report.bconnectInvoices} />
              <Kpi label="المظبوط المحتسب" value={report.counted} tone="green" />
              <Kpi label="تلاعب/غير موجود" value={report.notFound} tone="red" />
              <Kpi label="فاشل مستبعد" value={report.failedExcluded} tone="red" />
              <Kpi label="فواتير لم يسجلها دليفري" value={report.bconnectWithoutRider} tone="amber" />
            </div>
          </div>
        )}

        {hasDrillFilters && (
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-emerald-800">فلاتر نشطة:</span>
              {Object.entries(activeDrillFilters).map(([key, value]) => (
                <span key={key} className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700 shadow-sm">{key}: {value}</span>
              ))}
              <button type="button" onClick={() => navigate('/admin/reconciliation')} className="cursor-pointer rounded-full bg-[#008E92] px-4 py-2 text-xs font-black text-white transition hover:-translate-y-0.5 hover:shadow-lg">
                مسح الفلاتر
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>الكل ({orders.length})</FilterButton>
            <FilterButton active={filter === 'counted'} onClick={() => setFilter('counted')}>محتسبة ({countedTotal})</FilterButton>
            <FilterButton active={filter === 'failed'} onClick={() => setFilter('failed')}>فاشلة ({failedTotal})</FilterButton>
            <FilterButton active={filter === 'not_found'} onClick={() => setFilter('not_found')}>غير موجودة ({notFoundTotal})</FilterButton>
            <FilterButton active={filter === 'duplicate'} onClick={() => setFilter('duplicate')}>مكررة ({duplicateTotal})</FilterButton>
            <FilterButton active={filter === 'multiplier'} onClick={() => setFilter('multiplier')}>×1.5 ({multiplierTotal})</FilterButton>
            <FilterButton active={filter === 'deleted'} onClick={() => setFilter('deleted')}>محذوفة ({deletedTotal})</FilterButton>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-3 text-slate-400" size={20} />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث برقم الفاتورة أو العميل أو الدليفري" className="dawaa-input pr-10" />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-8 text-center font-bold text-slate-500">مفيش نتائج</div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map(order => {
              const rider = riderMap.get(order.rider_id)
              const inv = normalizeOrderInvoice(order)
              const finalStatus = (order as any).final_count_status || 'pending'
              const isCounted = (order as any).is_countable === true || finalStatus === 'counted'
              return (
                <div key={order.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-lg font-black">فاتورة {inv}</span>
                        <StatusPill counted={isCounted} status={order.status} finalStatus={finalStatus} />
                        {(order.order_multiplier ?? 1) >= 1.5 && <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">×1.5 مراجعة</span>}
                        {(duplicateInvoiceSet.has(inv) || order.is_duplicate_invoice) && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">مكرر</span>}
                        {(order as any).deleted_at && <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-black text-slate-700">محذوف محفوظ</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                        <Info label="الدليفري" value={rider?.name || (order as any).rider_name || 'غير محدد'} />
                        <Info label="العميل" value={order.customer_name_snapshot || (order as any).customer_name || 'غير محدد'} />
                        <Info label="كود العميل" value={(order as any).customer_code_snapshot || (order as any).customer_code || '—'} />
                        <Info label="التليفون" value={order.customer_phone_snapshot || (order as any).customer_phone || '—'} />
                        <Info label="قيمة الفاتورة" value={formatMoney(order.invoice_amount || (order as any).invoice_value || 0)} />
                        <Info label="حالة بي كونكت" value={order.bconnect_match_status || 'pending'} />
                        <Info label="سبب الاستبعاد" value={(order as any).count_exclusion_reason || '—'} />
                        <Info label="دكتور التحضير" value={(order as any).preparing_doctor_name || '—'} />
                      </div>
                      {(order as any).reconciliation_notes && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm font-bold text-slate-600">{(order as any).reconciliation_notes}</p>}
                      {(order as any).deletion_reason && <p className="mt-2 rounded-lg bg-slate-100 p-2 text-sm font-bold text-slate-700">سبب الحذف: {(order as any).deletion_reason}</p>}
                      {(order as any).reassignment_reason && <p className="mt-2 rounded-lg bg-blue-50 p-2 text-sm font-bold text-blue-700">سبب التحويل: {(order as any).reassignment_reason}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 sm:flex-col">
                      {!(order as any).deleted_at ? (
                        <>
                          <button onClick={() => openEditOrder(order)} className="flex items-center gap-2 rounded-xl bg-amber-100 px-4 py-2 font-black text-amber-800 hover:bg-amber-200"><Pencil size={18} /> تعديل البيانات</button>
                          <button onClick={() => handleManualMatch(order.id)} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-black text-white hover:bg-emerald-600"><CheckCircle2 size={18} /> اعتماد يدوي</button>
                          <button onClick={() => handleMarkNotFound(order.id)} className="flex items-center gap-2 rounded-xl bg-rose-100 px-4 py-2 font-black text-rose-700 hover:bg-rose-200"><XCircle size={18} /> استبعاد</button>
                          <button onClick={() => handleReassign(order)} className="flex items-center gap-2 rounded-xl bg-blue-100 px-4 py-2 font-black text-blue-700 hover:bg-blue-200">🔁 تحويل لمندوب</button>
                          <button onClick={() => handleSoftDelete(order)} className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 font-black text-slate-700 hover:bg-slate-200"><Trash2 size={18} /> حذف مع حفظ البيان</button>
                        </>
                      ) : (
                        <button onClick={() => handleRestore(order)} className="flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-2 font-black text-emerald-700 hover:bg-emerald-200"><RotateCcw size={18} /> استعادة</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {missingFromRiders.length > 0 && (
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-black text-amber-700"><AlertTriangle size={20} /> فواتير موجودة في بي كونكت ولم يسجلها أي دليفري</h3>
            <div className="max-h-72 overflow-auto text-sm">
              {missingFromRiders.map(row => <div key={row.invoice_number} className="grid grid-cols-4 gap-2 border-b py-2"><span>{row.invoice_number}</span><span>{row.customer_code}</span><span>{row.customer_name}</span><span>{row.phone}</span></div>)}
            </div>
          </div>
        )}

        {editingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl" dir="rtl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-slate-900">تعديل بيانات الأوردر</h3>
                  <p className="mt-1 text-sm font-bold text-slate-500">استخدمها لو الدليفري كتب كود العميل مكان رقم الفاتورة أو أخطأ في بيانات العميل.</p>
                </div>
                <button onClick={() => setEditingOrder(null)} className="rounded-full bg-slate-100 px-3 py-2 font-black text-slate-600 hover:bg-slate-200">إغلاق</button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <EditField label="رقم الفاتورة الصحيح" value={editForm.invoice_number} onChange={value => setEditForm(prev => ({ ...prev, invoice_number: value }))} autoFocus />
                <EditField label="قيمة الفاتورة" value={editForm.invoice_amount} onChange={value => setEditForm(prev => ({ ...prev, invoice_amount: value }))} />
                <EditField label="كود العميل" value={editForm.customer_code} onChange={value => setEditForm(prev => ({ ...prev, customer_code: value }))} />
                <EditField label="اسم العميل" value={editForm.customer_name} onChange={value => setEditForm(prev => ({ ...prev, customer_name: value }))} />
                <EditField label="تليفون العميل" value={editForm.customer_phone} onChange={value => setEditForm(prev => ({ ...prev, customer_phone: value }))} />
                <EditField label="ملاحظات الأوردر" value={editForm.notes} onChange={value => setEditForm(prev => ({ ...prev, notes: value }))} />
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-sm font-black text-slate-700">سبب التعديل — إجباري</label>
                <textarea
                  value={editForm.edit_reason}
                  onChange={e => setEditForm(prev => ({ ...prev, edit_reason: e.target.value }))}
                  placeholder="مثال: الدليفري كتب كود العميل مكان رقم الفاتورة، وتم التصحيح بعد مراجعة الريسيت"
                  className="dawaa-input min-h-[92px] w-full"
                />
              </div>

              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                بعد الحفظ سيتم إرجاع الأوردر إلى حالة "قيد المطابقة"، وبعدها ارفع ملف السيستم مرة أخرى أو اعتمده يدويًا إذا تأكدت من صحته.
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button onClick={handleSaveOrderEdit} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-700">
                  <CheckCircle2 size={18} /> حفظ التعديل وإعادة المطابقة
                </button>
                <button onClick={() => setEditingOrder(null)} className="rounded-2xl bg-slate-100 px-4 py-3 font-black text-slate-700 hover:bg-slate-200">إلغاء</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function Kpi({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'green' | 'red' | 'amber' | 'blue' }) {
  const cls = tone === 'green' ? 'text-emerald-700 bg-emerald-50' : tone === 'red' ? 'text-rose-700 bg-rose-50' : tone === 'amber' ? 'text-amber-700 bg-amber-50' : tone === 'blue' ? 'text-blue-700 bg-blue-50' : 'text-slate-800 bg-white'
  return <div className={`rounded-2xl p-4 text-center shadow-sm ${cls}`}><p className="text-2xl font-black">{value}</p><p className="text-xs font-bold">{label}</p></div>
}

function EditField({ label, value, onChange, autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-black text-slate-700">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="dawaa-input w-full"
      />
    </label>
  )
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-black ${active ? 'bg-[#008E92] text-white' : 'bg-white text-slate-700'}`}>{children}</button>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-slate-500">{label}</p><p className="font-bold">{value}</p></div>
}

function StatusPill({ counted, status, finalStatus }: { counted: boolean; status: string; finalStatus: string }) {
  if (status === 'failed') return <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-black text-rose-700">فاشل لا يحتسب</span>
  if (counted) return <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">محتسب</span>
  if (finalStatus.includes('not_found')) return <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-black text-rose-700">غير موجود</span>
  return <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">تحت المراجعة</span>
}
