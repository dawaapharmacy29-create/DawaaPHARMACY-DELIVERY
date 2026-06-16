import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, AlertTriangle, BarChart3, Bike, CalendarDays, CheckCircle2, ClipboardCheck, FileText, Gift, RefreshCw, Route, Search, ShieldAlert, TrendingUp, Users, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { displayBranchName } from '../../lib/branchUtils'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'

type RiderRow = { id: string; name?: string | null; display_name?: string | null; branch_id?: string | null; status?: string | null }
type OrderRow = Record<string, any>
type TripRow = Record<string, any>
type EventRow = Record<string, any>

function n(v: any) { return Number(v || 0) || 0 }
function lower(v: any) { return String(v || '').toLowerCase() }
function dt(v: any) { return String(v || '').slice(0, 10) }
function riderName(row: RiderRow | undefined, fallback?: any) { return row?.name || row?.display_name || String(fallback || 'غير محدد') }
function isDeleted(o: any) { return Boolean(o?.deleted_at) }
function isFailed(o: any) { const s = lower(o?.status); return s.includes('fail') || s === 'failed' || Boolean(o?.failed_at || o?.failed_reason) }
function isDelivered(o: any) { const s = lower(o?.status); return s === 'delivered' || s.includes('تم التسليم') || Boolean(o?.delivered_at) }
function isReview(o: any) { const s = lower(o?.review_status || o?.status); return Boolean(o?.needs_review) || ['pending','needs_review','registered'].includes(s) }
function isDuplicate(o: any) { return Boolean(o?.is_duplicate_invoice || o?.duplicate_warning) }
function isMultiplier(o: any) { return n(o?.order_multiplier ?? (o?.is_multiplier_order ? 1.5 : 1)) >= 1.5 }
function isUncounted(o: any) {
  const s = lower(o?.count_status || o?.reconciliation_status || o?.review_status)
  return Boolean(o?.not_countable || o?.excluded_from_incentive || o?.is_countable === false) || ['rejected','not_countable','excluded','invoice_not_found'].includes(s)
}

function Card({ label, value, sub, icon, tone = 'emerald' }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; tone?: 'emerald' | 'rose' | 'amber' | 'sky' | 'purple' | 'slate' }) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100', rose: 'bg-rose-50 text-rose-700 border-rose-100', amber: 'bg-amber-50 text-amber-700 border-amber-100', sky: 'bg-sky-50 text-sky-700 border-sky-100', purple: 'bg-purple-50 text-purple-700 border-purple-100', slate: 'bg-white text-slate-700 border-slate-100'
  }
  return <div className={`rounded-3xl border p-5 shadow-sm ${tones[tone]}`}><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70">{icon}</div><p className="text-xs font-black opacity-70">{label}</p><p className="mt-2 text-3xl font-black text-[#061827]">{value}</p>{sub && <p className="mt-2 text-xs font-bold opacity-75">{sub}</p>}</div>
}

function MiniBars({ title, rows }: { title: string; rows: { label: string; value: number; tone?: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><h3 className="mb-4 text-base font-black text-[#061827]">{title}</h3><div className="space-y-3">{rows.length ? rows.map(r => <div key={r.label}><div className="mb-1 flex justify-between text-xs font-black text-slate-500"><span>{r.label}</span><span>{r.value}</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(3, r.value / max * 100)}%` }} /></div></div>) : <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">لا توجد بيانات</p>}</div></div>
}

function RiskPill({ score }: { score: number }) {
  const cls = score >= 70 ? 'bg-rose-50 text-rose-700' : score >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${cls}`}>{score}</span>
}

export default function ExecutiveDashboard() {
  const navigate = useNavigate()
  const period = getOperationalPeriod()
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [trips, setTrips] = useState<TripRow[]>([])
  const [riders, setRiders] = useState<RiderRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])

  async function load() {
    try {
      setLoading(true)
      const [ordersRes, tripsRes, ridersRes, eventsRes] = await Promise.allSettled([
        supabase.from('delivery_orders').select('*').gte('delivery_date', period.start).lte('delivery_date', period.end).order('created_at', { ascending: false }),
        supabase.from('internal_trips').select('*').gte('trip_date', period.start).lte('trip_date', period.end).order('created_at', { ascending: false }),
        supabase.from('riders').select('*').order('name', { ascending: true }),
        supabase.from('rider_compensation_events').select('*').eq('cycle_start', period.start).order('event_date', { ascending: false })
      ])
      setOrders(ordersRes.status === 'fulfilled' ? ((ordersRes.value as any).data || []) : [])
      setTrips(tripsRes.status === 'fulfilled' ? ((tripsRes.value as any).data || []) : [])
      setRiders(ridersRes.status === 'fulfilled' ? ((ridersRes.value as any).data || []) : [])
      setEvents(eventsRes.status === 'fulfilled' ? ((eventsRes.value as any).data || []) : [])
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل غرفة التحكم')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const data = useMemo(() => {
    const cleanOrders = orders.filter(o => !isDeleted(o))
    const delivered = cleanOrders.filter(isDelivered)
    const failed = cleanOrders.filter(isFailed)
    const review = cleanOrders.filter(isReview)
    const duplicate = cleanOrders.filter(isDuplicate)
    const multiplier = cleanOrders.filter(isMultiplier)
    const uncounted = cleanOrders.filter(isUncounted)
    const today = new Date().toISOString().slice(0,10)
    const todayOrders = cleanOrders.filter(o => dt(o.delivery_date || o.created_at || o.registered_at) === today)
    const branchMap = new Map<string, number>()
    for (const o of cleanOrders) {
      const b = displayBranchName(o.branch_name || o.branch)
      branchMap.set(b, (branchMap.get(b) || 0) + 1)
    }
    const riderMap = new Map<string, any>()
    for (const r of riders) riderMap.set(r.id, { id: r.id, name: riderName(r), branch: displayBranchName((r as any).branch_name), orders: 0, delivered: 0, failed: 0, duplicate: 0, multiplier: 0, review: 0, uncounted: 0, trips: 0, rewards: 0, deductions: 0, risk: 0 })
    for (const o of cleanOrders) {
      const id = o.rider_id || 'unknown'
      if (!riderMap.has(id)) riderMap.set(id, { id, name: o.rider_name || o.driver_name || 'غير محدد', branch: displayBranchName(o.branch_name || o.branch), orders: 0, delivered: 0, failed: 0, duplicate: 0, multiplier: 0, review: 0, uncounted: 0, trips: 0, rewards: 0, deductions: 0, risk: 0 })
      const row = riderMap.get(id)
      row.orders += 1
      if (isDelivered(o)) row.delivered += 1
      if (isFailed(o)) row.failed += 1
      if (isDuplicate(o)) row.duplicate += 1
      if (isMultiplier(o)) row.multiplier += 1
      if (isReview(o)) row.review += 1
      if (isUncounted(o)) row.uncounted += 1
    }
    for (const t of trips) {
      const id = t.rider_id || 'unknown'
      if (!riderMap.has(id)) riderMap.set(id, { id, name: t.rider_name || 'غير محدد', branch: displayBranchName(t.branch_name || t.branch), orders: 0, delivered: 0, failed: 0, duplicate: 0, multiplier: 0, review: 0, uncounted: 0, trips: 0, rewards: 0, deductions: 0, risk: 0 })
      riderMap.get(id).trips += 1
    }
    for (const e of events) {
      const id = e.rider_id || 'unknown'
      if (!riderMap.has(id)) continue
      if (e.event_type === 'deduction') riderMap.get(id).deductions += Math.abs(n(e.amount))
      else riderMap.get(id).rewards += Math.abs(n(e.amount))
    }
    const riderRows = Array.from(riderMap.values()).map(r => {
      const errorRate = r.orders ? (r.failed + r.duplicate + r.uncounted + r.review) / r.orders : 0
      r.risk = Math.min(100, Math.round(errorRate * 80 + (r.duplicate ? 10 : 0) + (r.failed ? 10 : 0)))
      r.accuracy = r.orders ? Math.round((r.delivered / r.orders) * 100) : 0
      return r
    }).sort((a,b) => b.risk - a.risk)
    const positives = events.filter(e => e.event_type !== 'deduction').reduce((s, e) => s + Math.abs(n(e.amount)), 0)
    const deductions = events.filter(e => e.event_type === 'deduction').reduce((s, e) => s + Math.abs(n(e.amount)), 0)
    return { cleanOrders, delivered, failed, review, duplicate, multiplier, uncounted, todayOrders, branchRows: Array.from(branchMap, ([label, value]) => ({ label, value })), riderRows, positives, deductions }
  }, [orders, trips, riders, events])

  const filteredRiders = data.riderRows.filter(r => !search || [r.name, r.branch].some(v => String(v || '').includes(search)))
  const dataHealth = [
    { label: 'أوردرات بدون فرع', value: orders.filter(o => !o.branch_id && !o.branch_name && !o.branch).length },
    { label: 'أوردرات بدون مندوب', value: orders.filter(o => !o.rider_id).length },
    { label: 'أوردرات بدون فاتورة', value: orders.filter(o => !(o.invoice_no || o.invoice_number || o.order_no)).length },
    { label: 'أسماء فروع غير موحدة', value: orders.filter(o => String(o.branch || o.branch_name || '').toLowerCase().includes('shkri')).length },
  ]

  return <div className="min-h-screen bg-[#F3F7F8] p-4 text-right" dir="rtl">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border bg-white p-5 shadow-sm">
        <div>
          <button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-600"><ArrowRight size={16}/> رجوع</button>
          <p className="text-sm font-black text-emerald-600">غرفة التحكم التنفيذية</p>
          <h1 className="mt-1 text-3xl font-black text-[#061827]">لوحة قيادة الدليفري والحوافز والمخاطر</h1>
          <p className="mt-1 text-xs font-bold text-slate-400">الدورة: {period.start} → {period.end} • تعرض التشغيل، الدقة، المخاطر، والماليات في مكان واحد.</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-sm"><RefreshCw className={loading ? 'animate-spin' : ''} size={18}/> تحديث</button>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card label="أوردرات الدورة" value={data.cleanOrders.length} sub={`${data.todayOrders.length} اليوم`} icon={<ClipboardCheck/>}/>
        <Card label="تم التسليم" value={data.delivered.length} sub={`${data.cleanOrders.length ? Math.round(data.delivered.length / data.cleanOrders.length * 100) : 0}% دقة`} icon={<CheckCircle2/>}/>
        <Card label="تحت المراجعة" value={data.review.length} sub="تحتاج قرار" icon={<ShieldAlert/>} tone="amber"/>
        <Card label="مشاكل خطرة" value={data.failed.length + data.duplicate.length + data.uncounted.length} sub="فاشل / مكرر / غير محتسب" icon={<AlertTriangle/>} tone="rose"/>
        <Card label="صافي التسويات" value={formatMoney(data.positives - data.deductions)} sub={`مكافآت ${formatMoney(data.positives)} • خصومات ${formatMoney(data.deductions)}`} icon={<Wallet/>} tone="purple"/>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MiniBars title="الأوردرات حسب الفرع" rows={data.branchRows}/>
        <MiniBars title="أعلى الدليفري حسب المخاطر" rows={data.riderRows.slice(0,6).map(r => ({ label: r.name, value: r.risk }))}/>
        <MiniBars title="فحص جودة البيانات" rows={dataHealth}/>
      </section>

      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-[#061827]">جدول تحكم الفريق</h2>
          <div className="relative w-full max-w-sm"><Search className="absolute right-4 top-3 text-slate-400" size={18}/><input value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-2xl border bg-slate-50 py-3 pr-11 font-bold outline-none focus:border-emerald-300" placeholder="ابحث باسم الدليفري أو الفرع"/></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-slate-50 text-xs font-black text-slate-500"><tr><th className="p-3">الدليفري</th><th className="p-3">الفرع</th><th className="p-3">أوردرات</th><th className="p-3">تم التسليم</th><th className="p-3">×1.5</th><th className="p-3">مكرر</th><th className="p-3">فاشل</th><th className="p-3">غير محتسب</th><th className="p-3">مراجعة</th><th className="p-3">مخاطر</th><th className="p-3">تفاصيل</th></tr></thead>
            <tbody>{filteredRiders.map(r => <tr key={r.id} className="border-t hover:bg-slate-50"><td className="p-3 font-black text-[#061827]">{r.name}</td><td className="p-3 font-bold text-slate-500">{r.branch || 'غير محدد'}</td><td className="p-3">{r.orders}</td><td className="p-3 text-emerald-700 font-black">{r.delivered}</td><td className="p-3">{r.multiplier}</td><td className="p-3 text-amber-700">{r.duplicate}</td><td className="p-3 text-rose-700">{r.failed}</td><td className="p-3">{r.uncounted}</td><td className="p-3">{r.review}</td><td className="p-3"><RiskPill score={r.risk}/></td><td className="p-3"><button onClick={() => navigate(`/admin/riders/${r.id}/performance`)} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">فتح التقرير</button></td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="mb-3 font-black text-[#061827]">قرارات اليوم المقترحة</h3><ul className="space-y-2 text-sm font-bold text-slate-600"><li>راجع كل أوردر ×1.5 قبل احتسابه في الحافز.</li><li>أي دليفري مؤشره فوق 70 يحتاج مراجعة تفصيلية.</li><li>أغلق الدورة بعد اعتماد كل الخصومات والمكافآت فقط.</li></ul></div>
        <div className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="mb-3 font-black text-[#061827]">تطوير البيانات</h3><ul className="space-y-2 text-sm font-bold text-slate-600"><li>كل رسم يعتمد على branch_id وليس اسم نصي.</li><li>كل أوردر بدون فاتورة يدخل مراجعة تلقائيًا.</li><li>كل تغيير مالي يسجل بتاريخ وسبب.</li></ul></div>
        <div className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="mb-3 font-black text-[#061827]">مخرجات نهاية الشهر</h3><ul className="space-y-2 text-sm font-bold text-slate-600"><li>PDF لكل دليفري.</li><li>Excel شامل للمدير.</li><li>قفل دورة 26 → 25 بعد الاعتماد.</li></ul></div>
      </section>
    </div>
  </div>
}
