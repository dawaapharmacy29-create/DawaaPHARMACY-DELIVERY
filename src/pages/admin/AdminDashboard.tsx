import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, BarChart3, Bike, Building2, CheckCircle2, Clock3,
  FileWarning, LogOut, PackageCheck, RefreshCw, Search, ShieldAlert, Star,
  TrendingDown, TrendingUp, Users, Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { getCurrentSession, getRiderSession, getUserProfile, logout } from '../../lib/auth'
import { getAdminStats } from '../../lib/delivery'
import { formatDateTime, getOperationalPeriod, wildcardMatchText } from '../../lib/helpers'
import { displayBranchName } from '../../lib/branchUtils'
import { isBranchScopedRole } from '../../lib/permissions'
import { supabase } from '../../lib/supabase'
import SmartAlertsCenter from '../../components/SmartAlertsCenter'
import LiveRiderLeaderboard from '../../components/LiveRiderLeaderboard'
import RiderOperationsHealth from '../../components/RiderOperationsHealth'
import type { DeliveryOrder, InternalTrip, Rider } from '../../lib/types'

type AdminStats = Awaited<ReturnType<typeof getAdminStats>>
type CustomerRow = { customer_id?: string; customer_code?: string | null; customer_name?: string | null; phone?: string | null; branch_name?: string | null; total_orders?: number | null; rejected_orders?: number | null; total_sales?: number | null; invoices_count?: number | null; days_since_last_invoice?: number | null; delivery_problem_count?: number | null; customer_segment?: string | null; risk_level?: string | null }
type FocusDay = { label: string; date: string; orders: DeliveryOrder[] } | null

type RiderScore = { rider: Rider; cycleOrders: number; todayOrders: number; delivered: number; failed: number; open: number; overdue: number; trips: number; rate: number; risk: number; earnings: number }
type BranchScore = { label: string; orders: number; delivered: number; failed: number; riders: number; customers: number; rate: number; risk: number }

const n = (value: unknown) => Number(value || 0) || 0
const money = (value: number) => `${Math.round(value).toLocaleString('ar-EG')} ج`
const pct = (value: number) => `${Math.round(value)}%`
const todayIso = () => new Date().toISOString().slice(0, 10)
const orderDate = (o: DeliveryOrder) => String(o.delivery_date || (o as any).work_date || o.registered_at || o.created_at || '').slice(0, 10)
const invoice = (o: DeliveryOrder) => String(o.invoice_number || (o as any).invoice_no || '')
const customerName = (o: DeliveryOrder) => String(o.customer_name_snapshot || (o as any).customer_name || 'عميل غير محدد')
const customerCode = (o: DeliveryOrder) => String((o as any).customer_code_snapshot || (o as any).customer_code || '')
const delivered = (o: DeliveryOrder) => o.status === 'delivered' || Boolean(o.delivered_at)
const failed = (o: DeliveryOrder) => o.status === 'failed' || Boolean(o.failed_reason)
const closed = (o: DeliveryOrder) => delivered(o) || failed(o) || o.status === 'cancelled'
const minutesOpen = (o: DeliveryOrder) => Math.max(0, Math.floor((Date.now() - new Date(o.registered_at || o.created_at).getTime()) / 60000))
const branchOf = (o: DeliveryOrder, rider?: Rider) => displayBranchName((o as any).branch_name || (rider as any)?.branch_name || o.branch_id)

function shiftMonth(date: Date, months: number) { const d = new Date(date); d.setMonth(d.getMonth() + months); return d }
function periodKey(date: string) { const p = getOperationalPeriod(new Date(date)); return `${p.start} → ${p.end}` }
function oldArchiveStart() { return getOperationalPeriod(shiftMonth(new Date(), -5)).start }
function dateRange(start: string, end: string) { const rows: string[] = []; const d = new Date(`${start}T00:00:00`); const last = new Date(`${end}T00:00:00`); while (d <= last) { rows.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) } return rows }

function KpiCard({ title, value, hint, icon, tone = 'emerald', onClick }: { title: string; value: string | number; hint: string; icon: ReactNode; tone?: 'emerald' | 'sky' | 'amber' | 'rose' | 'violet' | 'slate'; onClick?: () => void }) {
  const cls = { emerald: 'bg-emerald-50 text-emerald-700', sky: 'bg-sky-50 text-sky-700', amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700', violet: 'bg-violet-50 text-violet-700', slate: 'bg-slate-50 text-slate-600' }[tone]
  const Comp = onClick ? 'button' : 'div'
  return <Comp onClick={onClick} className="w-full rounded-[1.7rem] border border-slate-100 bg-white p-4 text-right shadow-sm transition hover:shadow-lg"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-slate-500">{title}</p><p className="mt-2 text-3xl font-black text-[#102a32]">{value}</p></div><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${cls}`}>{icon}</span></div><p className="mt-3 border-t border-slate-50 pt-3 text-[11px] font-bold text-slate-400">{hint}</p></Comp>
}

function ActionCard({ title, value, detail, action, tone = 'rose', onClick }: { title: string; value: number; detail: string; action: string; tone?: 'rose' | 'amber' | 'sky' | 'emerald'; onClick: () => void }) {
  const cls = { rose: 'border-rose-100 bg-rose-50 text-rose-700', amber: 'border-amber-100 bg-amber-50 text-amber-700', sky: 'border-sky-100 bg-sky-50 text-sky-700', emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700' }[tone]
  return <button onClick={onClick} className={`rounded-[1.5rem] border p-4 text-right shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${cls}`}><div className="flex items-center justify-between"><b className="text-sm">{title}</b><span className="text-2xl font-black">{value}</span></div><p className="mt-2 min-h-10 text-xs font-bold text-slate-500">{detail}</p><span className="mt-3 inline-flex rounded-xl bg-white/80 px-3 py-2 text-[11px] font-black">{action}</span></button>
}

function TrendChart({ rows, period, onPick }: { rows: DeliveryOrder[]; period: { start: string; end: string }; onPick: (focus: FocusDay) => void }) {
  const data = dateRange(period.start, period.end).map(d => { const dayRows = rows.filter(o => orderDate(o) === d); return { date: d, label: d.slice(5), total: dayRows.length, done: dayRows.filter(delivered).length, failed: dayRows.filter(failed).length, rows: dayRows } })
  const max = Math.max(1, ...data.map(d => d.total))
  return <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm xl:col-span-2"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-black text-[#102a32]">حركة الأوردرات خلال الدورة</h2><p className="mt-1 text-xs font-bold text-slate-400">اضغط على أي يوم لعرض تفاصيله</p></div><div className="flex gap-3 text-[11px] font-black"><span className="text-emerald-600">الإجمالي</span><span className="text-sky-600">تم التسليم</span><span className="text-rose-600">فشل</span></div></div><div className="flex h-56 items-end gap-1 overflow-x-auto rounded-2xl bg-gradient-to-b from-emerald-50/70 to-white p-3">{data.map(d => <button key={d.date} title={`${d.date}: ${d.total}`} onClick={() => onPick({ date: d.date, label: d.label, orders: d.rows })} className="group flex min-w-[22px] flex-1 flex-col items-center justify-end gap-1"><span className="hidden rounded-lg bg-[#0b2d33] px-2 py-1 text-[10px] font-black text-white group-hover:block">{d.total}</span><span className="w-full rounded-t-xl bg-emerald-500/80 transition group-hover:bg-emerald-700" style={{ height: `${Math.max(4, (d.total / max) * 160)}px` }} /><span className="text-[9px] font-bold text-slate-400">{d.label}</span></button>)}</div></section>
}

function RiderCommandTable({ rows, onOpen }: { rows: RiderScore[]; onOpen: (id: string) => void }) {
  return <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-black text-[#102a32]">بطاقة أداء المندوبين</h2><p className="mt-1 text-xs font-bold text-slate-400">أفضل مندوب، نسبة التسليم، الفشل، العالق، والمخاطر</p></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-[11px] font-black text-slate-500"><tr><th className="p-3 text-right">المندوب</th><th>الدورة</th><th>اليوم</th><th>تم</th><th>فشل</th><th>مفتوح</th><th>عالقة</th><th>مشاوير</th><th>نجاح</th><th>خطر</th><th>تقديري</th><th></th></tr></thead><tbody>{rows.map((r, i) => <tr key={r.rider.id} className="border-t border-slate-50 hover:bg-emerald-50/30"><td className="p-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0b2d33] text-xs font-black text-white">{i + 1}</span><div><b>{r.rider.name}</b><p className="text-[10px] font-bold text-slate-400">{displayBranchName((r.rider as any).branch_name || r.rider.branch_id)}</p></div></div></td><td className="font-black">{r.cycleOrders}</td><td>{r.todayOrders}</td><td className="font-black text-emerald-700">{r.delivered}</td><td className={r.failed ? 'font-black text-rose-600' : ''}>{r.failed}</td><td>{r.open}</td><td className={r.overdue ? 'font-black text-rose-600' : ''}>{r.overdue}</td><td>{r.trips}</td><td><span className={`rounded-full px-3 py-1 text-xs font-black ${r.rate >= 85 ? 'bg-emerald-50 text-emerald-700' : r.rate >= 65 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{pct(r.rate)}</span></td><td><span className={`rounded-full px-3 py-1 text-xs font-black ${r.risk > 20 ? 'bg-rose-50 text-rose-700' : r.risk > 10 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}>{pct(r.risk)}</span></td><td>{money(r.earnings)}</td><td><button onClick={() => onOpen(r.rider.id)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">فتح</button></td></tr>)}</tbody></table></div></section>
}

function BranchComparison({ rows }: { rows: BranchScore[] }) {
  return <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm"><h2 className="font-black text-[#102a32]">مقارنة الفروع</h2><p className="mt-1 text-xs font-bold text-slate-400">حجم التشغيل وجودة التسليم ومؤشر الخطر</p><div className="mt-4 space-y-4">{rows.map(r => <div key={r.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><b>{r.label}</b><span className={`rounded-full px-3 py-1 text-xs font-black ${r.rate >= 85 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{pct(r.rate)}</span></div><div className="grid grid-cols-4 gap-2 text-center text-xs font-bold text-slate-500"><span>أوردرات<br/><b className="text-slate-800">{r.orders}</b></span><span>فشل<br/><b className={r.failed ? 'text-rose-600' : 'text-slate-800'}>{r.failed}</b></span><span>دليفري<br/><b className="text-slate-800">{r.riders}</b></span><span>عملاء<br/><b className="text-slate-800">{r.customers}</b></span></div></div>)}{!rows.length && <p className="py-10 text-center text-sm font-bold text-slate-400">لا توجد بيانات فروع</p>}</div></section>
}

function CustomerRiskPanel({ rows, onOpen }: { rows: CustomerRow[]; onOpen: () => void }) {
  const risks = rows.filter(r => String(r.risk_level || '').toLowerCase() === 'high' || n(r.delivery_problem_count) > 0 || n(r.rejected_orders) > 0).sort((a, b) => n(b.delivery_problem_count) + n(b.rejected_orders) - n(a.delivery_problem_count) - n(a.rejected_orders)).slice(0, 8)
  return <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-[#102a32]">عملاء يحتاجون تدخل</h2><p className="mt-1 text-xs font-bold text-slate-400">مشاكل توصيل أو إلغاءات أو خطر توقف</p></div><button onClick={onOpen} className="rounded-xl bg-[#0b2d33] px-3 py-2 text-xs font-black text-white">فتح العملاء</button></div><div className="mt-4 space-y-3">{risks.map(r => <div key={r.customer_id || r.customer_code || r.phone || r.customer_name || Math.random()} className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><div className="flex justify-between gap-3"><b className="truncate">{r.customer_name || 'عميل غير محدد'}</b><span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">متابعة</span></div><p className="mt-1 text-[11px] font-bold text-slate-400">{r.customer_code || 'بدون كود'} · {r.phone || 'بدون هاتف'} · {displayBranchName(r.branch_name)}</p><p className="mt-2 text-xs font-bold text-slate-600">الإجراء: تأكيد العنوان والهاتف ومراجعة سبب الإلغاء قبل أي طلب جديد.</p></div>)}{!risks.length && <p className="py-10 text-center text-sm font-bold text-slate-400">لا توجد مخاطر عملاء واضحة</p>}</div></section>
}

function ArchivePanel({ orders }: { orders: DeliveryOrder[] }) {
  const rows = Object.values(orders.reduce((acc: Record<string, { label: string; orders: number; delivered: number; failed: number }>, o) => { const k = periodKey(orderDate(o)); acc[k] ||= { label: k, orders: 0, delivered: 0, failed: 0 }; acc[k].orders += 1; if (delivered(o)) acc[k].delivered += 1; if (failed(o)) acc[k].failed += 1; return acc }, {})).sort((a, b) => a.label.localeCompare(b.label)).slice(-6).reverse()
  return <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm"><h2 className="font-black text-[#102a32]">أرشيف آخر الدورات</h2><p className="mt-1 text-xs font-bold text-slate-400">مقارنة مختصرة بين الدورات</p><div className="mt-4 space-y-3">{rows.map(r => <div key={r.label} className="rounded-2xl bg-slate-50 p-3"><div className="flex justify-between gap-3"><b className="text-xs">{r.label}</b><span className="text-xs font-black text-emerald-700">{pct(r.orders ? r.delivered / r.orders * 100 : 0)}</span></div><p className="mt-2 text-xs font-bold text-slate-500">{r.orders} أوردر · {r.delivered} تم · {r.failed} فشل</p></div>)}</div></section>
}

function FocusDrawer({ focus, onClose }: { focus: FocusDay; onClose: () => void }) {
  if (!focus) return null
  return <div className="fixed inset-0 z-[80] bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={onClose}><aside onMouseDown={e => e.stopPropagation()} className="mr-auto h-full w-full max-w-xl overflow-y-auto rounded-[2rem] bg-[#f7fafa] p-5 shadow-2xl" dir="rtl"><div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-black text-emerald-600">تفاصيل اليوم</p><h2 className="text-2xl font-black">{focus.date}</h2><p className="mt-1 text-xs font-bold text-slate-400">{focus.orders.length} أوردر · {focus.orders.filter(delivered).length} تم · {focus.orders.filter(failed).length} فشل</p></div><button onClick={onClose} className="rounded-xl bg-white px-3 py-2 text-sm font-black">إغلاق</button></div><div className="space-y-3">{focus.orders.slice(0, 80).map(o => <article key={o.id} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><b>{invoice(o) || 'بدون رقم'}</b><span className="text-sm font-black text-teal-700">{money(n(o.invoice_amount))}</span></div><p className="mt-1 text-xs font-bold text-slate-500">{customerName(o)} · كود {customerCode(o) || '—'}</p><p className="mt-2 text-[11px] font-bold text-slate-400">{formatDateTime(o.registered_at || o.created_at)}</p></article>)}</div></aside></div>
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [archiveOrders, setArchiveOrders] = useState<DeliveryOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [branch, setBranch] = useState('all')
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [focus, setFocus] = useState<FocusDay>(null)

  async function load() {
    setLoading(true)
    try {
      let branchId: string | null = null
      let branchName: string | null = null
      const local = getRiderSession()
      if (isBranchScopedRole(local.role)) { branchId = local.branch_id; branchName = local.branch_name }
      else { const session = await getCurrentSession(); const profile = session?.user?.id ? await getUserProfile(session.user.id) : null; if (isBranchScopedRole(profile?.role)) { branchId = profile?.branch_id || null; branchName = profile?.branch_name || null } }
      if (branchId && !branchName) { const { data } = await supabase.from('branches').select('name,display_name').eq('id', branchId).maybeSingle(); branchName = (data as any)?.display_name || (data as any)?.name || null }
      const [admin, customerRes, archiveRes] = await Promise.all([
        getAdminStats(branchId),
        supabase.from('customer_delivery_analytics').select('*').limit(1500),
        supabase.from('delivery_orders').select('*').gte('delivery_date', oldArchiveStart()).lte('delivery_date', period.end),
      ])
      let customerRows = ((customerRes as any).data || []) as CustomerRow[]
      if ((customerRes as any).error) {
        const fallback = await supabase.from('delivery_customers').select('*').limit(1500)
        customerRows = ((fallback.data || []) as any[]).map(c => ({ customer_id: c.id || c.customer_code, customer_code: c.customer_code, customer_name: c.customer_name || c.name, phone: c.phone, branch_name: c.branch_name || c.branch, total_sales: n(c.total_sales), invoices_count: n(c.invoices_count), delivery_problem_count: n(c.delivery_problem_count), risk_level: c.risk_level }))
      }
      if (branchId && branchName) customerRows = customerRows.filter(c => displayBranchName(c.branch_name) === displayBranchName(branchName))
      setStats(admin)
      setCustomers(customerRows)
      setArchiveOrders(((archiveRes as any).data || []) as DeliveryOrder[])
      if (branchId) setBranch(displayBranchName(branchName || branchId))
      setLastUpdated(new Date())
    } catch (e: any) { toast.error(e?.message || 'تعذر تحميل مركز القيادة') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { const ch = supabase.channel('command-center-redesign').on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders' }, () => void load()).subscribe(); return () => { void supabase.removeChannel(ch) } }, [])

  const orders = stats?.cycleOrders || []
  const todayOrders = stats?.orders || []
  const riders = stats?.riders || []
  const trips = stats?.cycleTrips || []
  const riderMap = useMemo(() => new Map(riders.map(r => [r.id, r])), [riders])
  const branchOptions = useMemo(() => ['all', ...Array.from(new Set(orders.map(o => branchOf(o, riderMap.get(o.rider_id))).filter(Boolean)))], [orders, riderMap])
  const filteredOrders = useMemo(() => orders.filter(o => { const rider = riderMap.get(o.rider_id); const branchOk = branch === 'all' || branchOf(o, rider) === branch; const qOk = !search.trim() || [invoice(o), customerName(o), customerCode(o), rider?.name, rider?.username].some(v => wildcardMatchText(String(v || ''), search)); return branchOk && qOk }), [branch, orders, riderMap, search])

  const summary = useMemo(() => {
    const total = filteredOrders.length, done = filteredOrders.filter(delivered).length, bad = filteredOrders.filter(failed).length, open = filteredOrders.filter(o => !closed(o)).length, overdue = filteredOrders.filter(o => !closed(o) && minutesOpen(o) > 60).length
    const duplicate = filteredOrders.filter(o => o.is_duplicate_invoice || o.duplicate_review_status === 'pending').length
    return { total, done, bad, open, overdue, duplicate, rate: total ? done / total * 100 : 0, today: todayOrders.length, todayDone: todayOrders.filter(delivered).length, todayFail: todayOrders.filter(failed).length }
  }, [filteredOrders, todayOrders])

  const riderScores = useMemo<RiderScore[]>(() => riders.map(r => { const ro = filteredOrders.filter(o => o.rider_id === r.id); const today = todayOrders.filter(o => o.rider_id === r.id); const tr = trips.filter(t => t.rider_id === r.id); const done = ro.filter(delivered).length; const bad = ro.filter(failed).length; const open = ro.filter(o => !closed(o)).length; const overdue = ro.filter(o => !closed(o) && minutesOpen(o) > 60).length; const rate = ro.length ? done / ro.length * 100 : 0; const risk = ro.length ? (bad + overdue + ro.filter(o => o.is_duplicate_invoice).length) / ro.length * 100 : 0; return { rider: r, cycleOrders: ro.length, todayOrders: today.length, delivered: done, failed: bad, open, overdue, trips: tr.length, rate, risk, earnings: done * n(r.order_rate) + tr.filter(t => ['approved','completed'].includes(t.status)).length * n(r.trip_rate) } }).filter(r => r.cycleOrders || r.todayOrders || r.trips).sort((a, b) => b.delivered - a.delivered || b.rate - a.rate), [filteredOrders, riders, todayOrders, trips])

  const branchScores = useMemo<BranchScore[]>(() => Object.values(filteredOrders.reduce((acc: Record<string, BranchScore>, o) => { const rider = riderMap.get(o.rider_id); const label = branchOf(o, rider); acc[label] ||= { label, orders: 0, delivered: 0, failed: 0, riders: 0, customers: 0, rate: 0, risk: 0 }; acc[label].orders += 1; if (delivered(o)) acc[label].delivered += 1; if (failed(o)) acc[label].failed += 1; return acc }, {})).map(b => ({ ...b, riders: new Set(filteredOrders.filter(o => branchOf(o, riderMap.get(o.rider_id)) === b.label).map(o => o.rider_id)).size, customers: new Set(filteredOrders.filter(o => branchOf(o, riderMap.get(o.rider_id)) === b.label).map(o => customerCode(o) || customerName(o))).size, rate: b.orders ? b.delivered / b.orders * 100 : 0, risk: b.orders ? b.failed / b.orders * 100 : 0 })).sort((a, b) => b.orders - a.orders), [filteredOrders, riderMap])

  const topRider = riderScores[0]
  const riskRider = [...riderScores].sort((a, b) => b.risk - a.risk)[0]
  const handleLogout = async () => { await logout(); navigate('/login') }

  return <div dir="rtl" className="min-h-screen bg-[#eef5f5] p-3 text-[#102a32] sm:p-5"><div className="mx-auto max-w-[1600px] space-y-5">
    <header className="overflow-hidden rounded-[2.2rem] bg-gradient-to-l from-[#082f35] via-[#0b4c55] to-[#008E92] p-5 text-white shadow-xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black text-emerald-200">مركز قيادة Dawaa Delivery</p><h1 className="mt-2 text-3xl font-black">داشبورد أداء الصيدلية والدليفري والفروع</h1><p className="mt-2 text-sm font-bold text-slate-200">الدورة الحالية: {period.start} إلى {period.end} · آخر تحديث {lastUpdated ? lastUpdated.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-xs font-black backdrop-blur hover:bg-white/25"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/> تحديث</button><button onClick={() => navigate('/admin/reconciliation')} className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-[#0b4c55]">المطابقة</button><button onClick={() => navigate('/admin/reports')} className="rounded-2xl bg-white/15 px-4 py-3 text-xs font-black backdrop-blur hover:bg-white/25">التقارير</button><button onClick={() => void handleLogout()} className="inline-flex items-center gap-2 rounded-2xl bg-rose-500/80 px-4 py-3 text-xs font-black"><LogOut size={15}/> خروج</button></div></div><div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px]"><div className="relative"><Search className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60" size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث: فاتورة، عميل، كود، مندوب..." className="h-12 w-full rounded-2xl border border-white/10 bg-white/10 pr-11 text-sm font-bold text-white outline-none placeholder:text-white/50"/></div><select value={branch} onChange={e => setBranch(e.target.value)} className="h-12 rounded-2xl border border-white/10 bg-[#0b4c55] px-4 text-sm font-black text-white outline-none"><option value="all">كل الفروع</option>{branchOptions.filter(x => x !== 'all').map(b => <option key={b} value={b}>{b}</option>)}</select></div></header>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6"><KpiCard title="أوردرات اليوم" value={summary.today} hint={`${summary.todayDone} تم · ${summary.todayFail} فشل`} icon={<Activity/>} tone="sky" onClick={() => navigate('/admin/ops')}/><KpiCard title="أوردرات الدورة" value={summary.total} hint={`معدل النجاح ${pct(summary.rate)}`} icon={<PackageCheck/>}/><KpiCard title="تم التسليم" value={summary.done} hint="تسليم فعلي" icon={<CheckCircle2/>}/><KpiCard title="فشل" value={summary.bad} hint="راجع الأسباب والعملاء" icon={<TrendingDown/>} tone={summary.bad ? 'rose' : 'slate'} onClick={() => navigate('/admin/ops?filter=failed')}/><KpiCard title="عالقة الآن" value={summary.overdue} hint="أكثر من 60 دقيقة" icon={<Clock3/>} tone={summary.overdue ? 'rose' : 'slate'} onClick={() => navigate('/admin/ops?filter=overdue')}/><KpiCard title="فواتير مكررة" value={summary.duplicate} hint="تحتاج قرار إداري" icon={<FileWarning/>} tone={summary.duplicate ? 'amber' : 'slate'} onClick={() => navigate('/admin/reconciliation?filter=duplicate')}/></section>

    <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><ShieldAlert/></span><div><h2 className="font-black">أولويات تحتاج قرار الآن</h2><p className="text-xs font-bold text-slate-400">اضغط على أي بند لفتح الحالات مباشرة</p></div></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><ActionCard title="أوردرات عالقة" value={summary.overdue} detail="ابدأ بالأقدم وتواصل مع المندوب أو الفرع." action="فتح العالق" onClick={() => navigate('/admin/ops?filter=overdue')}/><ActionCard title="فواتير مكررة" value={summary.duplicate} detail="اعتماد أو رفض قبل إغلاق الدورة." action="فتح المطابقة" tone="amber" onClick={() => navigate('/admin/reconciliation?filter=duplicate')}/><ActionCard title="مندوب يحتاج متابعة" value={riskRider ? 1 : 0} detail={riskRider ? `${riskRider.rider.name} لديه أعلى مؤشر خطر` : 'لا توجد مخاطر واضحة'} action="فتح الأداء" tone="sky" onClick={() => riskRider && navigate(`/admin/riders/${riskRider.rider.id}/performance`)}/><ActionCard title="أفضل مندوب" value={topRider?.delivered || 0} detail={topRider ? `${topRider.rider.name} — نجاح ${pct(topRider.rate)}` : 'لا توجد بيانات'} action="فتح التقرير" tone="emerald" onClick={() => topRider && navigate(`/admin/riders/${topRider.rider.id}/performance`)}/></div></div><SmartAlertsCenter orders={filteredOrders} riders={riders}/></section>

    <section className="grid gap-4 xl:grid-cols-3"><TrendChart rows={filteredOrders} period={period} onPick={setFocus}/><BranchComparison rows={branchScores}/></section>
    <section className="grid gap-4 xl:grid-cols-[1fr_420px]"><RiderCommandTable rows={riderScores} onOpen={id => navigate(`/admin/riders/${id}/performance`)}/><div className="space-y-4"><CustomerRiskPanel rows={customers} onOpen={() => navigate('/admin/customer-analytics')}/><ArchivePanel orders={archiveOrders}/></div></section>
    <section className="grid gap-4 xl:grid-cols-[1fr_420px]"><RiderOperationsHealth/><LiveRiderLeaderboard orders={todayOrders} trips={(stats?.trips || []) as InternalTrip[]} riders={riders} onOpen={id => navigate(`/admin/riders/${id}/performance`)}/></section>
    <div className="grid gap-4 md:grid-cols-3"><KpiCard title="قيمة قاعدة العملاء" value={money(customers.reduce((s, c) => s + n(c.total_sales), 0))} hint={`${customers.length} عميل داخل التحليل`} icon={<Wallet/>} tone="violet"/><KpiCard title="عملاء VIP" value={customers.filter(c => c.customer_segment === 'vip').length} hint="أولوية خدمة وولاء" icon={<Star/>} tone="violet"/><KpiCard title="فروع نشطة" value={branchScores.length} hint="مقارنة تشغيل وجودة" icon={<Building2/>} tone="sky"/></div>
  </div><FocusDrawer focus={focus} onClose={() => setFocus(null)}/></div>
}
