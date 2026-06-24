import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ExternalLink, RefreshCw, Search, Star, TrendingUp, Users } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { displayBranchName } from '../../lib/branchUtils'

type OrderRow = Record<string, any>

type MonthlyCustomerRow = {
  key: string
  customer_code: string
  customer_name: string
  phone: string
  branch_name: string
  invoices_count: number
  total_sales: number
  average_invoice: number
  last_order_at: string
  segment: 'VIP' | 'متكرر' | 'مرة واحدة'
}

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const start = new Date(year, monthNumber - 1, 1)
  const end = new Date(year, monthNumber, 1)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function money(value: number) {
  return Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 0 })
}

function orderDate(order: OrderRow) {
  return String(order.work_date || order.delivery_date || order.registered_at || order.created_at || '').slice(0, 10)
}

function orderAmount(order: OrderRow) {
  return Number(order.invoice_amount ?? order.invoice_value ?? order.amount ?? order.total_amount ?? 0) || 0
}

function customerKey(order: OrderRow) {
  return String(
    order.customer_id ||
    order.customer_code ||
    order.customer_code_snapshot ||
    order.customer_phone ||
    order.customer_phone_snapshot ||
    order.customer_name ||
    order.customer_name_snapshot ||
    order.id
  )
}

function normalizePhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('2') ? digits : `2${digits}`
}

function whatsappLink(phone?: string | null) {
  const normalized = normalizePhone(phone)
  if (!normalized) return '#'
  const text = encodeURIComponent([
    'أهلاً بحضرتك يا فندم',
    'مع حضرتك صيدليات دواء',
    'نتشرف بخدمة حضرتك دائمًا',
  ].join('\n'))
  return `https://wa.me/${normalized}?text=${text}`
}

function mergeOrders(rows: OrderRow[][]) {
  const map = new Map<string, OrderRow>()
  rows.flat().forEach((row, index) => {
    map.set(String(row.id || `${customerKey(row)}-${orderDate(row)}-${index}`), row)
  })
  return [...map.values()]
}

export default function CustomerAnalytics() {
  const navigate = useNavigate()
  const [month, setMonth] = useState(currentMonthValue())
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    try {
      setLoading(true)
      const range = monthRange(month)
      const [workDateResult, deliveryDateResult, viewResult] = await Promise.allSettled([
        supabase
          .from('delivery_orders')
          .select('*')
          .gte('work_date', range.start)
          .lt('work_date', range.end)
          .order('work_date', { ascending: false })
          .limit(5000),
        supabase
          .from('delivery_orders')
          .select('*')
          .gte('delivery_date', range.start)
          .lt('delivery_date', range.end)
          .order('delivery_date', { ascending: false })
          .limit(5000),
        supabase
          .from('customer_delivery_analytics')
          .select('*')
          .limit(1500),
      ])

      const workRows = workDateResult.status === 'fulfilled' && !workDateResult.value.error ? workDateResult.value.data || [] : []
      const deliveryRows = deliveryDateResult.status === 'fulfilled' && !deliveryDateResult.value.error ? deliveryDateResult.value.data || [] : []
      const merged = mergeOrders([workRows as OrderRow[], deliveryRows as OrderRow[]])

      if (!merged.length && viewResult.status === 'fulfilled' && !viewResult.value.error) {
        const viewRows = ((viewResult.value.data || []) as any[]).map(row => ({
          id: row.customer_id || row.customer_code || row.phone,
          customer_code: row.customer_code,
          customer_name: row.customer_name,
          customer_phone: row.phone,
          branch_name: row.branch_name,
          invoice_amount: row.total_sales,
          work_date: row.last_invoice_date || row.last_delivery_order_at,
        }))
        setOrders(viewRows)
      } else {
        setOrders(merged)
      }
    } catch (error: any) {
      toast.error(`تعذر تحميل تحليل العملاء: ${error?.message || error}`)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [month])

  const customers = useMemo<MonthlyCustomerRow[]>(() => {
    const grouped = new Map<string, MonthlyCustomerRow>()
    for (const order of orders) {
      const key = customerKey(order)
      const amount = orderAmount(order)
      const current = grouped.get(key)
      const date = orderDate(order)
      const row: MonthlyCustomerRow = current || {
        key,
        customer_code: String(order.customer_code || order.customer_code_snapshot || ''),
        customer_name: String(order.customer_name || order.customer_name_snapshot || 'عميل غير مسجل'),
        phone: String(order.customer_phone || order.customer_phone_snapshot || order.phone || ''),
        branch_name: displayBranchName(order.branch_name || order.branch || ''),
        invoices_count: 0,
        total_sales: 0,
        average_invoice: 0,
        last_order_at: date,
        segment: 'مرة واحدة',
      }
      row.invoices_count += 1
      row.total_sales += amount
      row.average_invoice = row.invoices_count ? row.total_sales / row.invoices_count : 0
      if (date && (!row.last_order_at || date > row.last_order_at)) row.last_order_at = date
      row.segment = row.invoices_count >= 5 || row.total_sales >= 8000 ? 'VIP' : row.invoices_count >= 2 ? 'متكرر' : 'مرة واحدة'
      grouped.set(key, row)
    }
    return [...grouped.values()].sort((a, b) => b.total_sales - a.total_sales)
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(row =>
      [row.customer_code, row.customer_name, row.phone, row.branch_name, row.segment]
        .some(value => String(value || '').toLowerCase().includes(q))
    )
  }, [customers, search])

  const stats = useMemo(() => {
    const invoices = orders.length
    const activeCustomers = customers.length
    const totalSales = customers.reduce((sum, row) => sum + row.total_sales, 0)
    return {
      invoices,
      activeCustomers,
      totalSales,
      avgInvoicesPerCustomer: activeCustomers ? invoices / activeCustomers : 0,
      avgValuePerCustomer: activeCustomers ? totalSales / activeCustomers : 0,
      oneTime: customers.filter(row => row.invoices_count === 1).length,
      repeated: customers.filter(row => row.invoices_count >= 2).length,
      vip: customers.filter(row => row.segment === 'VIP').length,
    }
  }, [orders.length, customers])

  return (
    <div className="text-right" dir="rtl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white bg-white p-4 shadow-sm">
          <div>
            <button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-600">
              <ArrowRight size={16}/> رجوع
            </button>
            <h1 className="text-3xl font-black text-[#061827]">تحليل العملاء الشهري</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">تحليل العملاء النشطين من فواتير التوصيل خلال الشهر المختار.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="rounded-2xl border bg-slate-50 px-4 py-3 font-black text-slate-700 outline-none focus:border-[#008E92]" />
            <button onClick={load} className="inline-flex items-center gap-2 rounded-3xl bg-[#008E92] px-5 py-3 font-black text-white shadow-sm">
              <RefreshCw size={18}/> تحديث
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric label="فواتير الشهر" value={stats.invoices} icon={<Users/>}/>
          <Metric label="عملاء نشطين" value={stats.activeCustomers} icon={<Users/>}/>
          <Metric label="إجمالي المبيعات" value={money(stats.totalSales)} icon={<TrendingUp/>}/>
          <Metric label="عملاء VIP" value={stats.vip} icon={<Star/>}/>
          <Metric label="متوسط فواتير/عميل" value={stats.avgInvoicesPerCustomer.toFixed(1)} icon={<TrendingUp/>}/>
          <Metric label="متوسط قيمة العميل" value={money(stats.avgValuePerCustomer)} icon={<TrendingUp/>}/>
          <Metric label="طلبوا مرة واحدة" value={stats.oneTime} icon={<Users/>}/>
          <Metric label="عملاء متكررون" value={stats.repeated} icon={<Users/>}/>
        </div>

        <div className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute right-4 top-3 text-slate-400" size={20}/>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="w-full rounded-2xl border bg-slate-50 py-3 pr-12 font-bold outline-none focus:border-[#008E92]"
              placeholder="بحث بالكود / الاسم / الهاتف / الفرع"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b p-4 font-black text-slate-700">
            العملاء النشطون في الشهر {loading ? '— جاري التحميل...' : `— ${filtered.length} عميل`}
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3">كود العميل</th>
                  <th className="p-3">اسم العميل</th>
                  <th className="p-3">الهاتف</th>
                  <th className="p-3">الفرع</th>
                  <th className="p-3">فواتير الشهر</th>
                  <th className="p-3">قيمة الشهر</th>
                  <th className="p-3">متوسط الفاتورة</th>
                  <th className="p-3">آخر طلب</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3">واتساب</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.key} className="border-t align-top">
                    <td className="p-3 font-black">{row.customer_code || '—'}</td>
                    <td className="p-3 font-black text-[#061827]">{row.customer_name || '—'}</td>
                    <td className="p-3">{row.phone || '—'}</td>
                    <td className="p-3">{row.branch_name || '—'}</td>
                    <td className="p-3">{row.invoices_count}</td>
                    <td className="p-3 font-black">{money(row.total_sales)}</td>
                    <td className="p-3">{money(row.average_invoice)}</td>
                    <td className="p-3">{row.last_order_at || '—'}</td>
                    <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${row.segment === 'VIP' ? 'bg-amber-50 text-amber-700' : row.segment === 'متكرر' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>{row.segment}</span></td>
                    <td className="p-3">
                      {row.phone ? (
                        <a href={whatsappLink(row.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                          واتساب يدوي <ExternalLink size={12}/>
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {!loading && !filtered.length ? (
                  <tr><td colSpan={10} className="p-8 text-center font-black text-slate-400">لا توجد فواتير لهذا الشهر</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">{icon}</div>
      <p className="text-sm font-black text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#061827]">{value}</p>
    </div>
  )
}
