import { OperationalPeriod } from './types'

// ─── Operational Period ───────────────────────────────────────────────────────

export function getOperationalPeriod(date: Date = new Date()): OperationalPeriod {
  const day = date.getDate()
  const month = date.getMonth()
  const year = date.getFullYear()

  let start: Date
  let end: Date

  if (day >= 26) {
    start = new Date(year, month, 26)
    end = new Date(year, month + 1, 25)
  } else {
    start = new Date(year, month - 1, 26)
    end = new Date(year, month, 25)
  }

  return {
    start: localIsoDate(start),
    end: localIsoDate(end),
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function localIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Returns today's date as YYYY-MM-DD in local time. Single source of truth — do not redefine elsewhere. */
export function todayIso(): string {
  return localIsoDate(new Date())
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return 'غير محدد'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return String(date)
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return 'غير محدد'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return String(date)
  return d.toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(date: string | null | undefined): string {
  if (!date) return 'غير محدد'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return String(date)
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

export function calculateMinutesBetween(start: string, end: string): number {
  return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60_000)
}

// ─── Financial ────────────────────────────────────────────────────────────────

export function formatMoney(value: number | null | undefined): string {
  const numeric = Number(value ?? 0)
  return `${numeric.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`
}

export function getRiderRates(level: 'junior' | 'mid' | 'senior') {
  const rates = {
    junior: { hourly_rate: 19.25, order_rate: 6, trip_rate: 3, monthly_incentive_base: 750, quarterly_incentive_base: 750 },
    mid:    { hourly_rate: 21.5,  order_rate: 8, trip_rate: 4, monthly_incentive_base: 750, quarterly_incentive_base: 750 },
    senior: { hourly_rate: 23,    order_rate: 10, trip_rate: 4, monthly_incentive_base: 1000, quarterly_incentive_base: 1000 },
  }
  return rates[level]
}

export function calculateIncentivePercentage(score: number): number {
  if (score >= 95) return 1.0
  if (score >= 90) return 0.95
  if (score >= 80) return 0.8
  if (score >= 70) return 0.6
  return 0
}

// ─── Search ───────────────────────────────────────────────────────────────────

export function wildcardMatchText(value: string, rawQuery: string): boolean {
  const q = String(rawQuery || '').trim().toLowerCase()
  const v = String(value || '').trim().toLowerCase()
  if (!q) return true
  if (!q.includes('*')) return v.includes(q)
  const parts = q.split('*').map(x => x.trim()).filter(Boolean)
  if (!parts.length) return true
  let cursor = 0
  for (const part of parts) {
    const idx = v.indexOf(part, cursor)
    if (idx === -1) return false
    cursor = idx + part.length
  }
  return true
}

// ─── CSV export (shared — do NOT redefine in page components) ─────────────────

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function downloadCsv(fileName: string, rows: Array<Record<string, unknown>>): void {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csvLines = [
    '\ufeff' + headers.map(csvCell).join(','),
    ...rows.map(row => headers.map(h => csvCell(row[h])).join(',')),
  ]
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Label maps ───────────────────────────────────────────────────────────────

export const TRIP_TYPE_LABELS: Record<string, string> = {
  branch_to_branch:      'بين الفروع',
  warehouse:             'مخزن',
  supplies:              'مستلزمات',
  pharmacy:              'صيدلية',
  shipment_pickup:       'استلام شحن',
  accessories:           'إكسسوار',
  purchase_missing_item: 'شراء نواقص',
  supplier:              'مورد',
  returns:               'مرتجع',
  collection:            'تحصيل',
  visit_again:           'زيارة تانية',
  customer_second_visit: 'زيارة تانية للعميل',
  other:                 'أخرى',
}

export const DUPLICATE_REASON_LABELS: Record<string, string> = {
  return:             'مرتجع',
  preparation_error:  'خطأ في تحضير الأوردر',
  invoice_correction: 'تعديل على الفاتورة',
  second_visit:       'روحت للعميل تاني',
  other:              'سبب آخر',
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  registered:   'متسجل',
  ready:        'جاهز للتسليم',
  dispatched:   'خرج من الفرع',
  picked_up:    'مع الدليفري',
  delivered:    'تم التسليم',
  failed:       'فشل',
  cancelled:    'ملغي',
  under_review: 'تحت المراجعة',
  needs_review: 'مراجعة',
}

export const TRIP_STATUS_LABELS: Record<string, string> = {
  pending_approval: 'في الانتظار',
  approved:         'معتمد',
  rejected:         'مرفوض',
  completed:        'مكتمل',
  cancelled:        'ملغي',
}
