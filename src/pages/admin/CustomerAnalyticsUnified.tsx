import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ExternalLink, RefreshCw, Search, Star, TrendingUp, Users, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import CycleSelector from '../../components/CycleSelector'
import { displayBranchName } from '../../lib/branchUtils'
import { fetchAllRows } from '../../lib/fetchAllRows'

type OrderRow = Record<string, any>
type RangeMode = 'cycle' | 'quarter' | 'all'
type Segment = 'VIP' | 'متكرر' | 'مرة واحدة'
type CustomerRow = {
  key: string
  code: string
  name: string
  phone: string
  branch: string
  invoices: number
  sales: number
  average: number
  lastOrder: string
  segment: Segment
  orders: OrderRow[]
}

function localIso(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currentCycle() {
  const now = new Date()
  const start = now.getDate() >= 26
    ? new Date(now.getFullYear(), now.getMonth(), 26)
    : new Date(now.getFullYear(), now.getMonth() - 1, 26)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25)
  return { start: localIso(start), end: localIso(end) }
}

function quarterRange(startIso: string) {
  const start = new Date(`${startIso}T12:00:00`)
  return {
    start: localIso(new Date(start.getFullYear(), start.getMonth() - 2, 26)),
    end: localIso(new Date(start.getFullYear(), start.getMonth() + 1, 25)),
  }
}

function orderDate(order: OrderRow) {
  return String(order.delivery_date || order.work_date || order.registered_at || order.created_at || '').slice(0, 10)
}

function amount(order: OrderRow) {
  return Number(order.invoice_amount ?? order.invoice_value ?? order.amount ?? order.total_amount ?? 0) || 0
}

function customerKey(order: OrderRow) {
  return String(order.customer_id || order.customer_code || order.customer_code_snapshot || order.customer_phone || order.customer_phone_snapshot || order.customer_name || order.customer_name_snapshot || order.id)
}

function money(value: number) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function phoneLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return '#'
  const normalized = digits.startsWith('2') ? digits : `2${digits}`
  const text = encodeURIComponent('أهلاً بحضرتك يا فندم\nمع حضرتك صيدليات دواء\nنتشرف بخدمة حضرتك دائمًا')
  return `https://wa.me/${normalized}?text=${text}`
}

function mergeRows(groups: OrderRow[][]) {
  const map = new Map<string, OrderRow>()
  groups.flat().forEach((row, index) => map.set(String(row.id || `${customerKey(row)}-${orderDate(row)}-${index}`), row))
  return [...map.values()]
}

export default function CustomerAnalyticsUnified() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const initial = currentCycle()
  const [mode, setMode] = useState<RangeMode>((params.get('mode') as RangeMode) || 'cycle')
  const [cycle, setCycle] = useState({ start: params.get('from') || initial.start, end: params.get('to') || initial.end })
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState<'all' | Segment>('all')
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'one' | 'repeat' | 'five' | 'high'>('all')
  const [branch, setBranch] = useState('all')
  const [sort, setSort] = useState<'sales' | 'invoices' | 'latest' | 'average' | 'name'>('sales')
  const [selected, setSelected] = useState<CustomerRow | null>(null)

  const range = useMemo(() => mode === 'quarter' ? quarterRange(cycle.start) : mode === 'all' ? { start: '', end: '' } : cycle, [mode, cycle])

  async function load() {
    try {
      setLoading(true)
      setError('')
      const filters = range.start ? [
        { column: 'delivery_date', operator: 'gte' as const, value: range.start },
        { column: 'delivery_date', operator: 'lte' as const, value: range.end },
      ] : []
      const deliveryRows = await fetchAllRows<OrderRow>({ table: 'delivery_orders', filters, orderColumn: 'delivery_date', ascending: false })

      // بعض السجلات القديمة تعتمد work_date فقط؛ تُحمّل بشكل مستقل ثم تُدمج بالـ id بدون تكرار.
      let workRows: OrderRow[] = []
      try {
        const workFilters = range.start ? [
          { column: 'work_date', operator: 'gte' as const, value: range.start },
          { column: 'work_date', operator: 'lte' as const, value: range.end },
        ] : []
        workRows = await fetchAllRows<OrderRow>({ table: 'delivery_orders', filters: workFilters, orderColumn: 'work_date', ascending: false })
      } catch {
        workRows = []
      }

      const merged = mergeRows([deliveryRows, workRows]).filter(row => {
        if (!range.start) return true
        const date = orderDate(row)
        return date >= range.start && date <= range.end
      })
      setOrders(merged)
    } catch (err: any) {
      const message = err?.message || String(err)
      setError(message)
      toast.error(`تعذر تحميل تحليل العملاء: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [mode, range.start, range.end])

  const customers = useMemo(() => {
    const grouped = new Map<string, CustomerRow>()
    orders.forEach(order => {
      const key = customerKey(order)
      const current = grouped.get(key) || {
        key,
        code: String(order.customer_code || order.customer_code_snapshot || ''),
        name: String(order.customer_name || order.customer_name_snapshot || 'عميل غير مسجل'),
        phone: String(order.customer_phone || order.customer_phone_snapshot || order.phone || ''),
        branch: displayBranchName(order.branch_name || order.branch || ''),
        invoices: 0,
        sales: 0,
        average: 0,
        lastOrder: orderDate(order),
        segment: 'مرة واحدة' as Segment,
        orders: [],
      }
      current.invoices += 1
      current.sales += amount(order)
      current.average = current.sales / current.invoices
      current.orders.push(order)
      const date = orderDate(order)
      if (date > current.lastOrder) current.lastOrder = date
      current.segment = current.invoices >= 5 || current.sales >= 8000 ? 'VIP' : current.invoices >= 2 ? 'متكرر' : 'مرة واحدة'
      grouped.set(key, current)
    })
    return [...grouped.values()]
  }, [orders])

  const branches = useMemo(() => ['all', ...Array.from(new Set(customers.map(row => row.branch).filter(Boolean))).sort()], [customers])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = customers.filter(row => {
      if (segment !== 'all' && row.segment !== segment) return false
      if (invoiceFilter === 'one' && row.invoices !== 1) return false
      if (invoiceFilter === 'repeat' && row.invoices < 2) return false
      if (invoiceFilter === 'five' && row.invoices < 5) return false
      if (invoiceFilter === 'high' && row.sales < 8000) return false
      if (branch !== 'all' && row.branch !== branch) return false
      if (q && ![row.code, row.name, row.phone, row.branch].some(value => String(value).toLowerCase().includes(q))) return false
      return true
    })
    rows = [...rows].sort((a, b) => sort === 'invoices' ? b.invoices - a.invoices : sort === 'latest' ? b.lastOrder.localeCompare(a.lastOrder) : sort === 'average' ? b.average - a.average : sort === 'name' ? a.name.localeCompare(b.name, 'ar') : b.sales - a.sales)
    return rows
  }, [customers, search, segment, invoiceFilter, branch, sort])

  const stats = useMemo(() => ({
    invoices: orders.length,
    customers: customers.length,
    sales: customers.reduce((sum, row) => sum + row.sales, 0),
    vip: customers.filter(row => row.segment === 'VIP').length,
    one: customers.filter(row => row.invoices === 1).length,
    repeat: customers.filter(row => row.invoices >= 2).length,
  }), [orders, customers])

  function applyMode(next: RangeMode) {
    setMode(next)
    const searchParams = new URLSearchParams(params)
    searchParams.set('mode', next)
    if (next === 'all') { searchParams.delete('from'); searchParams.delete('to') }
    else { searchParams.set('from', cycle.start); searchParams.set('to', cycle.end) }
    setParams(searchParams)
  }

  function applyCycle(from: string, to: string) {
    setCycle({ start: from, end: to })
    setMode('cycle')
    const searchParams = new URLSearchParams(params)
    searchParams.set('mode', 'cycle'); searchParams.set('from', from); searchParams.set('to', to)
    setParams(searchParams)
  }

  return <div className="space-y-5 text-right" dir="rtl">
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-[30px] bg-white p-5 shadow-sm">
      <div><button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 font-black text-slate-600"><ArrowRight size={16}/> رجوع</button><h1 className="text-3xl font-black">تحليل العملاء</h1><p className="mt-1 font-bold text-slate-500">تحليل كامل من جميع فواتير التوصيل بدون حد 1000 سجل.</p></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => applyMode('cycle')} className={`rounded-2xl px-4 py-3 font-black ${mode === 'cycle' ? 'bg-[#008E92] text-white' : 'bg-slate-50'}`}>دورة واحدة</button>
        <button onClick={() => applyMode('quarter')} className={`rounded-2xl px-4 py-3 font-black ${mode === 'quarter' ? 'bg-[#008E92] text-white' : 'bg-slate-50'}`}>آخر 3 دورات</button>
        <button onClick={() => applyMode('all')} className={`rounded-2xl px-4 py-3 font-black ${mode === 'all' ? 'bg-[#008E92] text-white' : 'bg-slate-50'}`}>طوال المدة</button>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white disabled:opacity-60"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/> تحديث</button>
      </div>
    </section>

    {mode !== 'all' && <CycleSelector from={cycle.start} to={cycle.end} onApply={applyCycle}/>} 
    <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 font-black text-emerald-800">الفترة الحالية: {mode === 'all' ? 'طوال المدة' : `${range.start} إلى ${range.end}`}. الدورة تبدأ يوم 26 وتنتهي يوم 25.</div>
    {error && <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 font-black text-rose-700">تعذر تحميل البيانات: {error}</div>}

    <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      {[
        ['فواتير الفترة', stats.invoices, () => setInvoiceFilter('all')],
        ['عملاء نشطين', stats.customers, () => { setSegment('all'); setInvoiceFilter('all') }],
        ['إجمالي المبيعات', money(stats.sales), () => setSort('sales')],
        ['عملاء VIP', stats.vip, () => setSegment('VIP')],
        ['مرة واحدة', stats.one, () => setInvoiceFilter('one')],
        ['متكررون', stats.repeat, () => setInvoiceFilter('repeat')],
      ].map(([label, value, action]) => <button key={String(label)} onClick={action as () => void} className="rounded-3xl bg-white p-5 text-right shadow-sm transition hover:-translate-y-1 hover:shadow-md"><p className="font-black text-slate-500">{label as string}</p><p className="mt-3 text-3xl font-black text-[#008E92]">{value as any}</p></button>)}
    </section>

    <section className="rounded-3xl bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1.7fr_repeat(4,1fr)]">
        <div className="relative"><Search className="absolute right-4 top-3 text-slate-400" size={20}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالكود أو الاسم أو الهاتف" className="w-full rounded-2xl border bg-slate-50 py-3 pr-12 font-bold"/></div>
        <select value={segment} onChange={e => setSegment(e.target.value as any)} className="rounded-2xl border bg-slate-50 p-3 font-black"><option value="all">كل التصنيفات</option><option value="VIP">VIP</option><option value="متكرر">متكرر</option><option value="مرة واحدة">مرة واحدة</option></select>
        <select value={invoiceFilter} onChange={e => setInvoiceFilter(e.target.value as any)} className="rounded-2xl border bg-slate-50 p-3 font-black"><option value="all">كل الفواتير</option><option value="one">فاتورة واحدة</option><option value="repeat">2 فأكثر</option><option value="five">5 فأكثر</option><option value="high">8000 ج.م فأكثر</option></select>
        <select value={branch} onChange={e => setBranch(e.target.value)} className="rounded-2xl border bg-slate-50 p-3 font-black">{branches.map(item => <option key={item} value={item}>{item === 'all' ? 'كل الفروع' : item}</option>)}</select>
        <select value={sort} onChange={e => setSort(e.target.value as any)} className="rounded-2xl border bg-slate-50 p-3 font-black"><option value="sales">الأعلى مبيعات</option><option value="invoices">الأكثر فواتير</option><option value="latest">الأحدث</option><option value="average">أعلى متوسط</option><option value="name">الاسم</option></select>
      </div>
      <p className="mt-3 text-sm font-bold text-slate-500">عرض {filtered.length.toLocaleString('en-US')} عميل من {customers.length.toLocaleString('en-US')} — {orders.length.toLocaleString('en-US')} فاتورة كاملة.</p>
    </section>

    <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{['العميل','الكود','الهاتف','الفرع','الفواتير','المبيعات','المتوسط','آخر طلب','التصنيف'].map(h => <th key={h} className="p-3 text-right">{h}</th>)}</tr></thead><tbody>{filtered.slice(0, 1000).map(row => <tr key={row.key} onClick={() => setSelected(row)} className="cursor-pointer border-t hover:bg-slate-50"><td className="p-3 font-black">{row.name}</td><td className="p-3">{row.code || '—'}</td><td className="p-3">{row.phone || '—'}</td><td className="p-3">{row.branch || '—'}</td><td className="p-3 font-black">{row.invoices}</td><td className="p-3 font-black text-emerald-700">{money(row.sales)} ج.م</td><td className="p-3">{money(row.average)}</td><td className="p-3">{row.lastOrder || '—'}</td><td className="p-3"><span className="rounded-full bg-teal-50 px-3 py-1 font-black text-teal-700">{row.segment}</span></td></tr>)}</tbody></table></div>
      {filtered.length > 1000 && <div className="border-t p-4 text-center font-bold text-slate-500">تم عرض أول 1000 عميل لحماية سرعة الصفحة؛ استخدم البحث للوصول لأي عميل آخر.</div>}
    </section>

    {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setSelected(null)}><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white p-5" onClick={e => e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-sm font-black text-[#008E92]">تفاصيل العميل</p><h2 className="text-2xl font-black">{selected.name}</h2></div><button onClick={() => setSelected(null)} className="rounded-2xl bg-slate-100 p-3"><X/></button></div><div className="mt-4 grid gap-3 md:grid-cols-3">{[['الكود',selected.code],['الهاتف',selected.phone],['الفرع',selected.branch],['الفواتير',selected.invoices],['المبيعات',`${money(selected.sales)} ج.م`],['المتوسط',`${money(selected.average)} ج.م`]].map(([l,v]) => <div key={String(l)} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-400">{l}</p><p className="mt-1 font-black">{v || '—'}</p></div>)}</div>{selected.phone && <a href={phoneLink(selected.phone)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white"><ExternalLink size={18}/> واتساب العميل</a>}<div className="mt-5 space-y-2"><h3 className="font-black">آخر الفواتير</h3>{selected.orders.sort((a,b) => orderDate(b).localeCompare(orderDate(a))).slice(0,20).map(order => <div key={String(order.id)} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><span className="font-black">فاتورة {String(order.invoice_number || order.invoice_no || '—')}</span><span>{orderDate(order)} — {money(amount(order))} ج.م</span></div>)}</div></div></div>}
  </div>
}
