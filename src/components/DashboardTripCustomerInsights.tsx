import { useEffect, useMemo, useState } from 'react'
import { Camera, ChevronLeft, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getOperationalPeriod } from '../lib/helpers'
import { fetchAllRows } from '../lib/fetchAllRows'
import EmptyState from './ui/EmptyState'

type TripRow = {
  id: string
  rider_name?: string | null
  branch_name?: string | null
  trip_date?: string | null
  proof_required?: boolean | null
  proof_image_url?: string | null
  proof_exception_status?: string | null
  audit_status?: string | null
  status?: string | null
}

type OrderRow = {
  id: string
  invoice_number?: string | null
  invoice_amount?: number | null
  customer_id?: string | null
  customer_code_snapshot?: string | null
  customer_name_snapshot?: string | null
  delivery_date?: string | null
  work_date?: string | null
  registered_at?: string | null
}

type CustomerAggregate = {
  key: string
  customer_name: string
  customer_code: string
  invoices_count: number
  total_sales: number
  last_order_date: string
}

function toNumber(value: unknown) {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num : 0
}

function money(value: unknown) {
  return `${toNumber(value).toLocaleString('ar-EG')} ج`
}

function orderDate(order: OrderRow) {
  return String(order.delivery_date || order.work_date || order.registered_at || '').slice(0, 10)
}

export default function DashboardTripCustomerInsights() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [trips, setTrips] = useState<TripRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [loadedTrips, loadedOrders] = await Promise.all([
          fetchAllRows<TripRow>({
            table: 'internal_trip_daily_audit',
            select: 'id,rider_name,branch_name,trip_date,proof_required,proof_image_url,proof_exception_status,audit_status,status',
            filters: [
              { column: 'trip_date', operator: 'gte', value: period.start },
              { column: 'trip_date', operator: 'lte', value: period.end },
            ],
            orderColumn: 'trip_date',
            ascending: false,
          }),
          fetchAllRows<OrderRow>({
            table: 'delivery_orders',
            select: 'id,invoice_number,invoice_amount,customer_id,customer_code_snapshot,customer_name_snapshot,delivery_date,work_date,registered_at',
            filters: [
              { column: 'delivery_date', operator: 'gte', value: period.start },
              { column: 'delivery_date', operator: 'lte', value: period.end },
            ],
            orderColumn: 'registered_at',
            ascending: false,
          }),
        ])

        if (cancelled) return
        setTrips(loadedTrips)
        setOrders(loadedOrders)
      } catch (cause: any) {
        if (cancelled) return
        setError(cause?.message || 'تعذر تحميل تحليل المشاوير والعملاء')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [period.end, period.start])

  const tripStats = useMemo(() => {
    const withProof = trips.filter(t => Boolean(t.proof_image_url))
    const withoutProof = trips.filter(t => !t.proof_image_url)
    const exceptions = trips.filter(t => t.proof_exception_status === 'pending')
    const pending = trips.filter(t => t.status === 'pending_approval' || t.audit_status === 'pending_approval')
    const oldRows = trips.filter(t => t.proof_required === false && !t.proof_image_url && t.proof_exception_status !== 'pending')
    const byRider = new Map<string, number>()
    for (const trip of trips) {
      const rider = trip.rider_name || 'غير محدد'
      byRider.set(rider, (byRider.get(rider) || 0) + 1)
    }
    const topRider = [...byRider.entries()].sort((a, b) => b[1] - a[1])[0]
    return { withProof, withoutProof, exceptions, pending, oldRows, topRider }
  }, [trips])

  const customerStats = useMemo(() => {
    const map = new Map<string, CustomerAggregate>()

    for (const order of orders) {
      const code = String(order.customer_code_snapshot || '').trim()
      const name = String(order.customer_name_snapshot || 'عميل غير محدد').trim()
      const key = String(order.customer_id || code || name || order.id)
      const current = map.get(key) || {
        key,
        customer_name: name || 'عميل غير محدد',
        customer_code: code,
        invoices_count: 0,
        total_sales: 0,
        last_order_date: '',
      }
      current.invoices_count += 1
      current.total_sales += toNumber(order.invoice_amount)
      const date = orderDate(order)
      if (date > current.last_order_date) current.last_order_date = date
      map.set(key, current)
    }

    const customers = [...map.values()]
    const topCustomers = customers.sort((a, b) => b.invoices_count - a.invoices_count || b.total_sales - a.total_sales).slice(0, 6)
    return {
      activeCustomers: customers.length,
      customers3Plus: customers.filter(c => c.invoices_count >= 3).length,
      customers5Plus: customers.filter(c => c.invoices_count >= 5).length,
      customers10Plus: customers.filter(c => c.invoices_count >= 10).length,
      totalInvoices: orders.length,
      topCustomers,
    }
  }, [orders])

  const openTrips = () => navigate('/admin/trips')
  const openCustomers = () => navigate('/admin/customer-analytics')

  return (
    <section className="rounded-[2rem] border border-white/80 bg-white p-5 shadow-sm" dir="rtl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[#008E92]">تحليل تشغيلي سريع</p>
          <h2 className="mt-1 text-xl font-black text-[#102a32]">تحليل المشاوير والعملاء خلال الدورة</h2>
          <p className="mt-1 text-xs font-bold text-slate-400">الدورة {period.start} → {period.end}</p>
        </div>
        {loading && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">جاري تحميل كل البيانات...</span>}
      </div>

      {error && <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm font-black text-rose-700">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.5rem] border border-rose-100 bg-rose-50/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-black text-[#102a32]">تحليل المشاوير</h3>
            <button onClick={openTrips} className="inline-flex items-center gap-1 rounded-2xl bg-white px-3 py-2 text-xs font-black text-rose-700 shadow-sm">كل المشاوير <ChevronLeft size={14} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric title="مشاوير الدورة" value={trips.length} onClick={openTrips} />
            <Metric title="بصورة كاميرا" value={tripStats.withProof.length} icon={<Camera size={15} />} tone="green" onClick={openTrips} />
            <Metric title="بدون صورة" value={tripStats.withoutProof.length} tone="red" onClick={openTrips} />
            <Metric title="استثناءات" value={tripStats.exceptions.length} tone="amber" onClick={openTrips} />
            <Metric title="مستني اعتماد" value={tripStats.pending.length} tone="blue" onClick={openTrips} />
            <Metric title="قديم بلا إثبات" value={tripStats.oldRows.length} tone="slate" onClick={openTrips} />
          </div>
          <button onClick={openTrips} className="mt-3 w-full rounded-2xl bg-white p-3 text-right transition hover:shadow-md">
            <p className="text-[11px] font-black text-slate-400">أكثر مندوب مشاوير</p>
            <b className="mt-1 block text-sm text-slate-700">{tripStats.topRider ? `${tripStats.topRider[0]} · ${tripStats.topRider[1]}` : '—'}</b>
          </button>
        </div>

        <div className="rounded-[1.5rem] border border-teal-100 bg-teal-50/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Users className="text-[#008E92]" size={20} /><h3 className="font-black text-[#102a32]">تحليل العملاء</h3></div>
            <button onClick={openCustomers} className="inline-flex items-center gap-1 rounded-2xl bg-white px-3 py-2 text-xs font-black text-[#008E92] shadow-sm">كل العملاء <ChevronLeft size={14} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric title="عملاء نشطين" value={customerStats.activeCustomers} onClick={openCustomers} />
            <Metric title="+3 طلبات" value={customerStats.customers3Plus} tone="blue" onClick={openCustomers} />
            <Metric title="+5 طلبات" value={customerStats.customers5Plus} tone="green" onClick={openCustomers} />
            <Metric title="+10 طلبات" value={customerStats.customers10Plus} tone="amber" onClick={openCustomers} />
            <Metric title="فواتير العملاء" value={customerStats.totalInvoices} tone="slate" onClick={openCustomers} />
            <Metric title="أوردرات الدورة" value={orders.length} tone="slate" onClick={() => navigate('/admin/reconciliation')} />
          </div>
          <div className="mt-3 rounded-2xl bg-white p-3">
            <p className="mb-2 text-xs font-black text-slate-500">أعلى العملاء طلبًا</p>
            {customerStats.topCustomers.length === 0 ? <EmptyState title="لا توجد بيانات عملاء بعد" /> : <div className="space-y-2">{customerStats.topCustomers.slice(0, 4).map((customer) => <button type="button" onClick={openCustomers} key={customer.key} className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-right transition hover:bg-teal-50"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-700">{customer.customer_name}</p><p className="text-[11px] font-bold text-slate-400">{customer.customer_code || '—'} · آخر طلب {customer.last_order_date || '—'}</p></div><div className="text-left"><b className="block text-sm text-[#008E92]">{customer.invoices_count} طلب</b><span className="text-[11px] font-bold text-slate-400">{money(customer.total_sales)}</span></div></button>)}</div>}
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ title, value, tone = 'teal', icon, onClick }: { title: string; value: number; tone?: 'teal' | 'green' | 'red' | 'amber' | 'blue' | 'slate'; icon?: React.ReactNode; onClick?: () => void }) {
  const cls = { teal: 'bg-white text-[#008E92]', green: 'bg-white text-emerald-700', red: 'bg-white text-rose-700', amber: 'bg-white text-amber-700', blue: 'bg-white text-sky-700', slate: 'bg-white text-slate-700' }[tone]
  return <button type="button" onClick={onClick} className={`rounded-2xl p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cls}`}><p className="flex items-center justify-center gap-1 text-[11px] font-black opacity-80">{icon}{title}</p><b className="mt-1 block text-2xl">{value.toLocaleString('ar-EG')}</b></button>
}
