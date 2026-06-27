import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, ExternalLink, RefreshCw, Search, Star, TrendingUp, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { displayBranchName } from '../../lib/branchUtils'
import CycleSelector from '../../components/CycleSelector'

type OrderRow = Record<string, any>
type RangeMode = 'cycle' | 'quarter' | 'all'
type SegmentFilter = 'all' | 'VIP' | 'متكرر' | 'مرة واحدة'
type InvoiceFilter = 'all' | 'one' | 'repeat' | 'vip_count' | 'high_value'
type SortKey = 'sales' | 'invoices' | 'latest' | 'avg' | 'name'

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
  orders: OrderRow[]
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function currentCycleRange() {
  const now = new Date()
  const start = now.getDate() >= 26 ? new Date(now.getFullYear(), now.getMonth(), 26) : new Date(now.getFullYear(), now.getMonth() - 1, 26)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25)
  return { start: iso(start), end: iso(end) }
}

function quarterRangeForCycle(cycleStartIso: string) {
  const start = new Date(`${cycleStartIso}T12:00:00`)
  const qStart = new Date(start.getFullYear(), start.getMonth() - 2, 26)
  const qEnd = new Date(start.getFullYear(), start.getMonth() + 1, 25)
  return { start: iso(qStart), end: iso(qEnd) }
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

function invoiceNo(order: OrderRow) {
  return String(order.invoice_number || order.invoice_no || order.invoice_id || '—')
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
  const [searchParams, setSearchParams] = useSearchParams()
  const initialCycle = currentCycleRange()
  const [mode, setMode] = useState<RangeMode>((searchParams.get('mode') as RangeMode) || 'cycle')
  const [cycleRange, setCycleRange] = useState({ start: searchParams.get('from') || initialCycle.start, end: searchParams.get('to') || initialCycle.end })
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>('all')
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [sortBy, setSortBy] = useState<SortKey>('sales')
  const [selectedCustomer, setSelectedCustomer] = useState<MonthlyCustomerRow | null>(null)

  const activeRange = useMemo(() => {
    if (mode === 'quarter') return quarterRangeForCycle(cycleRange.start)
    if (mode === 'all') return { start: '', end: '' }
    return cycleRange
  }, [mode, cycleRange])

  const periodLabel = mode === 'all'
    ? 'طوال المدة'
    : mode === 'quarter'
      ? `آخر 3 دورات: ${activeRange.start} إلى ${activeRange.end}`
      : `دورة: ${activeRange.start} إلى ${activeRange.end}`

  async function load() {
    try {
      setLoading(true)
      const makeQuery = (column: string) => {
        let query = supabase.from('delivery_orders').select('*').order(column, { ascending: false }).limit(50000)
        if (activeRange.start) query = query.gte(column, activeRange.start)
        if (activeRange.end) query = query.lte(column, activeRange.end)
        return query
      }
      const [workDateResult, deliveryDateResult, viewResult] = await Promise.allSettled([
        makeQuery('work_date'),
        makeQuery('delivery_date'),
        supabase.from('customer_delivery_analytics').select('*').limit(5000),
      ])

      const workRows = workDateResult.status === 'fulfilled' && !workDateResult.value.error ? workDateResult.value.data || [] : []
      const deliveryRows = deliveryDateResult.status === 'fulfilled' && !deliveryDateResult.value.error ? deliveryDateResult.value.data || [] : []
      const merged = mergeOrders([workRows as OrderRow[], deliveryRows as OrderRow[]]).filter(row => {
        if (!activeRange.start && !activeRange.end) return true
        const date = orderDate(row)
        return date >= activeRange.start && date <= activeRange.end
      })

      if (!merged.length && mode === 'all' && viewResult.status === 'fulfilled' && !viewResult.value.error) {
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

  useEffect(() => {
    const nextMode = searchParams.get('mode') as RangeMode | null
    if (nextMode && ['cycle', 'quarter', 'all'].includes(nextMode) && nextMode !== mode) setMode(nextMode)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (from && to && (from !== cycleRange.start || to !== cycleRange.end)) setCycleRange({ start: from, end: to })
  }, [searchParams])
  useEffect(() => { void load() }, [mode, activeRange.start, activeRange.end])

  function applyMode(nextMode: RangeMode) {
    setMode(nextMode)
    const next = new URLSearchParams(searchParams)
    next.set('mode', nextMode)
    if (nextMode !== 'all') {
      next.set('from', cycleRange.start)
      next.set('to', cycleRange.end)
    } else {
      next.delete('from')
      next.delete('to')
    }
    setSearchParams(next)
  }

  function applyCycle(from: string, to: string) {
    setCycleRange({ start: from, end: to })
    const next = new URLSearchParams(searchParams)
    next.set('mode', mode === 'all' ? 'cycle' : mode)
    next.set('from', from)
    next.set('to', to)
    if (mode === 'all') setMode('cycle')
    setSearchParams(next)
  }

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
        orders: [],
      }
      row.invoices_count += 1
      row.total_sales += amount
      row.average_invoice = row.invoices_count ? row.total_sales / row.invoices_count : 0
      row.orders.push(order)
      if (date && (!row.last_order_at || date > row.last_order_at)) row.last_order_at = date
      row.segment = row.invoices_count >= 5 || row.total_sales >= 8000 ? 'VIP' : row.invoices_count >= 2 ? 'متكرر' : 'مرة واحدة'
      grouped.set(key, row)
    }
    return [...grouped.values()].sort((a, b) => b.total_sales - a.total_sales)
  }, [orders])

  const branchOptions = useMemo(() => ['all', ...Array.from(new Set(customers.map(row => row.branch_name).filter(Boolean))).sort()], [customers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const urlFilter = searchParams.get('filter')
    const branch = searchParams.get('branch')
    const issue = searchParams.get('issue')
    let rows = customers
    if (urlFilter === 'vip') rows = rows.filter(row => row.segment === 'VIP')
    if (urlFilter === 'one_order') rows = rows.filter(row => row.invoices_count === 1)
    if (urlFilter === 'repeat') rows = rows.filter(row => row.invoices_count >= 2)
    if (urlFilter === 'stopped') rows = rows.filter(row => row.invoices_count === 0)
    if (urlFilter === 'at_risk') rows = rows.filter(row => row.invoices_count === 1 && row.total_sales < 8000)
    if (branch) rows = rows.filter(row => row.branch_name === branch)
    if (issue === 'bad_names') rows = rows.filter(row => row.customer_name.length < 3 || /^\d+$/.test(row.customer_name))
    if (segmentFilter !== 'all') rows = rows.filter(row => row.segment === segmentFilter)
    if (invoiceFilter === 'one') rows = rows.filter(row => row.invoices_count === 1)
    if (invoiceFilter === 'repeat') rows = rows.filter(row => row.invoices_count >= 2)
    if (invoiceFilter === 'vip_count') rows = rows.filter(row => row.invoices_count >= 5)
    if (invoiceFilter === 'high_value') rows = rows.filter(row => row.total_sales >= 8000)
    if (branchFilter !== 'all') rows = rows.filter(row => row.branch_name === branchFilter)
    if (q) {
      rows = rows.filter(row =>
        [row.customer_code, row.customer_name, row.phone, row.branch_name, row.segment]
          .some(value => String(value || '').toLowerCase().includes(q))
      )
    }
    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (sortBy === 'invoices') return b.invoices_count - a.invoices_count
      if (sortBy === 'latest') return String(b.last_order_at).localeCompare(String(a.last_order_at))
      if (sortBy === 'avg') return b.average_invoice - a.average_invoice
      if (sortBy === 'name') return a.customer_name.localeCompare(b.customer_name, 'ar')
      return b.total_sales - a.total_sales
    })
    return sorted
  }, [customers, search, searchParams, segmentFilter, invoiceFilter, branchFilter, sortBy])

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

  function resetFilters() {
    setSearch('')
    setSegmentFilter('all')
    setInvoiceFilter('all')
    setBranchFilter('all')
    setSortBy('sales')
  }

  return (
    <div className="text-right" dir="rtl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white bg-white p-4 shadow-sm">
          <div>
            <button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-600">
              <ArrowRight size={16}/> رجوع
            </button>
            <h1 className="text-3xl font-black text-[#061827]">تحليل العملاء</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">تحليل العملاء النشطين من فواتير التوصيل حسب دورة 26 إلى 25، آخر 3 دورات، أو طوال المدة.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => applyMode('cycle')} className={`rounded-2xl px-4 py-3 font-black ${mode === 'cycle' ? 'bg-[#008E92] text-white' : 'bg-slate-50 text-slate-700'}`}>دورة واحدة</button>
            <button onClick={() => applyMode('quarter')} className={`rounded-2xl px-4 py-3 font-black ${mode === 'quarter' ? 'bg-[#008E92] text-white' : 'bg-slate-50 text-slate-700'}`}>آخر 3 دورات</button>
            <button onClick={() => applyMode('all')} className={`rounded-2xl px-4 py-3 font-black ${mode === 'all' ? 'bg-[#008E92] text-white' : 'bg-slate-50 text-slate-700'}`}>طوال المدة</button>
            <button onClick={load} className="inline-flex items-center gap-2 rounded-3xl bg-[#008E92] px-5 py-3 font-black text-white shadow-sm">
              <RefreshCw size={18}/> تحديث
            </button>
          </div>
        </div>

        {mode !== 'all' && <CycleSelector from={cycleRange.start} to={cycleRange.end} onApply={applyCycle} />}

        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-black text-emerald-800">
          الفترة الحالية: {periodLabel}. الدورة المعتمدة في النظام تبدأ من يوم 26 وتنتهي يوم 25.
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric label={mode === 'all' ? 'فواتير طوال المدة' : mode === 'quarter' ? 'فواتير آخر 3 دورات' : 'فواتير الدورة'} value={stats.invoices} icon={<Users/>} onClick={() => setInvoiceFilter('all')}/>
          <Metric label="عملاء نشطين" value={stats.activeCustomers} icon={<Users/>} onClick={() => { setSegmentFilter('all'); setInvoiceFilter('all') }}/>
          <Metric label="إجمالي المبيعات" value={money(stats.totalSales)} icon={<TrendingUp/>} onClick={() => setSortBy('sales')}/>
          <Metric label="عملاء VIP" value={stats.vip} icon={<Star/>} onClick={() => setSegmentFilter('VIP')}/>
          <Metric label="متوسط فواتير/عميل" value={stats.avgInvoicesPerCustomer.toFixed(1)} icon={<TrendingUp/>} onClick={() => setSortBy('invoices')}/>
          <Metric label="متوسط قيمة العميل" value={money(stats.avgValuePerCustomer)} icon={<TrendingUp/>} onClick={() => setSortBy('avg')}/>
          <Metric label="طلبوا مرة واحدة" value={stats.oneTime} icon={<Users/>} onClick={() => setInvoiceFilter('one')}/>
          <Metric label="عملاء متكررون" value={stats.repeated} icon={<Users/>} onClick={() => setInvoiceFilter('repeat')}/>
        </div>

        <div className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1.7fr_1fr_1fr_1fr_1fr_auto]">
            <div className="relative">
              <Search className="absolute right-4 top-3 text-slate-400" size={20}/>
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="w-full rounded-2xl border bg-slate-50 py-3 pr-12 font-bold outline-none focus:border-[#008E92]"
                placeholder="بحث بالكود / الاسم / الهاتف / الفرع"
              />
            </div>
            <select value={segmentFilter} onChange={event => setSegmentFilter(event.target.value as SegmentFilter)} className="rounded-2xl border bg-slate-50 px-3 py-3 font-black outline-none focus:border-[#008E92]">
              <option value="all">كل التصنيفات</option>
              <option value="VIP">VIP</option>
              <option value="متكرر">متكرر</option>
              <option value="مرة واحدة">مرة واحدة</option>
            </select>
            <select value={invoiceFilter} onChange={event => setInvoiceFilter(event.target.value as InvoiceFilter)} className="rounded-2xl border bg-slate-50 px-3 py-3 font-black outline-none focus:border-[#008E92]">
              <option value="all">كل عدد الفواتير</option>
              <option value="one">فاتورة واحدة</option>
              <option value="repeat">2 فاتورة فأكثر</option>
              <option value="vip_count">5 فواتير فأكثر</option>
              <option value="high_value">قيمة 8000 فأكثر</option>
            </select>
            <select value={branchFilter} onChange={event => setBranchFilter(event.target.value)} className="rounded-2xl border bg-slate-50 px-3 py-3 font-black outline-none focus:border-[#008E92]">
              {branchOptions.map(branch => <option key={branch} value={branch}>{branch === 'all' ? 'كل الفروع' : branch}</option>)}
            </select>
            <select value={sortBy} onChange={event => setSortBy(event.target.value as SortKey)} className="rounded-2xl border bg-slate-50 px-3 py-3 font-black outline-none focus:border-[#008E92]">
              <option value="sales">ترتيب بالقيمة</option>
              <option value="invoices">ترتيب بعدد الفواتير</option>
              <option value="latest">ترتيب بآخر طلب</option>
              <option value="avg">ترتيب بمتوسط الفاتورة</option>
              <option value="name">ترتيب بالاسم</option>
            </select>
            <button onClick={resetFilters} className="rounded-2xl bg-slate-100 px-4 py-3 font-black text-slate-700 hover:bg-slate-200">مسح</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b p-4 font-black text-slate-700">
            العملاء النشطون — {loading ? 'جاري التحميل...' : `${filtered.length} عميل`} — {periodLabel}
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3"><button onClick={() => setSortBy('name')} className="font-black hover:text-[#008E92]">كود العميل</button></th>
                  <th className="p-3"><button onClick={() => setSortBy('name')} className="font-black hover:text-[#008E92]">اسم العميل</button></th>
                  <th className="p-3">الهاتف</th>
                  <th className="p-3">الفرع</th>
                  <th className="p-3"><button onClick={() => setSortBy('invoices')} className="font-black hover:text-[#008E92]">عدد الفواتير</button></th>
                  <th className="p-3"><button onClick={() => setSortBy('sales')} className="font-black hover:text-[#008E92]">القيمة</button></th>
                  <th className="p-3"><button onClick={() => setSortBy('avg')} className="font-black hover:text-[#008E92]">متوسط الفاتورة</button></th>
                  <th className="p-3"><button onClick={() => setSortBy('latest')} className="font-black hover:text-[#008E92]">آخر طلب</button></th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3">واتساب</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.key} onClick={() => setSelectedCustomer(row)} className="cursor-pointer border-t align-top transition hover:bg-emerald-50/40" title="اضغط لعرض تفاصيل العميل وفواتيره">
                    <td className="p-3 font-black">{row.customer_code || '—'}</td>
                    <td className="p-3 font-black text-[#061827]">{row.customer_name || '—'}</td>
                    <td className="p-3">{row.phone || '—'}</td>
                    <td className="p-3">{row.branch_name || '—'}</td>
                    <td className="p-3 font-black text-[#008E92]">{row.invoices_count}</td>
                    <td className="p-3 font-black">{money(row.total_sales)}</td>
                    <td className="p-3">{money(row.average_invoice)}</td>
                    <td className="p-3">{row.last_order_at || '—'}</td>
                    <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${row.segment === 'VIP' ? 'bg-amber-50 text-amber-700' : row.segment === 'متكرر' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>{row.segment}</span></td>
                    <td className="p-3">
                      {row.phone ? (
                        <a onClick={event => event.stopPropagation()} href={whatsappLink(row.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                          واتساب يدوي <ExternalLink size={12}/>
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {!loading && !filtered.length ? (
                  <tr><td colSpan={10} className="p-8 text-center font-black text-slate-400">لا توجد فواتير في الفترة المختارة</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" dir="rtl">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b bg-gradient-to-l from-[#061827] to-[#008E92] p-5 text-white">
              <div>
                <p className="text-xs font-black text-white/70">تفاصيل العميل</p>
                <h2 className="text-2xl font-black">{selectedCustomer.customer_name || 'عميل غير مسجل'}</h2>
                <p className="mt-1 text-sm font-bold text-white/80">{selectedCustomer.customer_code || 'بدون كود'} · {selectedCustomer.phone || 'بدون هاتف'} · {periodLabel}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="rounded-full bg-white/15 p-2 hover:bg-white/25"><X size={22}/></button>
            </div>
            <div className="max-h-[calc(90vh-95px)] overflow-auto p-5">
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <Metric label="عدد الفواتير" value={selectedCustomer.invoices_count} icon={<Users/>}/>
                <Metric label="إجمالي القيمة" value={money(selectedCustomer.total_sales)} icon={<TrendingUp/>}/>
                <Metric label="متوسط الفاتورة" value={money(selectedCustomer.average_invoice)} icon={<TrendingUp/>}/>
                <Metric label="التصنيف" value={selectedCustomer.segment} icon={<Star/>}/>
              </div>
              <div className="overflow-x-auto rounded-3xl border">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">التاريخ</th><th className="p-3">رقم الفاتورة</th><th className="p-3">القيمة</th><th className="p-3">الدليفري</th><th className="p-3">الحالة</th><th className="p-3">الفرع</th><th className="p-3">ملاحظات</th></tr></thead>
                  <tbody>{selectedCustomer.orders.slice().sort((a, b) => orderDate(b).localeCompare(orderDate(a))).map((order, index) => (
                    <tr key={String(order.id || index)} className="border-t"><td className="p-3">{orderDate(order) || '—'}</td><td className="p-3 font-black">{invoiceNo(order)}</td><td className="p-3 font-black">{money(orderAmount(order))}</td><td className="p-3">{order.rider_name || '—'}</td><td className="p-3">{order.status || '—'}</td><td className="p-3">{displayBranchName(order.branch_name || order.branch || '') || '—'}</td><td className="p-3">{order.notes || order.reconciliation_notes || '—'}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedCustomer.phone && <a href={whatsappLink(selectedCustomer.phone)} target="_blank" rel="noreferrer" className="rounded-2xl bg-emerald-50 px-4 py-3 font-black text-emerald-700">فتح واتساب</a>}
                <button onClick={() => setSelectedCustomer(null)} className="rounded-2xl bg-slate-100 px-4 py-3 font-black text-slate-700">إغلاق</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, icon, onClick }: { label: string; value: number | string; icon: ReactNode; onClick?: () => void }) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component type={onClick ? 'button' : undefined} onClick={onClick} title={onClick ? 'اضغط للتفاصيل' : undefined} className={`w-full rounded-3xl border bg-white p-5 text-right shadow-sm ${onClick ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-lg' : ''}`}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">{icon}</div>
      <p className="text-sm font-black text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#061827]">{value}</p>
      {onClick && <p className="mt-2 text-[11px] font-black text-slate-400">اضغط للتفاصيل</p>}
    </Component>
  )
}
