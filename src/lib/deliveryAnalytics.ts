export type CycleRange = { start: string; end: string }

export function isoDate(value: Date = new Date()) {
  return value.toISOString().slice(0, 10)
}

export function getCycleRange(date: Date = new Date()): CycleRange {
  const y = date.getFullYear()
  const m = date.getMonth()
  const d = date.getDate()
  const start = d >= 26 ? new Date(y, m, 26) : new Date(y, m - 1, 26)
  const end = d >= 26 ? new Date(y, m + 1, 25) : new Date(y, m, 25)
  return { start: isoDate(start), end: isoDate(end) }
}

export function monthRange(month: string): CycleRange {
  const start = `${month}-01`
  const endDate = new Date(`${start}T00:00:00`)
  endDate.setMonth(endDate.getMonth() + 1)
  endDate.setDate(0)
  return { start, end: isoDate(endDate) }
}

export function normalizePhone(value: any) {
  let digits = String(value || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D+/g, '')
  if (digits.startsWith('0020')) digits = digits.slice(4)
  if (digits.startsWith('20') && digits.length === 12) digits = digits.slice(2)
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`
  return digits
}

export function num(value: any) { return Number(value || 0) || 0 }
export function orderAmount(order: any) { return num(order?.invoice_amount ?? order?.invoice_value ?? order?.amount ?? order?.total_amount) }
export function orderDate(order: any) { return String(order?.work_date || order?.delivery_date || order?.registered_at || order?.created_at || '').slice(0, 10) }
export function orderTs(order: any) { return String(order?.registered_at || order?.created_at || order?.work_date || '') }
export function orderCustomerKey(order: any) { return String(order?.customer_id || order?.customer_code || order?.customer_code_snapshot || normalizePhone(order?.customer_phone || order?.customer_phone_snapshot) || order?.customer_name || order?.customer_name_snapshot || '').trim() }

export function isDeleted(row: any) { return Boolean(row?.deleted_at) }
export function isDelivered(order: any) { return ['delivered', 'completed', 'تم التسليم'].includes(String(order?.status || '').toLowerCase()) || Boolean(order?.delivered_at) }
export function isFailed(order: any) { const s = String(order?.status || '').toLowerCase(); return s === 'failed' || s.includes('fail') || Boolean(order?.failed_at || order?.failed_reason) }
export function isPending(order: any) { return !isDelivered(order) && !isFailed(order) && !isDeleted(order) }
export function isMultiplier(order: any) { return Number(order?.order_multiplier ?? (order?.is_multiplier_order ? 1.5 : 1)) >= 1.5 }
export function isDuplicate(order: any) { return Boolean(order?.is_duplicate_invoice || order?.duplicate_warning || String(order?.duplicate_review_status || '').includes('pending')) }
export function isUncounted(order: any) { const s = String(order?.count_status || order?.reconciliation_status || order?.review_status || '').toLowerCase(); return Boolean(order?.not_countable || order?.excluded_from_incentive || order?.is_countable === false) || ['rejected', 'not_countable', 'excluded', 'invoice_not_found'].includes(s) }
export function isReview(order: any) { const s = String(order?.review_status || order?.status || '').toLowerCase(); return Boolean(order?.needs_review) || ['pending', 'needs_review', 'registered', 'pending_review', 'pending_reconciliation'].includes(s) }

export function minutesOpen(order: any, now = Date.now()) {
  const raw = order?.registered_at || order?.created_at || order?.delivery_date || order?.work_date
  const t = raw ? new Date(raw).getTime() : NaN
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / 60000))
}
export function isOverdue(order: any, minutes = 60) { return isPending(order) && minutesOpen(order) >= minutes }

export function money(value: any) {
  return `${num(value).toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ج`
}

export function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  const map = new Map<string, T[]>()
  rows.forEach(row => {
    const key = getKey(row) || 'غير محدد'
    map.set(key, [...(map.get(key) || []), row])
  })
  return map
}

export function riderOrderStats(orders: any[]) {
  const clean = orders.filter(o => !isDeleted(o))
  const delivered = clean.filter(isDelivered)
  const failed = clean.filter(isFailed)
  const pending = clean.filter(isPending)
  const multiplier = clean.filter(isMultiplier)
  const oneX = clean.filter(o => !isMultiplier(o) && !isFailed(o))
  const duplicate = clean.filter(isDuplicate)
  const uncounted = clean.filter(isUncounted)
  const overdue60 = clean.filter(o => isOverdue(o, 60))
  const overdue120 = clean.filter(o => isOverdue(o, 120))
  return {
    total: clean.length,
    delivered: delivered.length,
    failed: failed.length,
    pending: pending.length,
    multiplier: multiplier.length,
    oneX: oneX.length,
    duplicate: duplicate.length,
    uncounted: uncounted.length,
    overdue60: overdue60.length,
    overdue120: overdue120.length,
    cash: clean.reduce((s, o) => s + orderAmount(o), 0),
  }
}
