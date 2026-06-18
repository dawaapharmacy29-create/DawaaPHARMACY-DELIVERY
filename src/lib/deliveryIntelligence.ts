import type { DeliveryOrder, Rider } from './types'

export type FraudSignal = {
  key: string
  orderId?: string
  riderId: string
  riderName: string
  type: 'duplicate_invoice' | 'impossible_timing' | 'sequential_same_code'
  severity: 'medium' | 'high'
  description: string
  detectedAt: string
}

const invoice = (o: any) => String(o.invoice_number || o.invoice_no || '').trim()
const customerCode = (o: any) => String(o.customer_code_snapshot || o.customer_code || '').trim()
const orderDay = (o: any) => o.delivery_date || o.work_date || String(o.registered_at || '').slice(0, 10)

export function detectFraudSignals(orders: DeliveryOrder[], riders: Rider[]): FraudSignal[] {
  const signals: FraudSignal[] = []
  const riderMap = new Map(riders.map(r => [r.id, r]))
  const invoiceMap = new Map<string, DeliveryOrder[]>()

  orders.forEach(o => {
    const number = invoice(o)
    if (!number) return
    const key = `${number}|${orderDay(o)}`
    invoiceMap.set(key, [...(invoiceMap.get(key) || []), o])
  })
  invoiceMap.forEach(group => {
    if (new Set(group.map(o => o.rider_id)).size <= 1) return
    group.forEach(o => signals.push({
      key: `duplicate-${o.id}`, orderId: o.id, riderId: o.rider_id,
      riderName: riderMap.get(o.rider_id)?.name || 'غير محدد', type: 'duplicate_invoice', severity: 'high',
      description: `الفاتورة ${invoice(o)} مسجلة مع أكثر من دليفري في نفس اليوم`, detectedAt: new Date().toISOString(),
    }))
  })

  orders.forEach(o => {
    if (o.status !== 'delivered' || !o.delivered_at || !o.registered_at) return
    const minutes = (new Date(o.delivered_at).getTime() - new Date(o.registered_at).getTime()) / 60000
    if (minutes > 0 && minutes < 5) signals.push({
      key: `timing-${o.id}`, orderId: o.id, riderId: o.rider_id,
      riderName: riderMap.get(o.rider_id)?.name || 'غير محدد', type: 'impossible_timing', severity: 'high',
      description: `الفاتورة ${invoice(o) || 'بدون رقم'} سُلّمت خلال ${Math.round(minutes)} دقائق فقط`, detectedAt: new Date().toISOString(),
    })
  })

  const useMap = new Map<string, DeliveryOrder[]>()
  orders.forEach(o => {
    const code = customerCode(o)
    if (!code) return
    const key = `${o.rider_id}|${code}|${orderDay(o)}`
    useMap.set(key, [...(useMap.get(key) || []), o])
  })
  useMap.forEach((group, key) => {
    if (group.length < 3) return
    const [riderId, code] = key.split('|')
    signals.push({
      key: `code-${key}`, riderId, riderName: riderMap.get(riderId)?.name || 'غير محدد',
      type: 'sequential_same_code', severity: 'medium',
      description: `كود العميل ${code} استُخدم ${group.length} مرات في يوم واحد`, detectedAt: new Date().toISOString(),
    })
  })
  return signals
}

export function minutesSince(value?: string | null) {
  if (!value) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
}
