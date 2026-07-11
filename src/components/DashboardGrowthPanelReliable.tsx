import { useEffect, useMemo, useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CycleSelector from './CycleSelector'
import { fetchAllRows } from '../lib/fetchAllRows'
import { formatMoney, getOperationalPeriod } from '../lib/helpers'

const dateKey = (value: unknown) => {
  if (!value) return ''
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const orderDate = (row: any) => dateKey(row.delivery_date || row.work_date || row.registered_at || row.created_at)
const isDelivered = (row: any) => String(row.status || '').toLowerCase() === 'delivered' || Boolean(row.delivered_at)
const isFailed = (row: any) => String(row.status || '').toLowerCase() === 'failed' || Boolean(row.failed_reason)

function summarize(rows: any[]) {
  const customers = new Set<string>()
  const invoices = new Set<string>()
  const deliveryMinutes: number[] = []
  let value = 0

  rows.forEach(row => {
    const customer = row.customer_id || row.customer_code_snapshot || row.customer_code || row.customer_name_snapshot || row.customer_name
    const invoice = row.invoice_number || row.invoice_no || row.invoice_id || row.id
    if (customer) customers.add(String(customer))
    if (invoice) invoices.add(String(invoice))
    value += Number(row.invoice_amount || row.invoice_value || row.amount || 0) || 0

    const start = row.out_for_delivery_at || row.assigned_at || row.registered_at || row.created_at
    const end = row.delivered_at
    if (start && end) {
      const minutes = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000)
      if (Number.isFinite(minutes) && minutes >= 0) deliveryMinutes.push(minutes)
    }
  })

  const delivered = rows.filter(isDelivered).length
  const failed = rows.filter(isFailed).length
  const duplicates = rows.filter(row => Boolean(row.is_duplicate_invoice) || String(row.duplicate_review_status || '').toLowerCase() === 'pending').length
  const notFound = rows.filter(row => String(row.bconnect_match_status || '').toLowerCase().includes('not_found')).length

  return {
    orders: rows.length,
    customers: customers.size,
    invoices: invoices.size,
    delivered,
    failed,
    duplicates,
    notFound,
    value,
    failureRate: rows.length ? (failed / rows.length) * 100 : 0,
    avgMinutes: deliveryMinutes.length ? Math.round(deliveryMinutes.reduce((sum, item) => sum + item, 0) / deliveryMinutes.length) : 0,
  }
}

function Metric({ title, value, hint, tone = 'sky' }: { title: string; value: string | number; hint: string; tone?: 'sky' | 'emerald' | 'rose' | 'amber' }) {
  const classes = {
    sky: 'border-sky-100 bg-sky-50',
    emerald: 'border-emerald-100 bg-emerald-50',
    rose: 'border-rose-100 bg-rose-50',
    amber: 'border-amber-100 bg-amber-50',
  }[tone]
  return <div className={`rounded-[1.5rem] border p-4 shadow-sm ${classes}`}><p className="text-[11px] font-black text-slate-500">{title}</p><p className="mt-2 text-2xl font-black text-[#102a32]">{value}</p><p className="mt-2 text-[11px] font-bold text-slate-500">{hint}</p></div>
}

export default function DashboardGrowthPanelReliable() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [from, setFrom] = useState(period.start)
  const [to, setTo] = useState(period.end)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchAllRows<any>({
          table: 'delivery_orders',
          filters: [
            { column: 'delivery_date', operator: 'gte', value: from },
            { column: 'delivery_date', operator: 'lte', value: to },
          ],
          orderColumn: 'registered_at',
          ascending: false,
        })
        if (active) setRows(data)
      } catch (loadError: any) {
        if (active) setError(loadError?.message || 'تعذر تحميل تحليل النمو')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [from, to])

  const summary = useMemo(() => summarize(rows), [rows])
  const monthly = useMemo(() => {
    const groups = new Map<string, any[]>()
    rows.forEach(row => {
      const key = orderDate(row).slice(0, 7)
      if (!key) return
      const group = groups.get(key) || []
      group.push(row)
      groups.set(key, group)
    })
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, monthRows]) => ({ month, ...summarize(monthRows) }))
  }, [rows])

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm" dir="rtl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-black text-[#008E92]">تحليل نمو الدليفري الموثوق</p><h2 className="mt-1 text-xl font-black text-[#102a32]">تحليل كامل بدون حد 1000 صف</h2><p className="mt-1 text-xs font-bold text-slate-400">الفترة: {from} إلى {to}</p></div>
        <div className="flex gap-2"><button onClick={() => navigate(`/admin/reconciliation?from=${from}&to=${to}`)} className="rounded-2xl bg-[#008E92] px-3 py-2 text-xs font-black text-white">فتح المطابقة</button><button onClick={() => navigate(`/admin/reports?from=${from}&to=${to}`)} className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">فتح التقارير</button></div>
      </div>

      <CycleSelector from={from} to={to} onApply={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo) }} />
      {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">{error}</div>}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="إجمالي الأوردرات" value={loading ? '—' : summary.orders.toLocaleString('ar-EG')} hint="كل الصفوف خلال الفترة" />
        <Metric title="تم التسليم" value={loading ? '—' : summary.delivered.toLocaleString('ar-EG')} hint={`نسبة النجاح ${summary.orders ? ((summary.delivered / summary.orders) * 100).toFixed(1) : '0.0'}%`} tone="emerald" />
        <Metric title="فشل" value={loading ? '—' : summary.failed.toLocaleString('ar-EG')} hint={`نسبة الفشل ${summary.failureRate.toFixed(1)}%`} tone="rose" />
        <Metric title="قيمة الأوردرات" value={loading ? '—' : formatMoney(summary.value)} hint="إجمالي القيم المسجلة" tone="emerald" />
        <Metric title="العملاء المختلفون" value={loading ? '—' : summary.customers.toLocaleString('ar-EG')} hint="حسب الكود أو الحساب" />
        <Metric title="الفواتير المختلفة" value={loading ? '—' : summary.invoices.toLocaleString('ar-EG')} hint="أرقام فواتير مميزة" />
        <Metric title="الفواتير المكررة" value={loading ? '—' : summary.duplicates.toLocaleString('ar-EG')} hint="تحتاج مراجعة" tone="amber" />
        <Metric title="متوسط زمن التسليم" value={loading ? '—' : `${summary.avgMinutes} دقيقة`} hint="من الخروج حتى التسليم" tone="amber" />
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-100">
        <table className="w-full min-w-[760px] text-sm"><thead><tr className="bg-slate-50 text-xs font-black text-slate-500"><th className="p-3 text-right">الشهر</th><th>الأوردرات</th><th>تم</th><th>فشل</th><th>نسبة الفشل</th><th>القيمة</th><th>الاتجاه</th></tr></thead><tbody>{monthly.map((row, index) => { const previous = monthly[index - 1]; const delta = previous ? row.orders - previous.orders : 0; return <tr key={row.month} className="border-t border-slate-100 font-bold"><td className="p-3">{row.month}</td><td className="text-center">{row.orders}</td><td className="text-center text-emerald-700">{row.delivered}</td><td className="text-center text-rose-700">{row.failed}</td><td className="text-center">{row.failureRate.toFixed(1)}%</td><td className="text-center">{formatMoney(row.value)}</td><td className="text-center">{delta >= 0 ? <span className="inline-flex items-center gap-1 text-emerald-700"><TrendingUp size={16} />+{delta}</span> : <span className="inline-flex items-center gap-1 text-rose-700"><TrendingDown size={16} />{delta}</span>}</td></tr> })}</tbody></table>
      </div>
    </section>
  )
}
