import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock3, Columns, RefreshCcw, Search, ShieldAlert, Truck, Users } from 'lucide-react'
import AdminModuleShell from '../../components/AdminModuleShell'
import { loadCanonicalDeliveryData } from '../../lib/canonicalDeliveryData'
import { displayBranchName } from '../../lib/branchUtils'
import { formatDateTime, getOperationalPeriod, wildcardMatchText } from '../../lib/helpers'
import { isDelivered, isDuplicate, isFailed, minutesOpen, orderAmount } from '../../lib/deliveryAnalytics'

type ViewMode = 'live' | 'riders' | 'quality'
type LiveFilter = 'all' | 'registered' | 'ready' | 'dispatched' | 'overdue' | 'danger'

const orderDate = (o: any) => String(o.work_date || o.delivery_date || o.registered_at || o.created_at || '').slice(0, 10)
const invoice = (o: any) => String(o.invoice_number || o.invoice_no || '—')
const customerCode = (o: any) => String(o.customer_code_snapshot || o.customer_code || '—')
const customerName = (o: any) => String(o.customer_name_snapshot || o.customer_name || 'عميل غير محدد')
const closed = (o: any) => isDelivered(o) || isFailed(o) || ['cancelled', 'rejected', 'returned'].includes(String(o.status || '').toLowerCase())
const ageHours = (o: any) => { const raw = o.registered_at || o.created_at || o.delivery_date; const ts = raw ? new Date(raw).getTime() : NaN; return Number.isFinite(ts) ? Math.max(0, (Date.now() - ts) / 36e5) : 0 }
const liveOpen = (o: any) => !closed(o) && ageHours(o) <= 24
const staleOpen = (o: any) => !closed(o) && ageHours(o) > 24
const stage = (o: any) => { const s = String(o.dispatch_status || '').toLowerCase(); if (['dispatched', 'picked_up', 'on_the_way'].includes(s)) return 'dispatched'; if (s === 'ready') return 'ready'; return 'registered' }

export default function OperationsBoardReliable() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [branchId, setBranchId] = useState('all')
  const [view, setView] = useState<ViewMode>('live')
  const [filter, setFilter] = useState<LiveFilter>('all')
  const [selected, setSelected] = useState<any | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const data = await loadCanonicalDeliveryData(period.start, period.end)
      setOrders(data.orders)
      setTrips(data.trips)
      setRiders(data.riders.filter(r => String(r.status || '').toLowerCase() === 'active'))
      setBranches(data.branches)
      setLoadedAt(new Date())
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل غرفة العمليات') }
    finally { setLoading(false) }
  }, [period.end, period.start])

  useEffect(() => { void load() }, [load])
  useEffect(() => { const id = window.setInterval(() => void load(true), 60000); return () => window.clearInterval(id) }, [load])

  const today = new Date().toISOString().slice(0, 10)
  const branchMap = useMemo(() => new Map(branches.map(b => [b.id, b])), [branches])
  const riderMap = useMemo(() => new Map(riders.map(r => [r.id, r])), [riders])
  const scopedOrders = useMemo(() => orders.filter(o => branchId === 'all' || String(o.branch_id || '') === branchId), [branchId, orders])
  const scopedRiders = useMemo(() => riders.filter(r => branchId === 'all' || String(r.branch_id || '') === branchId), [branchId, riders])
  const todayOrders = useMemo(() => scopedOrders.filter(o => orderDate(o) === today), [scopedOrders, today])
  const live = useMemo(() => scopedOrders.filter(liveOpen), [scopedOrders])
  const overdue = useMemo(() => live.filter(o => minutesOpen(o) >= 60), [live])
  const danger = useMemo(() => live.filter(o => minutesOpen(o) >= 120), [live])
  const stale = useMemo(() => scopedOrders.filter(staleOpen), [scopedOrders])
  const duplicates = useMemo(() => scopedOrders.filter(isDuplicate), [scopedOrders])
  const inactive = useMemo(() => scopedRiders.filter(r => !todayOrders.some(o => o.rider_id === r.id)), [scopedRiders, todayOrders])

  const searchedLive = useMemo(() => live.filter(o => {
    const rider = riderMap.get(o.rider_id)
    const searchOk = !search.trim() || [invoice(o), customerName(o), customerCode(o), o.customer_phone_snapshot, rider?.name, rider?.username].some(v => wildcardMatchText(String(v || ''), search))
    const state = stage(o)
    const filterOk = filter === 'all' || filter === state || (filter === 'overdue' && minutesOpen(o) >= 60) || (filter === 'danger' && minutesOpen(o) >= 120)
    return searchOk && filterOk
  }), [filter, live, riderMap, search])

  const columns = useMemo(() => [
    { key: 'registered', label: 'مسجل ولم يخرج', rows: searchedLive.filter(o => stage(o) === 'registered') },
    { key: 'ready', label: 'جاهز للاستلام', rows: searchedLive.filter(o => stage(o) === 'ready') },
    { key: 'dispatched', label: 'في الطريق', rows: searchedLive.filter(o => stage(o) === 'dispatched') },
  ], [searchedLive])

  const riderRows = useMemo(() => scopedRiders.map(rider => {
    const todayRows = todayOrders.filter(o => o.rider_id === rider.id)
    const liveRows = live.filter(o => o.rider_id === rider.id)
    const delivered = todayRows.filter(isDelivered).length
    const failed = todayRows.filter(isFailed).length
    const riderTrips = trips.filter(t => t.rider_id === rider.id && String(t.trip_date || t.work_date || '').slice(0, 10) === today).length
    return { rider, total: todayRows.length, delivered, failed, open: liveRows.length, overdue: liveRows.filter(o => minutesOpen(o) >= 60).length, trips: riderTrips, success: todayRows.length ? delivered / todayRows.length * 100 : 0 }
  }).sort((a, b) => b.open - a.open || b.total - a.total), [live, scopedRiders, today, todayOrders, trips])

  const openInReconciliation = (o: any) => navigate(`/admin/reconciliation?invoice_number=${encodeURIComponent(invoice(o))}`)

  return <AdminModuleShell title="غرفة العمليات" subtitle={`تشغيل اليوم لحظة بلحظة · الدورة ${period.start} إلى ${period.end}`} icon={<Columns />} loading={loading && orders.length === 0} onRefresh={() => load()}>
    {error && <div className="mb-4 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 font-black text-rose-700"><span>{error}</span><button type="button" onClick={() => load()} className="rounded-xl bg-white p-2"><RefreshCcw size={18}/></button></div>}

    <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={<Truck size={18}/>} label="أوردرات اليوم" value={todayOrders.length} note={`${todayOrders.filter(isDelivered).length} تم · ${todayOrders.filter(isFailed).length} فشل`} />
      <Metric icon={<Clock3 size={18}/>} label="مفتوحة الآن" value={live.length} note="آخر 24 ساعة" />
      <Metric icon={<AlertTriangle size={18}/>} label="متأخرة +60د" value={overdue.length} note="تحتاج متابعة" danger={overdue.length > 0} />
      <Metric icon={<ShieldAlert size={18}/>} label="خطر +120د" value={danger.length} note="تدخل فوري" danger={danger.length > 0} />
      <Metric icon={<Users size={18}/>} label="دليفري بلا أوردر" value={inactive.length} note="راجع الشيفت والحضور" />
      <Metric icon={<CheckCircle2 size={18}/>} label="نجاح اليوم" value={`${todayOrders.length ? (todayOrders.filter(isDelivered).length / todayOrders.length * 100).toFixed(1) : '0.0'}%`} note={`إجمالي الدورة ${scopedOrders.length}`} />
    </section>

    <section className="mb-4 rounded-3xl border bg-white p-3 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <div className="relative"><Search className="absolute right-4 top-3.5 text-slate-400" size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالفاتورة أو العميل أو الكود أو الهاتف أو المندوب" className="w-full rounded-2xl border bg-slate-50 py-3 pr-11 font-bold outline-none focus:border-teal-500"/></div>
        <select value={branchId} onChange={e => setBranchId(e.target.value)} className="rounded-2xl border bg-slate-50 px-4 py-3 font-black"><option value="all">كل الفروع</option>{branches.map(b => <option key={b.id} value={b.id}>{displayBranchName(b.display_name || b.name || b.id)}</option>)}</select>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">آخر تحديث: {loadedAt ? loadedAt.toLocaleTimeString('ar-EG') : '—'}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{([['live','التشغيل الحي'],['riders','حالة المناديب'],['quality','جودة البيانات']] as Array<[ViewMode,string]>).map(([k,l]) => <button key={k} type="button" onClick={() => setView(k)} className={`rounded-xl px-4 py-2 text-sm font-black ${view === k ? 'bg-[#008E92] text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>)}</div>
    </section>

    {view === 'live' && <>
      <div className="mb-4 flex flex-wrap gap-2">{([['all','كل المفتوحة',live.length],['registered','مسجل',columns[0].rows.length],['ready','جاهز',columns[1].rows.length],['dispatched','في الطريق',columns[2].rows.length],['overdue','متأخرة',overdue.length],['danger','خطر',danger.length]] as Array<[LiveFilter,string,number]>).map(([k,l,c]) => <button type="button" key={k} onClick={() => setFilter(k)} className={`rounded-xl px-3 py-2 text-xs font-black ${filter === k ? 'bg-[#0b2d33] text-white' : 'bg-white text-slate-600'}`}>{l} {c}</button>)}</div>
      {danger.length > 0 && <section className="mb-4 rounded-3xl border border-rose-200 bg-rose-50 p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 font-black text-rose-800"><AlertTriangle size={18}/> قرارات عاجلة الآن</div><span className="text-xs font-bold text-rose-600">مرتبة من الأقدم</span></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{danger.sort((a,b) => minutesOpen(b)-minutesOpen(a)).slice(0,9).map(o => <button type="button" key={o.id} onClick={() => setSelected(o)} className="rounded-2xl border border-rose-100 bg-white p-3 text-right shadow-sm"><b>فاتورة {invoice(o)}</b><p className="mt-1 text-xs font-bold text-rose-700">{riderMap.get(o.rider_id)?.name || 'غير محدد'} · {Math.round(minutesOpen(o))} دقيقة</p><p className="mt-1 truncate text-xs text-slate-400">{customerName(o)}</p></button>)}</div></section>}
      <section className="grid gap-4 xl:grid-cols-3">{columns.map(col => <div key={col.key} className="rounded-3xl border bg-slate-50 p-3"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-black">{col.label}</h3><p className="text-xs font-bold text-slate-400">اضغط على الأوردر لعرض التفاصيل</p></div><span className="rounded-full bg-white px-3 py-1 text-sm font-black">{col.rows.length}</span></div><div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">{col.rows.slice(0,80).map(o => <OrderCard key={o.id} order={o} rider={riderMap.get(o.rider_id)} onClick={() => setSelected(o)} />)}{!col.rows.length && <p className="py-12 text-center text-sm font-bold text-slate-400">لا توجد أوردرات</p>}{col.rows.length > 80 && <p className="rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-700">يظهر أول 80 أوردر. استخدم البحث للوصول للباقي.</p>}</div></div>)}</section>
    </>}

    {view === 'riders' && <section className="rounded-3xl border bg-white p-4"><div className="mb-4 flex items-center gap-2"><Users size={18}/><div><h3 className="font-black">حالة المناديب اليوم</h3><p className="text-xs font-bold text-slate-400">الأوردرات والمشاوير والتأخير لكل مندوب</p></div></div><div className="overflow-x-auto"><table className="min-w-full text-right text-sm"><thead><tr className="border-b text-xs text-slate-400"><th className="p-3">المندوب</th><th className="p-3">الفرع</th><th className="p-3">اليوم</th><th className="p-3">تم</th><th className="p-3">فشل</th><th className="p-3">مفتوح</th><th className="p-3">متأخر</th><th className="p-3">مشاوير</th><th className="p-3">نجاح</th></tr></thead><tbody>{riderRows.map(row => <tr key={row.rider.id} className={`border-b last:border-0 ${row.overdue ? 'bg-rose-50' : ''}`}><td className="p-3 font-black">{row.rider.name}</td><td className="p-3 text-slate-500">{displayBranchName(branchMap.get(row.rider.branch_id)?.display_name || branchMap.get(row.rider.branch_id)?.name || row.rider.branch_name || '')}</td><td className="p-3">{row.total}</td><td className="p-3 font-black text-emerald-700">{row.delivered}</td><td className="p-3 font-black text-rose-700">{row.failed}</td><td className="p-3 font-black">{row.open}</td><td className="p-3 font-black text-amber-700">{row.overdue}</td><td className="p-3">{row.trips}</td><td className="p-3 font-black">{row.success.toFixed(0)}%</td></tr>)}</tbody></table></div></section>}

    {view === 'quality' && <section className="grid gap-4 lg:grid-cols-2"><QualityCard title="أوردرات قديمة مفتوحة" count={stale.length} text="أقدم من 24 ساعة ولم تُغلق حالتها. لا تدخل في التنبيهات الحية لكنها تحتاج تصحيح." action="فتح المطابقة" onClick={() => navigate('/admin/reconciliation?filter=pending')} danger /><QualityCard title="فواتير مكررة" count={duplicates.length} text="تحتاج اعتماد أو رفض سبب التكرار حتى لا تؤثر على المطابقة والحوافز." action="فتح المكررة" onClick={() => navigate('/admin/reconciliation?filter=duplicate')} /><QualityCard title="مناديب بلا أوردر اليوم" count={inactive.length} text="راجع الحضور والشيفت والجلسة قبل اعتبار المندوب غير نشط." action="بيانات المناديب" onClick={() => navigate('/admin/riders')} /><QualityCard title="إجمالي الدورة" count={scopedOrders.length} text={`البيانات كاملة من ${period.start} إلى ${period.end} بدون حد 1000.`} action="لوحة الإدارة العليا" onClick={() => navigate('/admin/executive')} /></section>}

    {selected && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}><div className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl" dir="rtl" onClick={e => e.stopPropagation()}><div className="mb-4 flex items-start justify-between"><div><h3 className="text-2xl font-black">فاتورة {invoice(selected)}</h3><p className="mt-1 font-bold text-slate-500">{customerName(selected)}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-xl bg-slate-100 px-3 py-2 font-black">إغلاق</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Info label="المندوب" value={riderMap.get(selected.rider_id)?.name || 'غير محدد'} /><Info label="الفرع" value={displayBranchName(branchMap.get(selected.branch_id)?.display_name || branchMap.get(selected.branch_id)?.name || selected.branch_name || '')} /><Info label="الحالة" value={String(selected.status || '—')} /><Info label="مرحلة التشغيل" value={stage(selected)} /><Info label="مدة الانتظار" value={`${Math.round(minutesOpen(selected))} دقيقة`} /><Info label="القيمة" value={`${orderAmount(selected).toLocaleString('en-US')} ج.م`} /><Info label="العميل" value={customerName(selected)} /><Info label="الكود" value={customerCode(selected)} /><Info label="التسجيل" value={formatDateTime(selected.registered_at || selected.created_at)} /></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => openInReconciliation(selected)} className="rounded-xl bg-[#008E92] px-4 py-2 font-black text-white">فتح في المطابقة</button><button type="button" onClick={() => navigate(`/admin/riders/${selected.rider_id}/performance`)} className="rounded-xl bg-slate-900 px-4 py-2 font-black text-white">أداء المندوب</button></div></div></div>}
  </AdminModuleShell>
}

function Metric({ icon, label, value, note, danger = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; note: string; danger?: boolean }) { return <div className={`rounded-3xl border p-4 shadow-sm ${danger ? 'border-rose-200 bg-rose-50' : 'bg-white'}`}><div className="flex items-center justify-between"><span className={danger ? 'text-rose-600' : 'text-teal-700'}>{icon}</span><span className="text-2xl font-black">{value}</span></div><p className="mt-3 text-sm font-black">{label}</p><p className="mt-1 text-xs font-bold text-slate-400">{note}</p></div> }
function Info({ label, value }: { label: string; value: React.ReactNode }) { return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-1 font-black">{value}</p></div> }
function QualityCard({ title, count, text, action, onClick, danger = false }: { title: string; count: number; text: string; action: string; onClick: () => void; danger?: boolean }) { return <div className={`rounded-3xl border p-5 ${danger && count ? 'border-rose-200 bg-rose-50' : 'bg-white'}`}><div className="flex items-center justify-between"><h3 className="font-black">{title}</h3><span className="text-3xl font-black">{count}</span></div><p className="mt-3 text-sm font-bold text-slate-500">{text}</p><button type="button" onClick={onClick} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white">{action}</button></div> }
function OrderCard({ order, rider, onClick }: { order: any; rider: any; onClick: () => void }) { const mins = Math.round(minutesOpen(order)); return <button type="button" onClick={onClick} className={`w-full rounded-2xl border bg-white p-3 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow ${mins >= 120 ? 'border-rose-300' : mins >= 60 ? 'border-amber-300' : 'border-slate-100'}`}><div className="flex items-start justify-between gap-2"><div><b>فاتورة {invoice(order)}</b><p className="mt-1 text-xs font-bold text-slate-500">{rider?.name || 'مندوب غير محدد'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${mins >= 120 ? 'bg-rose-100 text-rose-700' : mins >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-teal-50 text-teal-700'}`}>{mins} د</span></div><p className="mt-2 truncate text-xs text-slate-400">{customerName(order)} · {customerCode(order)}</p><p className="mt-2 text-xs font-black text-teal-700">{orderAmount(order).toLocaleString('en-US')} ج.م</p></button> }
