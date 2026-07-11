import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Banknote, CheckCircle2, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AdminModuleShell, { ModuleMetric } from '../../components/AdminModuleShell'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'
import { isDelivered, isMultiplier, orderAmount } from '../../lib/deliveryAnalytics'
import { loadCanonicalDeliveryData } from '../../lib/canonicalDeliveryData'
import type { DeliveryOrder, InternalTrip, Rider } from '../../lib/types'

type CashRow = {
  rider: Rider
  one: number
  multi: number
  trips: number
  pendingTrips: number
  cash: number
  ordersPay: number
  tripsPay: number
  due: number
  missingRates: boolean
}

const APPROVED_TRIP_STATUSES = new Set(['approved', 'completed', 'countable'])

function tripStatus(trip: any) {
  return String(trip.review_status || trip.status || '').toLowerCase()
}

export default function CashFlowDashboard() {
  const navigate = useNavigate()
  const cycle = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await loadCanonicalDeliveryData(cycle.start, cycle.end)
      setOrders(data.orders as DeliveryOrder[])
      setTrips(data.trips as InternalTrip[])
      setRiders(data.riders as Rider[])
    } catch (loadError: any) {
      setError(loadError?.message || 'تعذر تحميل بيانات التدفق النقدي')
    } finally {
      setLoading(false)
    }
  }, [cycle.start, cycle.end])

  useEffect(() => { void load() }, [load])

  const rows = useMemo<CashRow[]>(() => riders.map((rider: any) => {
    const deliveredOrders = orders.filter(order => order.rider_id === rider.id && isDelivered(order))
    const riderTrips = trips.filter(trip => trip.rider_id === rider.id)
    const approvedTrips = riderTrips.filter(trip => APPROVED_TRIP_STATUSES.has(tripStatus(trip)))
    const pendingTrips = riderTrips.length - approvedTrips.length
    const one = deliveredOrders.filter(order => !isMultiplier(order))
    const multi = deliveredOrders.filter(isMultiplier)

    const order1Rate = Number(rider.order_rate ?? rider.order_1x_rate ?? 0) || 0
    const explicit15Rate = Number(rider.order_1_5x_rate ?? rider.multiplier_order_rate ?? 0) || 0
    const order15Rate = explicit15Rate || order1Rate * 1.5
    const tripRate = Number(rider.internal_trip_rate ?? rider.trip_rate ?? 0) || 0

    const ordersPay = one.length * order1Rate + multi.length * order15Rate
    const tripsPay = approvedTrips.length * tripRate
    const cash = deliveredOrders.reduce((sum, order) => sum + orderAmount(order), 0)
    const missingRates = (deliveredOrders.length > 0 && order1Rate <= 0) || (approvedTrips.length > 0 && tripRate <= 0)

    return {
      rider,
      one: one.length,
      multi: multi.length,
      trips: approvedTrips.length,
      pendingTrips,
      cash,
      ordersPay,
      tripsPay,
      due: ordersPay + tripsPay,
      missingRates,
    }
  }).filter(row => row.one || row.multi || row.trips || row.pendingTrips || row.cash)
    .sort((a, b) => b.cash - a.cash), [orders, trips, riders])

  const totals = useMemo(() => ({
    one: rows.reduce((sum, row) => sum + row.one, 0),
    multi: rows.reduce((sum, row) => sum + row.multi, 0),
    trips: rows.reduce((sum, row) => sum + row.trips, 0),
    pendingTrips: rows.reduce((sum, row) => sum + row.pendingTrips, 0),
    cash: rows.reduce((sum, row) => sum + row.cash, 0),
    ordersPay: rows.reduce((sum, row) => sum + row.ordersPay, 0),
    tripsPay: rows.reduce((sum, row) => sum + row.tripsPay, 0),
    due: rows.reduce((sum, row) => sum + row.due, 0),
    missingRates: rows.filter(row => row.missingRates).length,
  }), [rows])

  return <AdminModuleShell title="التدفق النقدي الشهري" subtitle={`كشف الدورة من ${cycle.start} إلى ${cycle.end}: الأوردرات المسلمة، المشاوير المعتمدة، النقدي، والمستحقات`} icon={<Banknote/>} loading={loading} onRefresh={load}>
    {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 font-black text-rose-700">تعذر تحديث البيانات: {error}</div>}

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-7">
      <ModuleMetric label="أوردرات 1x" value={totals.one} hint="المسلمة فقط"/>
      <ModuleMetric label="أوردرات 1.5x" value={totals.multi} hint="المسلمة فقط" tone="amber"/>
      <ModuleMetric label="المشاوير المعتمدة" value={totals.trips} hint={totals.pendingTrips ? `${totals.pendingTrips} غير معتمد` : 'المعتمدة فقط'} tone="sky"/>
      <ModuleMetric label="إجمالي النقدي" value={formatMoney(totals.cash)} hint="قيمة الفواتير المسلمة" tone="teal"/>
      <ModuleMetric label="حافز الأوردرات" value={formatMoney(totals.ordersPay)} hint="حسب أسعار المناديب" tone="violet"/>
      <ModuleMetric label="حافز المشاوير" value={formatMoney(totals.tripsPay)} hint="للمشاوير المعتمدة" tone="sky"/>
      <ModuleMetric label="إجمالي المستحق" value={formatMoney(totals.due)} hint="قبل الخصومات" tone="teal"/>
    </section>

    {(totals.pendingTrips > 0 || totals.missingRates > 0) && <div className="mt-4 grid gap-3 md:grid-cols-2">
      {totals.pendingTrips > 0 && <button type="button" onClick={() => navigate('/admin/trips')} className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4 text-right font-black text-amber-800">
        <span><AlertTriangle className="ml-2 inline" size={18}/> يوجد {totals.pendingTrips} مشوار غير معتمد ولم يدخل في المستحقات</span>
        <span className="text-sm">فتح المشاوير</span>
      </button>}
      {totals.missingRates > 0 && <button type="button" onClick={() => navigate('/admin/riders')} className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-right font-black text-rose-800">
        <span><AlertTriangle className="ml-2 inline" size={18}/> يوجد {totals.missingRates} مندوب بأسعار ناقصة</span>
        <span className="text-sm">مراجعة البيانات</span>
      </button>}
    </div>}

    <div className="mt-5 overflow-hidden rounded-[2rem] border bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b p-5"><WalletCards className="text-teal-600"/><div><h2 className="font-black">كشف حساب الدليفري الشهري</h2><p className="text-xs font-bold text-slate-400">كل البيانات محملة بالكامل؛ الأوردرات المسلمة والمشاوير المعتمدة فقط تدخل في المستحقات</p></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4 text-right">الدليفري</th><th>1x</th><th>1.5x</th><th>مشاوير معتمدة</th><th>غير معتمدة</th><th>النقدي</th><th>حافز الأوردرات</th><th>حافز المشاوير</th><th>المستحق</th><th>الحالة</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.rider.id} className="border-t text-center"><td className="p-4 text-right"><button onClick={() => navigate(`/admin/riders/${row.rider.id}/performance`)} className="font-black text-[#008E92] hover:underline">{(row.rider as any).name || (row.rider as any).username || 'غير محدد'}</button></td><td>{row.one}</td><td>{row.multi}</td><td>{row.trips}</td><td className={row.pendingTrips ? 'font-black text-amber-700' : ''}>{row.pendingTrips}</td><td>{formatMoney(row.cash)}</td><td>{formatMoney(row.ordersPay)}</td><td>{formatMoney(row.tripsPay)}</td><td className="font-black text-emerald-700">{formatMoney(row.due)}</td><td>{row.missingRates ? <span className="inline-flex items-center gap-1 font-black text-rose-700"><AlertTriangle size={15}/> سعر ناقص</span> : <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={15}/> محسوب</span>}</td></tr>)}
        {!rows.length && <tr><td colSpan={10} className="p-12 text-center font-bold text-slate-400">لا توجد حركة في الدورة الحالية</td></tr>}
      </tbody></table></div>
    </div>
  </AdminModuleShell>
}
