import { useEffect, useMemo, useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CycleSelector from './CycleSelector'
import { formatMoney, getOperationalPeriod } from '../lib/helpers'
import { supabase } from '../lib/supabase'

type MonthlyRow = {
  month: string
  label: string
  orders: number
  trips: number
  customers: number
  invoices: number
  delivered: number
  failed: number
  failureRate: number
  duplicates: number
  notFound: number
  multiplier: number
  risk: number
  avgDeliveryMinutes: number
  value: number
  orderDelta: number
  failureDelta: number
  speedDelta: number
}

function toDate(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function toDateKey(value: unknown) {
  const date = toDate(value)
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : ''
}

function inRange(value: unknown, from: string, to: string) {
  const key = toDateKey(value)
  if (!key) return false
  return key >= from && key <= to
}

function startOfYear(year: number) {
  return `${year}-01-01`
}

function monthRange(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1)
  const end = new Date(year, monthIndex + 1, 0)
  return {
    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
  }
}

function monthLabel(monthIndex: number) {
  return new Date(2000, monthIndex, 1).toLocaleDateString('ar-EG', { month: 'long' })
}

function buildSummary(orders: any[], trips: any[], from: string, to: string) {
  const filteredOrders = orders.filter(order => inRange(order.delivery_date || order.work_date || order.registered_at || order.created_at, from, to))
  const filteredTrips = trips.filter(trip => inRange(trip.trip_date || trip.work_date || trip.created_at, from, to))

  const customers = new Set<string>()
  const invoices = new Set<string>()
  const deliveryMinutes: number[] = []

  filteredOrders.forEach(order => {
    const customerKey = [order.customer_id, order.customer_code_snapshot, order.customer_code, order.customer_name_snapshot, order.customer_name].find((value) => String(value || '').trim())
    if (customerKey) customers.add(String(customerKey))

    const invoiceKey = [order.invoice_number, order.invoice_no, order.invoice_id, order.id].find((value) => String(value || '').trim())
    if (invoiceKey) invoices.add(String(invoiceKey))

    const start = order.out_for_delivery_at || order.assigned_at || order.registered_at || order.created_at
    const end = order.delivered_at
    if (start && end) {
      const startDate = toDate(start)
      const endDate = toDate(end)
      if (startDate && endDate && endDate.getTime() >= startDate.getTime()) {
        deliveryMinutes.push(Math.floor((endDate.getTime() - startDate.getTime()) / 60000))
      }
    }
  })

  const delivered = filteredOrders.filter(order => String(order.status || '').toLowerCase() === 'delivered' || Boolean(order.delivered_at)).length
  const failed = filteredOrders.filter(order => String(order.status || '').toLowerCase() === 'failed').length
  const duplicates = filteredOrders.filter(order => Boolean(order.is_duplicate_invoice) || String(order.duplicate_review_status || '').toLowerCase() === 'pending').length
  const notFound = filteredOrders.filter(order => String(order.bconnect_match_status || '').toLowerCase().includes('invoice_not_found') || String(order.bconnect_match_status || '').toLowerCase().includes('not_found')).length
  const multiplier = filteredOrders.filter(order => Number(order.order_multiplier ?? 1) >= 1.5).length
  const risk = failed + duplicates + notFound
  const value = filteredOrders.reduce((sum, order) => sum + Number(order.invoice_amount || order.invoice_value || order.amount || 0), 0)

  return {
    orders: filteredOrders.length,
    trips: filteredTrips.length,
    customers: customers.size,
    invoices: invoices.size,
    delivered,
    failed,
    failureRate: filteredOrders.length ? (failed / filteredOrders.length) * 100 : 0,
    duplicates,
    notFound,
    multiplier,
    risk,
    avgDeliveryMinutes: deliveryMinutes.length ? Math.round(deliveryMinutes.reduce((sum, value) => sum + value, 0) / deliveryMinutes.length) : 0,
    value,
  }
}

function buildMonthlyRows(orders: any[], trips: any[], year: number, selectedTo: string) {
  const rows: MonthlyRow[] = []
  const monthCount = new Date(selectedTo).getMonth() + 1

  for (let index = 0; index < monthCount; index += 1) {
    const range = monthRange(year, index)
    const monthOrders = orders.filter(order => inRange(order.delivery_date || order.work_date || order.registered_at || order.created_at, range.start, range.end))
    const monthTrips = trips.filter(trip => inRange(trip.trip_date || trip.work_date || trip.created_at, range.start, range.end))
    const monthSummary = buildSummary(monthOrders, monthTrips, range.start, range.end)
    rows.push({
      month: `${year}-${String(index + 1).padStart(2, '0')}`,
      label: monthLabel(index),
      ...monthSummary,
      orderDelta: 0,
      failureDelta: 0,
      speedDelta: 0,
    })
  }

  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index]
    const previous = rows[index - 1]
    current.orderDelta = current.orders - previous.orders
    current.failureDelta = current.failed - previous.failed
    current.speedDelta = current.avgDeliveryMinutes - previous.avgDeliveryMinutes
  }

  return rows
}

function MetricCard({ title, value, hint, tone = 'blue' }: { title: string; value: string | number; hint: string; tone?: 'blue' | 'green' | 'red' | 'amber' | 'slate' }) {
  const toneClasses = {
    blue: 'border-sky-100 bg-sky-50 text-sky-700',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    red: 'border-rose-100 bg-rose-50 text-rose-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    slate: 'border-slate-100 bg-slate-50 text-slate-600',
  }[tone]

  return (
    <div className={`rounded-[1.5rem] border p-4 shadow-sm ${toneClasses}`}>
      <p className="text-[11px] font-black text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-black text-[#102a32]">{value}</p>
      <p className="mt-2 text-[11px] font-bold text-slate-500">{hint}</p>
    </div>
  )
}

export default function DashboardGrowthPanel() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [selectedFrom, setSelectedFrom] = useState(period.start)
  const [selectedTo, setSelectedTo] = useState(period.end)
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      const yearStart = startOfYear(new Date().getFullYear())
      const [ordersRes, tripsRes] = await Promise.allSettled([
        supabase.from('delivery_orders').select('*').gte('delivery_date', yearStart).lte('delivery_date', selectedTo),
        supabase.from('internal_trips').select('*').gte('trip_date', yearStart).lte('trip_date', selectedTo),
      ])

      if (!active) return

      let loadedOrders: any[] = []
      if (ordersRes.status === 'fulfilled' && !ordersRes.value.error) {
        loadedOrders = (ordersRes.value.data || []) as any[]
      } else if (ordersRes.status === 'fulfilled' && ordersRes.value.error) {
        const fallback = await supabase.from('delivery_orders').select('*').gte('work_date', yearStart).lte('work_date', selectedTo)
        if (!active && fallback.error) return
        loadedOrders = (fallback.data || []) as any[]
      }

      let loadedTrips: any[] = []
      if (tripsRes.status === 'fulfilled' && !tripsRes.value.error) {
        loadedTrips = (tripsRes.value.data || []) as any[]
      } else if (tripsRes.status === 'fulfilled' && tripsRes.value.error) {
        const fallback = await supabase.from('internal_trips').select('*').gte('work_date', yearStart).lte('work_date', selectedTo)
        if (!active && fallback.error) return
        loadedTrips = (fallback.data || []) as any[]
      }

      setOrders(loadedOrders)
      setTrips(loadedTrips)
      setLoading(false)
    }

    void load()
    return () => { active = false }
  }, [selectedTo])

  const summary = useMemo(() => buildSummary(orders, trips, selectedFrom, selectedTo), [orders, selectedFrom, selectedTo, trips])
  const monthlyRows = useMemo(() => buildMonthlyRows(orders, trips, new Date().getFullYear(), selectedTo), [orders, selectedTo, trips])

  function handleCycleApply(from: string, to: string) {
    setSelectedFrom(from)
    setSelectedTo(to)
  }

  const selectedRange = `${selectedFrom} إلى ${selectedTo}`

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm" dir="rtl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[#008E92]">تحليل نمو الدليفري</p>
          <h2 className="mt-1 text-xl font-black text-[#102a32]">تطور الدليفري من بداية السنة + اختيار الدورة</h2>
          <p className="mt-1 text-xs font-bold text-slate-400">الفترة المختارة: {selectedRange}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate(`/admin/reconciliation?from=${selectedFrom}&to=${selectedTo}`)} className="rounded-2xl bg-[#008E92] px-3 py-2 text-xs font-black text-white">فتح المطابقة</button>
          <button type="button" onClick={() => navigate(`/admin/reports?from=${selectedFrom}&to=${selectedTo}`)} className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">فتح التقارير</button>
          <button type="button" onClick={() => navigate(`/admin/cycles?from=${selectedFrom}&to=${selectedTo}`)} className="rounded-2xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-800">فتح أرشيف الدورات</button>
        </div>
      </div>

      <CycleSelector from={selectedFrom} to={selectedTo} onApply={handleCycleApply} />

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="إجمالي الأوردرات" value={summary.orders.toLocaleString('ar-EG')} hint="خلال الفترة المختارة" tone="blue" />
        <MetricCard title="إجمالي المشاوير" value={summary.trips.toLocaleString('ar-EG')} hint="المشاوير المسجلة" tone="blue" />
        <MetricCard title="العملاء المختلفين" value={summary.customers.toLocaleString('ar-EG')} hint="عميل مميز حسب البيانات" tone="green" />
        <MetricCard title="الفواتير المختلفة" value={summary.invoices.toLocaleString('ar-EG')} hint="فواتير مميزة" tone="blue" />
        <MetricCard title="الأوردرات المسلمة" value={summary.delivered.toLocaleString('ar-EG')} hint="تم التسليم فعليًا" tone="green" />
        <MetricCard title="الأوردرات الفاشلة" value={summary.failed.toLocaleString('ar-EG')} hint="فشل أو عائد" tone="red" />
        <MetricCard title="نسبة الفشل" value={`${summary.failureRate.toFixed(1)}%`} hint="فشل ÷ إجمالي الأوردرات" tone="amber" />
        <MetricCard title="الفواتير المكررة" value={summary.duplicates.toLocaleString('ar-EG')} hint="تحتاج مراجعة" tone="amber" />
        <MetricCard title="غير موجودة في BeeConnect" value={summary.notFound.toLocaleString('ar-EG')} hint="مفقودة في المطابقة" tone="red" />
        <MetricCard title="أوردرات 1.5" value={summary.multiplier.toLocaleString('ar-EG')} hint="أوردرات ذات مضاعف عالي" tone="blue" />
        <MetricCard title="مؤشر المخاطر" value={summary.risk.toLocaleString('ar-EG')} hint="فشل + مكرر + غير موجود" tone="red" />
        <MetricCard title="متوسط زمن التسليم" value={`${summary.avgDeliveryMinutes} د`} hint="من خروج الأوردر إلى التسليم" tone="slate" />
        <MetricCard title="قيمة الفواتير" value={formatMoney(summary.value)} hint="إجمالي القيمة خلال الفترة" tone="green" />
      </div>

      <div className="mt-6 overflow-hidden rounded-[1.8rem] border border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 p-4">
          <div>
            <h3 className="text-lg font-black text-[#102a32]">من بداية السنة — شهريًا</h3>
            <p className="text-xs font-bold text-slate-400">مقارنة كل شهر بالشهر السابق</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-black text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700"><TrendingUp size={14} /> تحسن</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-rose-700"><TrendingDown size={14} /> تراجع</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-right text-xs font-black text-slate-500">
              <tr>
                <th className="p-3">الشهر</th>
                <th className="p-3">الأوردرات</th>
                <th className="p-3">المشاوير</th>
                <th className="p-3">العملاء</th>
                <th className="p-3">الفواتير</th>
                <th className="p-3">المسلم</th>
                <th className="p-3">الفاشل</th>
                <th className="p-3">نسبة الفشل</th>
                <th className="p-3">المكرر</th>
                <th className="p-3">غير موجود</th>
                <th className="p-3">1.5</th>
                <th className="p-3">زمن التسليم</th>
                <th className="p-3">القيمة</th>
                <th className="p-3">المخاطر</th>
                <th className="p-3">مقارنة</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} className="p-6 text-center text-sm font-bold text-slate-400">جاري تحميل التحليل...</td>
                </tr>
              ) : monthlyRows.map(row => {
                const orderTone = row.orderDelta > 0 ? 'text-emerald-700' : row.orderDelta < 0 ? 'text-rose-700' : 'text-slate-600'
                const failTone = row.failureDelta < 0 ? 'text-emerald-700' : row.failureDelta > 0 ? 'text-rose-700' : 'text-slate-600'
                const speedTone = row.speedDelta < 0 ? 'text-emerald-700' : row.speedDelta > 0 ? 'text-rose-700' : 'text-slate-600'

                return (
                  <tr key={row.month} className="border-t bg-white hover:bg-slate-50">
                    <td className="p-3 font-black text-[#102a32]">{row.label}</td>
                    <td className="p-3">{row.orders}</td>
                    <td className="p-3">{row.trips}</td>
                    <td className="p-3">{row.customers}</td>
                    <td className="p-3">{row.invoices}</td>
                    <td className="p-3 text-emerald-700">{row.delivered}</td>
                    <td className="p-3 text-rose-700">{row.failed}</td>
                    <td className="p-3">{row.failureRate.toFixed(1)}%</td>
                    <td className="p-3">{row.duplicates}</td>
                    <td className="p-3">{row.notFound}</td>
                    <td className="p-3">{row.multiplier}</td>
                    <td className="p-3">{row.avgDeliveryMinutes} د</td>
                    <td className="p-3">{formatMoney(row.value)}</td>
                    <td className="p-3">{row.risk}</td>
                    <td className="p-3 text-xs font-black">
                      <div className={`rounded-xl px-2 py-1 ${orderTone}`}>أوردر: {row.orderDelta >= 0 ? `+${row.orderDelta}` : row.orderDelta}</div>
                      <div className={`mt-1 rounded-xl px-2 py-1 ${failTone}`}>فشل: {row.failureDelta >= 0 ? `+${row.failureDelta}` : row.failureDelta}</div>
                      <div className={`mt-1 rounded-xl px-2 py-1 ${speedTone}`}>سرعة: {row.speedDelta >= 0 ? `+${row.speedDelta}` : row.speedDelta} د</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
