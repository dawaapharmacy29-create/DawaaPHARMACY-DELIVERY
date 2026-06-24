import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banknote, CheckCircle2, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AdminModuleShell, { ModuleMetric } from '../../components/AdminModuleShell'
import { supabase } from '../../lib/supabase'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'
import { isDelivered, isMultiplier, orderAmount } from '../../lib/deliveryAnalytics'
import type { DeliveryOrder, InternalTrip, Rider } from '../../lib/types'

export default function CashFlowDashboard() {
  const navigate = useNavigate()
  const cycle = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [o, t, r] = await Promise.all([
      supabase.from('delivery_orders').select('*').gte('work_date', cycle.start).lte('work_date', cycle.end).limit(20000),
      supabase.from('internal_trips').select('*').gte('work_date', cycle.start).lte('work_date', cycle.end).limit(10000),
      supabase.from('riders').select('*').eq('status', 'active'),
    ])
    setOrders((o.data || []) as DeliveryOrder[])
    setTrips((t.data || []) as InternalTrip[])
    setRiders((r.data || []) as Rider[])
    setLoading(false)
  }, [cycle])
  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => riders.map((rider: any) => {
    const ro = orders.filter(o => o.rider_id === rider.id && isDelivered(o))
    const rt = trips.filter(t => t.rider_id === rider.id)
    const one = ro.filter(o => !isMultiplier(o))
    const multi = ro.filter(isMultiplier)
    const order1Rate = Number(rider.order_rate || rider.order_1x_rate || 0)
    const order15Rate = Number(rider.order_1_5x_rate || rider.multiplier_order_rate || order1Rate * 1.5 || 0)
    const tripRate = Number(rider.internal_trip_rate || rider.trip_rate || 0)
    const ordersPay = one.length * order1Rate + multi.length * order15Rate
    const tripsPay = rt.length * tripRate
    const cash = ro.reduce((s, o) => s + orderAmount(o), 0)
    return { rider, one: one.length, multi: multi.length, trips: rt.length, cash, ordersPay, tripsPay, due: ordersPay + tripsPay }
  }).filter(r => r.one || r.multi || r.trips || r.cash).sort((a, b) => b.cash - a.cash), [orders, trips, riders])

  const totals = useMemo(() => ({ one: rows.reduce((s,r)=>s+r.one,0), multi: rows.reduce((s,r)=>s+r.multi,0), trips: rows.reduce((s,r)=>s+r.trips,0), cash: rows.reduce((s,r)=>s+r.cash,0), ordersPay: rows.reduce((s,r)=>s+r.ordersPay,0), tripsPay: rows.reduce((s,r)=>s+r.tripsPay,0), due: rows.reduce((s,r)=>s+r.due,0) }), [rows])

  return <AdminModuleShell title="التدفق النقدي الشهري" subtitle={`كشف الدورة من ${cycle.start} إلى ${cycle.end}: أوردرات، مشاوير، كاش، ومستحقات`} icon={<Banknote/>} loading={loading} onRefresh={load}>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-7"><ModuleMetric label="أوردرات 1x" value={totals.one} hint="حسب الدورة"/><ModuleMetric label="أوردرات 1.5x" value={totals.multi} hint="بعيدة أو زيادة" tone="amber"/><ModuleMetric label="المشاوير" value={totals.trips} hint="كل المشاوير" tone="sky"/><ModuleMetric label="إجمالي النقدي" value={formatMoney(totals.cash)} hint="قيمة الفواتير" tone="teal"/><ModuleMetric label="حافز الأوردرات" value={formatMoney(totals.ordersPay)} hint="حسب سعر الدليفري" tone="violet"/><ModuleMetric label="حافز المشاوير" value={formatMoney(totals.tripsPay)} hint="حسب السعر" tone="sky"/><ModuleMetric label="إجمالي المستحق" value={formatMoney(totals.due)} hint="قبل الخصومات" tone="teal"/></section>
    <div className="mt-5 overflow-hidden rounded-[2rem] border bg-white shadow-sm"><div className="flex items-center gap-3 border-b p-5"><WalletCards className="text-teal-600"/><div><h2 className="font-black">كشف حساب الدليفري الشهري</h2><p className="text-xs font-bold text-slate-400">القيم تعتمد على أسعار كل دليفري داخل جدول riders</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4 text-right">الدليفري</th><th>1x</th><th>1.5x</th><th>المشاوير</th><th>النقدي</th><th>حافز الأوردرات</th><th>حافز المشاوير</th><th>المستحق</th><th>الحالة</th></tr></thead><tbody>{rows.map(r => <tr key={r.rider.id} className="border-t text-center"><td className="p-4 text-right"><button onClick={() => navigate(`/admin/riders/${r.rider.id}/performance`)} className="font-black text-[#008E92] hover:underline">{r.rider.name}</button></td><td>{r.one}</td><td>{r.multi}</td><td>{r.trips}</td><td>{formatMoney(r.cash)}</td><td>{formatMoney(r.ordersPay)}</td><td>{formatMoney(r.tripsPay)}</td><td className="font-black text-emerald-700">{formatMoney(r.due)}</td><td><span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={15}/> محسوب</span></td></tr>)}{!rows.length && <tr><td colSpan={9} className="p-12 text-center font-bold text-slate-400">لا توجد حركة في الدورة الحالية</td></tr>}</tbody></table></div></div>
  </AdminModuleShell>
}
