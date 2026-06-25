import { useEffect, useMemo, useState } from 'react'
import { Camera, ChevronLeft, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getOperationalPeriod } from '../lib/helpers'

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

type CustomerSummary = {
  month_start?: string | null
  active_customers?: number | null
  customers_3_plus?: number | null
  customers_5_plus?: number | null
  customers_10_plus?: number | null
  total_invoices?: number | null
  total_sales?: number | null
}

type TopCustomer = {
  customer_name?: string | null
  customer_code?: string | null
  invoices_count?: number | null
  total_sales?: number | null
  last_order_date?: string | null
}

function toNumber(value: unknown) {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num : 0
}

function money(value: unknown) {
  return `${toNumber(value).toLocaleString('ar-EG')} ج`
}

export default function DashboardTripCustomerInsights() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [trips, setTrips] = useState<TripRow[]>([])
  const [customerSummary, setCustomerSummary] = useState<CustomerSummary | null>(null)
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [ordersCount, setOrdersCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [tripsRes, orderCountRes, summaryRes] = await Promise.allSettled([
        supabase
          .from('internal_trip_daily_audit')
          .select('id,rider_name,branch_name,trip_date,proof_required,proof_image_url,proof_exception_status,audit_status,status')
          .gte('trip_date', period.start)
          .lte('trip_date', period.end)
          .order('trip_date', { ascending: false })
          .limit(1000),
        supabase
          .from('delivery_orders')
          .select('id', { count: 'exact', head: true })
          .gte('work_date', period.start)
          .lte('work_date', period.end),
        supabase
          .from('customer_monthly_frequency_summary')
          .select('*')
          .order('month_start', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (cancelled) return
      if (tripsRes.status === 'fulfilled' && !tripsRes.value.error) setTrips((tripsRes.value.data || []) as TripRow[])
      if (orderCountRes.status === 'fulfilled' && !orderCountRes.value.error) setOrdersCount(orderCountRes.value.count || 0)
      if (summaryRes.status === 'fulfilled' && !summaryRes.value.error && summaryRes.value.data) {
        const summary = summaryRes.value.data as CustomerSummary
        setCustomerSummary(summary)
        const topRes = await supabase
          .from('customer_monthly_frequency')
          .select('customer_name,customer_code,invoices_count,total_sales,last_order_date')
          .eq('month_start', summary.month_start)
          .order('invoices_count', { ascending: false })
          .limit(6)
        if (!cancelled && !topRes.error) setTopCustomers((topRes.data || []) as TopCustomer[])
      }
      setLoading(false)
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
        {loading && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">جاري التحميل...</span>}
      </div>

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
            <Metric title="عملاء نشطين" value={toNumber(customerSummary?.active_customers)} onClick={openCustomers} />
            <Metric title="+3 طلبات" value={toNumber(customerSummary?.customers_3_plus)} tone="blue" onClick={openCustomers} />
            <Metric title="+5 طلبات" value={toNumber(customerSummary?.customers_5_plus)} tone="green" onClick={openCustomers} />
            <Metric title="+10 طلبات" value={toNumber(customerSummary?.customers_10_plus)} tone="amber" onClick={openCustomers} />
            <Metric title="فواتير العملاء" value={toNumber(customerSummary?.total_invoices)} tone="slate" onClick={openCustomers} />
            <Metric title="أوردرات الدورة" value={ordersCount} tone="slate" onClick={() => navigate('/admin/reconciliation')} />
          </div>
          <div className="mt-3 rounded-2xl bg-white p-3">
            <p className="mb-2 text-xs font-black text-slate-500">أعلى العملاء طلبًا</p>
            {topCustomers.length === 0 ? <p className="text-center text-xs font-bold text-slate-400">لا توجد بيانات عملاء بعد</p> : <div className="space-y-2">{topCustomers.slice(0, 4).map((customer, idx) => <button type="button" onClick={openCustomers} key={`${customer.customer_code || idx}`} className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-right transition hover:bg-teal-50"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-700">{customer.customer_name || 'عميل غير محدد'}</p><p className="text-[11px] font-bold text-slate-400">{customer.customer_code || '—'} · آخر طلب {customer.last_order_date || '—'}</p></div><div className="text-left"><b className="block text-sm text-[#008E92]">{toNumber(customer.invoices_count)} طلب</b><span className="text-[11px] font-bold text-slate-400">{money(customer.total_sales)}</span></div></button>)}</div>}
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
