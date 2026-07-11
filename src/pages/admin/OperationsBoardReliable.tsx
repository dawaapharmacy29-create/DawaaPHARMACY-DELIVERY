import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock3, Columns3, RefreshCcw, Search, ShieldAlert, Truck, Users } from 'lucide-react'
import AdminModuleShell from '../../components/AdminModuleShell'
import { loadCanonicalDeliveryData } from '../../lib/canonicalDeliveryData'
import { displayBranchName } from '../../lib/branchUtils'
import { formatDateTime, getOperationalPeriod, wildcardMatchText } from '../../lib/helpers'
import { isDelivered, isDuplicate, isFailed, minutesOpen, orderAmount } from '../../lib/deliveryAnalytics'

type OpsFilter = 'all' | 'live_open' | 'overdue' | 'danger' | 'stale' | 'duplicate' | 'failed' | 'delivered' | 'inactive_today'
type LoadState = { loading: boolean; error: string; loadedAt: Date | null }

const FILTERS: OpsFilter[] = ['all', 'live_open', 'overdue', 'danger', 'stale', 'duplicate', 'failed', 'delivered', 'inactive_today']
const normFilter = (value: string | null): OpsFilter => FILTERS.includes(value as OpsFilter) ? value as OpsFilter : 'all'
const orderDay = (order: any) => String(order.work_date || order.delivery_date || order.registered_at || order.created_at || '').slice(0, 10)
const invoice = (order: any) => String(order.invoice_number || order.invoice_no || '—')
const customerCode = (order: any) => String(order.customer_code_snapshot || order.customer_code || '—')
const createdAt = (order: any) => String(order.registered_at || order.created_at || order.delivery_date || '')
const closed = (order: any) => isDelivered(order) || isFailed(order) || ['cancelled', 'rejected', 'returned'].includes(String(order.status || '').toLowerCase())
const hoursOld = (order: any) => {
  const timestamp = new Date(createdAt(order)).getTime()
  return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 36e5) : 0
}
const liveOpen = (order: any) => !closed(order) && hoursOld(order) <= 24
const staleOpen = (order: any) => !closed(order) && hoursOld(order) > 24
const overdue60 = (order: any) => liveOpen(order) && minutesOpen(order) >= 60
const overdue120 = (order: any) => liveOpen(order) && minutesOpen(order) >= 120

export default function OperationsBoardReliable() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [params, setParams] = useSearchParams()
  const [orders, setOrders] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [state, setState] = useState<LoadState>({ loading: true, error: '', loadedAt: null })
  const [filter, setFilter] = useState<OpsFilter>(normFilter(params.get('filter')))
  const [search, setSearch] = useState(params.get('q') || '')
  const [branchId, setBranchId] = useState(params.get('branch') || 'all')
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)

  const load = useCallback(async (silent = false) => {
    setState(previous => ({ ...previous, loading: !silent, error: '' }))
    try {
      const data = await loadCanonicalDeliveryData(period.start, period.end)
      setOrders(data.orders)
      setTrips(data.trips)
      setRiders(data.riders.filter(rider => String(rider.status || '').toLowerCase() === 'active'))
      setBranches(data.branches)
      setState({ loading: false, error: '', loadedAt: new Date() })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'تعذر تحميل بيانات غرفة العمليات'
      setState(previous => ({ ...previous, loading: false, error: message }))
    }
  }, [period.end, period.start])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 60_000)
    return () => window.clearInterval(timer)
  }, [load])
  useEffect(() => {
    const next = new URLSearchParams()
    if (filter !== 'all') next.set('filter', filter)
    if (search.trim()) next.set('q', search.trim())
    if (branchId !== 'all') next.set('branch', branchId)
    setParams(next, { replace: true })
  }, [branchId, filter, search, setParams])

  const today = new Date().toISOString().slice(0, 10)
  const branchMap = useMemo(() => new Map(branches.map(branch => [branch.id, branch])), [branches])
  const riderMap = useMemo(() => new Map(riders.map(rider => [rider.id, rider])), [riders])
  const scopedOrders = useMemo(() => orders.filter(order => branchId === 'all' || String(order.branch_id || '') === branchId), [branchId, orders])
  const scopedRiders = useMemo(() => riders.filter(rider => branchId === 'all' || String(rider.branch_id || '') === branchId), [branchId, riders])
  const inactiveToday = useMemo(() => scopedRiders.filter(rider => !scopedOrders.some(order => order.rider_id === rider.id && orderDay(order) === today)), [scopedOrders, scopedRiders, today])

  const filteredOrders = useMemo(() => scopedOrders.filter(order => {
    const rider = riderMap.get(order.rider_id)
    const searchOk = !search.trim() || [invoice(order), customerCode(order), order.customer_name_snapshot, order.customer_name, order.customer_phone_snapshot, rider?.name, rider?.username].some(value => wildcardMatchText(String(value || ''), search))
    const filterOk = filter === 'all'
      || (filter === 'live_open' && liveOpen(order))
      || (filter === 'overdue' && overdue60(order))
      || (filter === 'danger' && overdue120(order))
      || (filter === 'stale' && staleOpen(order))
      || (filter === 'duplicate' && isDuplicate(order))
      || (filter === 'failed' && isFailed(order))
      || (filter === 'delivered' && isDelivered(order))
      || filter === 'inactive_today'
    return searchOk && filterOk
  }), [filter, riderMap, scopedOrders, search])

  const todayOrders = scopedOrders.filter(order => orderDay(order) === today)
  const deliveredToday = todayOrders.filter(isDelivered).length
  const failedToday = todayOrders.filter(isFailed).length
  const liveOrders = scopedOrders.filter(liveOpen)
  const overdueOrders = scopedOrders.filter(overdue60)
  const dangerOrders = scopedOrders.filter(overdue120)
  const staleOrders = scopedOrders.filter(staleOpen)
  const duplicateOrders = scopedOrders.filter(isDuplicate)
  const successToday = todayOrders.length ? deliveredToday / todayOrders.length * 100 : 0
  const urgent = [...overdueOrders].sort((a, b) => minutesOpen(b) - minutesOpen(a)).slice(0, 12)

  const columns = [
    { key: 'registered', label: 'مسجل', rows: filteredOrders.filter(order => liveOpen(order) && !['ready', 'dispatched', 'picked_up', 'on_the_way'].includes(String(order.dispatch_status || ''))) },
    { key: 'ready', label: 'جاهز', rows: filteredOrders.filter(order => liveOpen(order) && String(order.dispatch_status || '') === 'ready') },
    { key: 'dispatched', label: 'في الطريق', rows: filteredOrders.filter(order => liveOpen(order) && ['dispatched', 'picked_up', 'on_the_way'].includes(String(order.dispatch_status || ''))) },
    { key: 'delivered', label: 'تم التسليم اليوم', rows: filteredOrders.filter(order => orderDay(order) === today && isDelivered(order)) },
    { key: 'failed', label: 'فشل اليوم', rows: filteredOrders.filter(order => orderDay(order) === today && isFailed(order)) },
  ]

  const riderRows = scopedRiders.map(rider => {
    const riderOrders = scopedOrders.filter(order => order.rider_id === rider.id)
    const riderToday = riderOrders.filter(order => orderDay(order) === today)
    return {
      rider,
      today: riderToday.length,
      delivered: riderToday.filter(isDelivered).length,
      failed: riderToday.filter(isFailed).length,
      open: riderOrders.filter(liveOpen).length,
      overdue: riderOrders.filter(overdue60).length,
      trips: trips.filter(trip => trip.rider_id === rider.id && String(trip.trip_date || trip.work_date || '').slice(0, 10) === today).length,
    }
  }).sort((a, b) => b.open - a.open || b.today - a.today)

  const openReconciliation = (order: any) => navigate(`/admin/reconciliation?invoice_number=${encodeURIComponent(invoice(order))}`)

  return <AdminModuleShell title="مركز العمليات الحي" subtitle={`بيانات الدورة الكاملة ${period.start} إلى ${period.end} · تحديث تلقائي كل دقيقة`} icon={<Columns3 />} loading={state.loading && !orders.length} onRefresh={() => load()}>
    {state.error && <div className="mb-4 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700"><span>{state.error}</span><button type="button" onClick={() => load()} className="rounded-xl bg-white px-3 py-2"><RefreshCcw size={16}/></button></div>}

    <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={<Columns3 size={18}/>} label="أوردرات الدورة" value={scopedOrders.length} note="بدون حد 1000" />
      <Metric icon={<Truck size={18}/>} label="أوردرات اليوم" value={todayOrders.length} note={`${deliveredToday} تم · ${failedToday} فشل`} />
      <Metric icon={<Clock3 size={18}/>} label="مفتوحة فعليًا" value={liveOrders.length} note="آخر 24 ساعة" />
      <Metric icon={<AlertTriangle size={18}/>} label="متأخرة +60 دقيقة" value={overdueOrders.length} danger={overdueOrders.length > 0} note="تشغيل حي فقط" />
      <Metric icon={<ShieldAlert size={18}/>} label="خطر +120 دقيقة" value={dangerOrders.length} danger={dangerOrders.length > 0} note="تدخل فوري" />
      <Metric icon={<CheckCircle2 size={18}/>} label="نجاح اليوم" value={`${successToday.toFixed(1)}%`} note="من أوردرات اليوم" />
    </section>

    <section className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
      <div className="relative"><Search className="absolute right-4 top-3.5 text-slate-400" size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث بالفاتورة، العميل، الكود، الهاتف أو المندوب" className="w-full rounded-2xl border bg-white py-3 pr-11 font-bold outline-none focus:border-teal-500"/></div>
      <select value={branchId} onChange={event => setBranchId(event.target.value)} className="rounded-2xl border bg-white px-4 py-3 font-black"><option value="all">كل الفروع</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{displayBranchName(branch.display_name || branch.name || branch.id)}</option>)}</select>
      <div className="rounded-2xl bg-white px-4 py-3 text-xs font-bold text-slate-500">آخر تحديث: {state.loadedAt ? state.loadedAt.toLocaleTimeString('ar-EG') : '—'}</div>
    </section>

    <div className="mb-4 flex flex-wrap gap-2">{([
      ['all', 'الكل', scopedOrders.length], ['live_open', 'مفتوحة حية', liveOrders.length], ['overdue', 'متأخرة +60د', overdueOrders.length], ['danger', 'خطر +120د', dangerOrders.length], ['stale', 'قديمة مفتوحة', staleOrders.length], ['duplicate', 'مكررة', duplicateOrders.length], ['failed', 'فشل', scopedOrders.filter(isFailed).length], ['delivered', 'تم', scopedOrders.filter(isDelivered).length], ['inactive_today', 'بدون أوردر اليوم', inactiveToday.length],
    ] as Array<[OpsFilter, string, number]>).map(([key, label, count]) => <button type="button" key={key} onClick={() => setFilter(key)} className={`rounded-xl px-3 py-2 text-xs font-black ${filter === key ? 'bg-[#0b2d33] text-white' : 'bg-white text-slate-600'}`}>{label} {count}</button>)}</div>

    {urgent.length > 0 && <section className="mb-4 rounded-3xl border border-rose-200 bg-rose-50 p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 font-black text-rose-800"><AlertTriangle size={18}/> تنبيهات تشغيل عاجلة</div><span className="text-xs font-bold text-rose-600">الحالات الأقدم من 24 ساعة منفصلة</span></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{urgent.map(order => <button type="button" key={order.id} onClick={() => setSelectedOrder(order)} className="rounded-2xl border border-rose-100 bg-white p-3 text-right shadow-sm"><b className="block text-rose-800">فاتورة {invoice(order)}</b><span className="mt-1 block text-xs font-bold text-slate-500">{riderMap.get(order.rider_id)?.name || 'غير محدد'} · {Math.round(minutesOpen(order))} دقيقة</span></button>)}</div></section>}

    {filter === 'inactive_today' ? <section className="mb-4 rounded-3xl border bg-white p-4"><h3 className="mb-3 font-black">مناديب بدون أوردر اليوم</h3><div className="grid gap-3 md:grid-cols-3">{inactiveToday.map(rider => <div key={rider.id} className="rounded-2xl bg-slate-50 p-4"><b>{rider.name}</b><p className="mt-1 text-xs text-slate-400">{rider.username || 'بدون username'}</p></div>)}</div></section> : <section className="mb-4 grid gap-4 xl:grid-cols-5">{columns.map(column => <div key={column.key} className="min-h-[360px] rounded-3xl border bg-slate-50 p-3"><div className="mb-3 flex items-center justify-between"><b>{column.label}</b><span className="rounded-full bg-white px-2 py-1 text-xs font-black">{column.rows.length}</span></div><div className="max-h-[56vh] space-y-3 overflow-y-auto">{column.rows.slice(0, 120).map(order => <OrderCard key={order.id} order={order} rider={riderMap.get(order.rider_id)} onOpen={() => setSelectedOrder(order)} />)}{!column.rows.length && <p className="py-10 text-center text-xs text-slate-400">لا توجد أوردرات</p>}{column.rows.length > 120 && <p className="rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-700">يظهر أول 120 لتحسين السرعة؛ استخدم البحث للباقي.</p>}</div></div>)}</section>}

    <section className="mb-4 rounded-3xl border bg-white p-4"><div className="mb-3 flex items-center gap-2"><Users size={18}/><h3 className="font-black">حالة المناديب اليوم</h3></div><div className="overflow-x-auto"><table className="min-w-full text-right text-sm"><thead><tr className="border-b text-xs text-slate-400"><th className="p-3">المندوب</th><th className="p-3">الفرع</th><th className="p-3">اليوم</th><th className="p-3">تم</th><th className="p-3">فشل</th><th className="p-3">مفتوح</th><th className="p-3">متأخر</th><th className="p-3">مشاوير</th></tr></thead><tbody>{riderRows.map(row => <tr key={row.rider.id} className="border-b last:border-0"><td className="p-3 font-black">{row.rider.name}</td><td className="p-3 text-slate-500">{displayBranchName(branchMap.get(row.rider.branch_id)?.display_name || branchMap.get(row.rider.branch_id)?.name || row.rider.branch_name || '')}</td><td className="p-3">{row.today}</td><td className="p-3 font-black text-emerald-700">{row.delivered}</td><td className="p-3 font-black text-rose-700">{row.failed}</td><td className="p-3 font-black">{row.open}</td><td className="p-3 font-black text-amber-700">{row.overdue}</td><td className="p-3">{row.trips}</td></tr>)}</tbody></table></div></section>

    {staleOrders.length > 0 && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><ShieldAlert className="text-amber-700" size={20}/><div><h3 className="font-black text-amber-900">يوجد {staleOrders.length} أوردر قديم ما زال مفتوحًا</h3><p className="mt-1 text-sm font-bold text-amber-700">تم فصلها عن غرفة التشغيل الحية حتى لا تظهر تأخيرات غير منطقية مثل 15,000 دقيقة. افتح فلتر «قديمة مفتوحة» لمراجعتها.</p></div></div></section>}

    {selectedOrder && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedOrder(null)}><div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl" dir="rtl" onClick={event => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><div><h3 className="text-xl font-black">فاتورة {invoice(selectedOrder)}</h3><p className="text-sm text-slate-400">{selectedOrder.customer_name_snapshot || selectedOrder.customer_name || 'عميل غير محدد'}</p></div><button type="button" onClick={() => setSelectedOrder(null)} className="rounded-xl bg-slate-100 px-3 py-2 font-black">إغلاق</button></div><div className="grid gap-3 sm:grid-cols-2"><Detail label="المندوب" value={riderMap.get(selectedOrder.rider_id)?.name || 'غير محدد'} /><Detail label="كود العميل" value={customerCode(selectedOrder)} /><Detail label="القيمة" value={`${orderAmount(selectedOrder).toLocaleString('ar-EG')} ج`} /><Detail label="الحالة" value={String(selectedOrder.status || 'غير محدد')} /><Detail label="منذ" value={`${Math.round(minutesOpen(selectedOrder))} دقيقة`} /><Detail label="وقت التسجيل" value={formatDateTime(selectedOrder.registered_at || selectedOrder.created_at)} /></div><button type="button" onClick={() => openReconciliation(selectedOrder)} className="mt-4 w-full rounded-2xl bg-[#008E92] px-4 py-3 font-black text-white">فتح الفاتورة في المطابقة</button></div></div>}
  </AdminModuleShell>
}

function Metric({ icon, label, value, note, danger }: { icon: ReactNode; label: string; value: number | string; note: string; danger?: boolean }) {
  return <div className={`rounded-2xl p-4 shadow-sm ${danger ? 'border border-rose-200 bg-rose-50 text-rose-900' : 'bg-white'}`}><div className="flex items-center justify-between text-xs font-black text-slate-500"><span>{label}</span>{icon}</div><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{note}</p></div>
}

function OrderCard({ order, rider, onOpen }: { order: any; rider: any; onOpen: () => void }) {
  const urgent = overdue120(order)
  const warning = overdue60(order)
  return <button type="button" onClick={onOpen} className={`w-full rounded-2xl border p-3 text-right shadow-sm ${urgent ? 'border-rose-400 bg-rose-50' : warning ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}><div className="mb-2 flex items-start justify-between gap-2"><b className="truncate">{order.customer_name_snapshot || order.customer_name || 'عميل غير محدد'}</b><span className="whitespace-nowrap text-xs font-black text-teal-700">{orderAmount(order).toLocaleString('ar-EG')} ج</span></div><p className="text-[11px] font-bold text-slate-400">فاتورة #{invoice(order)} · كود {customerCode(order)}</p><p className="mt-2 border-t pt-2 text-[11px] font-bold text-slate-500">{rider?.name || 'غير محدد'} · {Math.round(minutesOpen(order))} دقيقة</p><p className="text-[11px] font-bold text-slate-400">{formatDateTime(order.registered_at || order.created_at)}</p></button>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-1 font-black text-slate-800">{value}</p></div>
}
