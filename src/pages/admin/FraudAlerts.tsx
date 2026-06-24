import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import AdminModuleShell, { ModuleMetric } from '../../components/AdminModuleShell'
import { supabase } from '../../lib/supabase'
import { getOperationalPeriod } from '../../lib/helpers'
import { isDuplicate, isOverdue, isDelivered, isFailed, minutesOpen, orderAmount } from '../../lib/deliveryAnalytics'
import type { DeliveryOrder, InternalTrip, Rider } from '../../lib/types'

type AlertRow = { key: string; type: string; severity: 'high' | 'medium' | 'low'; riderId?: string | null; riderName: string; invoice?: string; description: string; orderId?: string | null }
const labels: Record<string, string> = { duplicate_invoice: 'فاتورة مكررة', impossible_timing: 'توقيت غير منطقي', overdue: 'أوردر متأخر', missing_customer: 'عميل غير مسجل', missing_invoice: 'رقم فاتورة ناقص', zero_amount: 'مبلغ صفر', trip_without_proof: 'مشوار بدون إثبات', high_failed: 'فشل عالي' }

export default function FraudAlerts() {
  const period = useMemo(() => getOperationalPeriod(), [])
  const navigate = useNavigate()
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)
  const [resolved, setResolved] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [o, t, r] = await Promise.all([
      supabase.from('delivery_orders').select('*').gte('work_date', period.start).lte('work_date', period.end).limit(20000),
      supabase.from('internal_trips').select('*').gte('work_date', period.start).lte('work_date', period.end).limit(10000),
      supabase.from('riders').select('*'),
    ])
    setOrders((o.data || []) as DeliveryOrder[])
    setTrips((t.data || []) as InternalTrip[])
    setRiders((r.data || []) as Rider[])
    setLoading(false)
  }, [period])
  useEffect(() => { void load() }, [load])

  const riderMap = useMemo(() => new Map(riders.map(r => [r.id, r])), [riders])
  const signals = useMemo<AlertRow[]>(() => {
    const rows: AlertRow[] = []
    orders.forEach((o: any) => {
      const rider = riderMap.get(o.rider_id)
      const riderName = rider?.name || rider?.username || 'غير محدد'
      const invoice = String(o.invoice_number || o.invoice_no || '')
      if (isDuplicate(o)) rows.push({ key: `dup-${o.id}`, type: 'duplicate_invoice', severity: 'medium', riderId: o.rider_id, riderName, invoice, orderId: o.id, description: `الفاتورة ${invoice || 'بدون رقم'} عليها علامة تكرار وتحتاج اعتماد أو رفض.` })
      if (isOverdue(o, 120)) rows.push({ key: `late2-${o.id}`, type: 'overdue', severity: 'high', riderId: o.rider_id, riderName, invoice, orderId: o.id, description: `الأوردر مفتوح منذ ${minutesOpen(o)} دقيقة ولم يتم تسليمه.` })
      else if (isOverdue(o, 60)) rows.push({ key: `late1-${o.id}`, type: 'overdue', severity: 'medium', riderId: o.rider_id, riderName, invoice, orderId: o.id, description: `الأوردر متأخر أكثر من ساعة: ${minutesOpen(o)} دقيقة.` })
      if (!invoice) rows.push({ key: `noinv-${o.id}`, type: 'missing_invoice', severity: 'high', riderId: o.rider_id, riderName, orderId: o.id, description: 'أوردر بدون رقم فاتورة، يجب تصحيحه قبل المطابقة.' })
      const customerName = String(o.customer_name || o.customer_name_snapshot || '')
      const phone = String(o.customer_phone || o.customer_phone_snapshot || '')
      if (!o.customer_id && (!customerName || customerName.includes('غير مسجل') || !phone)) rows.push({ key: `cust-${o.id}`, type: 'missing_customer', severity: 'high', riderId: o.rider_id, riderName, invoice, orderId: o.id, description: 'الأوردر محفوظ على عميل غير مسجل أو بيانات العميل ناقصة.' })
      if (orderAmount(o) <= 0 && isDelivered(o)) rows.push({ key: `zero-${o.id}`, type: 'zero_amount', severity: 'medium', riderId: o.rider_id, riderName, invoice, orderId: o.id, description: 'أوردر تم تسليمه بقيمة صفر، يحتاج مراجعة.' })
      if (o.registered_at && o.delivered_at) {
        const diff = Math.floor((new Date(o.delivered_at).getTime() - new Date(o.registered_at).getTime()) / 60000)
        if (diff >= 0 && diff < 3) rows.push({ key: `fast-${o.id}`, type: 'impossible_timing', severity: 'high', riderId: o.rider_id, riderName, invoice, orderId: o.id, description: `تم تسجيل وتسليم الفاتورة خلال ${diff} دقيقة فقط.` })
      }
    })
    riders.forEach(r => {
      const ro = orders.filter(o => o.rider_id === r.id)
      const failed = ro.filter(isFailed).length
      if (ro.length >= 10 && failed / ro.length >= 0.25) rows.push({ key: `fail-${r.id}`, type: 'high_failed', severity: 'medium', riderId: r.id, riderName: r.name || r.username || 'غير محدد', description: `نسبة فشل مرتفعة: ${failed} من ${ro.length} أوردر.` })
    })
    trips.forEach((t: any) => {
      if (!t.has_invoice_reference && !t.proof_image_url) rows.push({ key: `tripproof-${t.id}`, type: 'trip_without_proof', severity: 'medium', riderId: t.rider_id, riderName: riderMap.get(t.rider_id)?.name || 'غير محدد', description: `مشوار بدون فاتورة وبدون صورة إثبات: ${t.from_label || '—'} إلى ${t.to_label || '—'}.` })
    })
    return rows.filter(s => !resolved.includes(s.key)).sort((a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1))
  }, [orders, trips, riders, riderMap, resolved])

  const high = signals.filter(s => s.severity === 'high')
  async function resolve(key: string, signal: AlertRow) {
    setResolved(v => [...v, key])
    await supabase.from('fraud_signals').insert({ order_id: signal.orderId || null, rider_id: signal.riderId || null, signal_type: signal.type, severity: signal.severity, description: signal.description, status: 'resolved', reviewed_at: new Date().toISOString(), resolution_notes: 'تمت المراجعة من مركز الحماية' })
  }

  return <AdminModuleShell title="مركز الحماية وكشف الأنماط" subtitle="مراجعة يومية للتلاعب والتأخير والبيانات الناقصة" icon={<ShieldAlert/>} loading={loading} onRefresh={load}>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><ModuleMetric label="إشارات مفتوحة" value={signals.length} hint="خلال الدورة" tone="amber"/><ModuleMetric label="عالية الخطورة" value={high.length} hint="أولوية فورية" tone="rose"/><ModuleMetric label="عملاء غير مسجلين" value={signals.filter(s => s.type === 'missing_customer').length} hint="يجب التصحيح" tone="rose"/><ModuleMetric label="تمت مراجعتها" value={resolved.length} hint="هذه الجلسة"/></section>
    <div className="mt-5 grid gap-3 lg:grid-cols-2">{signals.map(s => <article key={s.key} className={`rounded-[1.6rem] border bg-white p-5 shadow-sm ${s.severity === 'high' ? 'border-rose-200' : 'border-amber-200'}`}><div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${s.severity === 'high' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{s.severity === 'high' ? 'خطورة عالية' : 'تحتاج مراجعة'}</span><h2 className="mt-3 font-black">{labels[s.type] || s.type}</h2><p className="mt-1 text-sm font-bold leading-6 text-slate-500">{s.description}</p>{s.invoice && <p className="mt-1 text-xs font-black text-slate-400">فاتورة: {s.invoice}</p>}</div><ShieldAlert className={s.severity === 'high' ? 'text-rose-500' : 'text-amber-500'}/></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3"><span className="text-xs font-black text-slate-600">الدليفري: {s.riderName}</span><div className="flex gap-2"><button onClick={() => s.invoice && navigate(`/admin/reconciliation?invoice_number=${encodeURIComponent(s.invoice)}`)} className="rounded-xl border px-3 py-2 text-xs font-black text-slate-600">فتح الأوردر</button><button onClick={() => void resolve(s.key, s)} className="rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white">تمت المراجعة</button></div></div></article>)}{!signals.length && <div className="col-span-full rounded-3xl border bg-white p-16 text-center font-black text-emerald-700">لا توجد أنماط مشبوهة مفتوحة في الدورة الحالية ✓</div>}</div>
  </AdminModuleShell>
}
