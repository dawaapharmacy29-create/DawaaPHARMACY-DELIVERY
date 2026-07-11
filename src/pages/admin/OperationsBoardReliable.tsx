import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Columns3, RefreshCcw, Search, ShieldAlert } from 'lucide-react'
import AdminModuleShell from '../../components/AdminModuleShell'
import { loadCanonicalDeliveryData } from '../../lib/canonicalDeliveryData'
import { getOperationalPeriod, wildcardMatchText } from '../../lib/helpers'
import { isDelivered, isDuplicate, isFailed, minutesOpen } from '../../lib/deliveryAnalytics'

const orderDate = (order: any) => String(order.work_date || order.delivery_date || order.registered_at || order.created_at || '').slice(0, 10)
const invoice = (order: any) => String(order.invoice_number || order.invoice_no || '—')
const closed = (order: any) => isDelivered(order) || isFailed(order) || String(order.status || '') === 'cancelled'
const ageHours = (order: any) => {
  const value = order.registered_at || order.created_at || order.delivery_date
  const timestamp = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 3600000) : 0
}
const liveOpen = (order: any) => !closed(order) && ageHours(order) <= 24
const staleOpen = (order: any) => !closed(order) && ageHours(order) > 24

export default function OperationsBoardReliable() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'live' | 'overdue' | 'stale' | 'duplicate' | 'failed' | 'delivered'>('all')
  const [selected, setSelected] = useState<any | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const data = await loadCanonicalDeliveryData(period.start, period.end)
      setOrders(data.orders)
      setRiders(data.riders.filter(rider => String(rider.status || '') === 'active'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل غرفة العمليات')
    } finally {
      setLoading(false)
    }
  }, [period.end, period.start])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 60000)
    return () => window.clearInterval(timer)
  }, [load])

  const today = new Date().toISOString().slice(0, 10)
  const riderMap = useMemo(() => new Map(riders.map(rider => [rider.id, rider])), [riders])
  const live = orders.filter(liveOpen)
  const overdue = live.filter(order => minutesOpen(order) >= 60)
  const danger = live.filter(order => minutesOpen(order) >= 120)
  const stale = orders.filter(staleOpen)
  const todayOrders = orders.filter(order => orderDate(order) === today)
  const inactive = riders.filter(rider => !todayOrders.some(order => order.rider_id === rider.id))

  const visible = orders.filter(order => {
    const rider = riderMap.get(order.rider_id)
    const matchSearch = !search.trim() || [invoice(order), order.customer_name_snapshot, order.customer_name, order.customer_code_snapshot, rider?.name].some(value => wildcardMatchText(String(value || ''), search))
    const matchFilter = filter === 'all'
      || (filter === 'live' && liveOpen(order))
      || (filter === 'overdue' && liveOpen(order) && minutesOpen(order) >= 60)
      || (filter === 'stale' && staleOpen(order))
      || (filter === 'duplicate' && isDuplicate(order))
      || (filter === 'failed' && isFailed(order))
      || (filter === 'delivered' && isDelivered(order))
    return matchSearch && matchFilter
  })

  const openInReconciliation = (order: any) => navigate(`/admin/reconciliation?invoice_number=${encodeURIComponent(invoice(order))}`)

  return <AdminModuleShell title="مركز العمليات الحي" subtitle={`بيانات كاملة من ${period.start} إلى ${period.end} · تحديث تلقائي كل دقيقة`} icon={<Columns3 />} loading={loading && orders.length === 0} onRefresh={() => load()}>
    {error && <div className="mb-4 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 font-black text-rose-700"><span>{error}</span><button type="button" onClick={() => load()}><RefreshCcw size={18}/></button></div>}

    <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Card label="أوردرات الدورة" value={orders.length} note="كامل البيانات بدون حد 1000" />
      <Card label="أوردرات اليوم" value={todayOrders.length} note={`${todayOrders.filter(isDelivered).length} تم · ${todayOrders.filter(isFailed).length} فشل`} />
      <Card label="مفتوحة حية" value={live.length} note="آخر 24 ساعة" />
      <Card label="متأخرة +60د" value={overdue.length} danger={overdue.length > 0} note="تحتاج متابعة" />
      <Card label="خطر +120د" value={danger.length} danger={danger.length > 0} note="تدخل فوري" />
      <Card label="قديمة مفتوحة" value={stale.length} note="منفصلة عن التشغيل الحي" />
    </section>

    <section className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
      <div className="relative"><Search className="absolute right-4 top-3.5 text-slate-400" size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث بالفاتورة أو العميل أو الكود أو المندوب" className="w-full rounded-2xl border bg-white py-3 pr-11 font-bold outline-none"/></div>
      <div className="flex flex-wrap gap-2">{([
        ['all','الكل',orders.length],['live','مفتوحة',live.length],['overdue','متأخرة',overdue.length],['stale','قديمة',stale.length],['duplicate','مكررة',orders.filter(isDuplicate).length],['failed','فشل',orders.filter(isFailed).length],['delivered','تم',orders.filter(isDelivered).length],
      ] as Array<[typeof filter,string,number]>).map(([key,label,count]) => <button type="button" key={key} onClick={() => setFilter(key)} className={`rounded-xl px-3 py-2 text-xs font-black ${filter === key ? 'bg-[#0b2d33] text-white' : 'bg-white text-slate-600'}`}>{label} {count}</button>)}</div>
    </section>

    {danger.length > 0 && <section className="mb-4 rounded-3xl border border-rose-200 bg-rose-50 p-4"><div className="mb-3 flex items-center gap-2 font-black text-rose-800"><AlertTriangle size={18}/> أخطر الحالات الآن</div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{danger.slice(0, 12).map(order => <button type="button" key={order.id} onClick={() => setSelected(order)} className="rounded-2xl bg-white p-3 text-right shadow-sm"><b>فاتورة {invoice(order)}</b><p className="mt-1 text-xs font-bold text-rose-700">{riderMap.get(order.rider_id)?.name || 'غير محدد'} · {Math.round(minutesOpen(order))} دقيقة</p></button>)}</div></section>}

    <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.slice(0, 180).map(order => <button type="button" key={order.id} onClick={() => setSelected(order)} className={`rounded-2xl border p-4 text-right shadow-sm ${staleOpen(order) ? 'border-amber-300 bg-amber-50' : liveOpen(order) && minutesOpen(order) >= 120 ? 'border-rose-300 bg-rose-50' : 'bg-white'}`}><div className="flex items-center justify-between gap-2"><b>فاتورة {invoice(order)}</b><span className="text-xs font-black text-teal-700">{order.status || 'غير محدد'}</span></div><p className="mt-2 text-sm font-bold text-slate-600">{order.customer_name_snapshot || order.customer_name || 'عميل غير محدد'}</p><p className="mt-1 text-xs font-bold text-slate-400">{riderMap.get(order.rider_id)?.name || 'مندوب غير محدد'} · {Math.round(minutesOpen(order))} دقيقة</p></button>)}</section>

    {visible.length > 180 && <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-center text-sm font-bold text-amber-700">يظهر أول 180 أوردر لحماية سرعة الصفحة. استخدم البحث للوصول لأي فاتورة أخرى.</p>}

    <section className="mb-4 rounded-3xl border bg-white p-4"><div className="mb-3 flex items-center gap-2"><ShieldAlert size={18}/><h3 className="font-black">مراجعة جودة البيانات</h3></div><p className="text-sm font-bold text-slate-600">يوجد {stale.length} أوردر قديم مفتوح و{inactive.length} مندوب بدون أوردر اليوم. تم فصل الأوردرات القديمة عن التنبيهات الحية حتى لا تظهر تأخيرات غير منطقية مثل 15,000 دقيقة.</p></section>

    {selected && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}><div className="w-full max-w-lg rounded-3xl bg-white p-5" onClick={event => event.stopPropagation()}><h3 className="text-xl font-black">فاتورة {invoice(selected)}</h3><p className="mt-2 font-bold text-slate-600">{selected.customer_name_snapshot || selected.customer_name || 'عميل غير محدد'}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><Info label="المندوب" value={riderMap.get(selected.rider_id)?.name || 'غير محدد'} /><Info label="الحالة" value={String(selected.status || 'غير محدد')} /><Info label="منذ" value={`${Math.round(minutesOpen(selected))} دقيقة`} /><Info label="التاريخ" value={orderDate(selected) || 'غير محدد'} /></div><button type="button" onClick={() => openInReconciliation(selected)} className="mt-4 w-full rounded-2xl bg-[#008E92] px-4 py-3 font-black text-white">فتح التفاصيل في المطابقة</button></div></div>}
  </AdminModuleShell>
}

function Card({ label, value, note, danger = false }: { label: string; value: number; note: string; danger?: boolean }) {
  return <div className={`rounded-2xl p-4 shadow-sm ${danger ? 'border border-rose-200 bg-rose-50 text-rose-900' : 'bg-white'}`}><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{note}</p></div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-1 font-black">{value}</p></div>
}
