import type { DeliveryOrder } from './types'

export function formatClock(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

export function minutesBetween(start?: string | null, end?: string | null) {
  if (!start) return null
  const a = new Date(start).getTime()
  const b = end ? new Date(end).getTime() : Date.now()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.max(0, Math.round((b - a) / 60000))
}

export function formatMinutes(minutes?: number | null) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—'
  if (minutes < 60) return `${minutes} دقيقة`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} س ${m} د` : `${h} ساعة`
}

export function getOrderTimelineStatus(order: Partial<DeliveryOrder> & Record<string, any>) {
  if (order.delivered_at || order.status === 'delivered') return { label: 'تم التسليم', tone: 'emerald' as const }
  if (order.failed_at || order.status === 'failed') return { label: 'فشل التسليم', tone: 'red' as const }
  if (order.picked_up_at) return { label: 'مع الدليفري', tone: 'sky' as const }
  if (order.dispatched_at) return { label: 'خرج من الفرع', tone: 'cyan' as const }
  if (order.ready_at) return { label: 'جاهز للخروج', tone: 'amber' as const }
  return { label: 'لم يخرج بعد', tone: 'slate' as const }
}

export function getDispatchAgeLabel(order: Partial<DeliveryOrder> & Record<string, any>) {
  if (!order.dispatched_at) return 'لم يخرج بعد'
  const mins = minutesBetween(order.dispatched_at, order.delivered_at || null)
  return `منذ الخروج: ${formatMinutes(mins)}`
}

export function getPrepareAgeLabel(order: Partial<DeliveryOrder> & Record<string, any>) {
  if (!order.registered_at) return 'وقت التسجيل غير محدد'
  const mins = minutesBetween(order.registered_at, order.dispatched_at || null)
  return order.dispatched_at ? `مدة قبل الخروج: ${formatMinutes(mins)}` : `منتظر خروج منذ: ${formatMinutes(mins)}`
}

export function orderTimelineSummary(order: Partial<DeliveryOrder> & Record<string, any>) {
  return [
    { label: 'تسجيل', value: formatClock(order.registered_at || order.created_at) },
    { label: 'جاهز', value: formatClock(order.ready_at) },
    { label: 'خرج', value: formatClock(order.dispatched_at) },
    { label: 'استلام', value: formatClock(order.picked_up_at) },
    { label: 'تسليم', value: formatClock(order.delivered_at) },
  ]
}
