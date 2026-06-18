import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, ArrowLeft, BarChart3, Bike, Building2, CheckCircle2,
  ChevronLeft, CircleDollarSign, Clock3, FileWarning, Gift, LayoutDashboard,
  LogOut, Menu, PackageCheck, RefreshCw, Route, Search, ShieldCheck,
  Star, TrendingDown, TrendingUp, Users, Wallet, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { getCurrentSession, getRiderSession, getUserProfile, logout } from '../../lib/auth'
import { getAdminStats } from '../../lib/delivery'
import { getOperationalPeriod, wildcardMatchText } from '../../lib/helpers'
import { CANONICAL_BRANCHES, displayBranchName } from '../../lib/branchUtils'
import { isBranchScopedRole } from '../../lib/permissions'
import { supabase } from '../../lib/supabase'
import SmartAlertsCenter from '../../components/SmartAlertsCenter'
import LiveRiderLeaderboard from '../../components/LiveRiderLeaderboard'
import RiderOperationsHealth from '../../components/RiderOperationsHealth'

type AdminStats = Awaited<ReturnType<typeof getAdminStats>>
type ViewKey = 'overview' | 'riders' | 'customers' | 'branches'
type CustomerRow = {
  customer_id: string; customer_code?: string | null; customer_name?: string | null; phone?: string | null
  branch_name?: string | null; total_orders?: number | null; matched_orders?: number | null
  rejected_orders?: number | null; total_sales?: number | null; invoices_count?: number | null
  average_invoice?: number | null; days_since_last_invoice?: number | null
  delivery_problem_count?: number | null; customer_segment?: string | null; risk_level?: string | null
}
type DrawerData = { title: string; subtitle: string; rows: any[]; kind: 'orders' | 'riders' | 'customers' | 'branches' } | null

const n = (value: unknown) => Number(value || 0) || 0
const pct = (value: number) => `${Math.round(value)}%`
const money = (value: number) => `${Math.round(value).toLocaleString('ar-EG')} ج.م`
const orderDate = (o: any) => o.delivery_date || String(o.registered_at || o.created_at || '').slice(0, 10)
const delivered = (o: any) => Boolean(o.delivered_at) || ['delivered', 'تم التسليم'].includes(String(o.status || '').toLowerCase())
const failed = (o: any) => Boolean(o.failed_at || o.failed_reason) || String(o.status || '').toLowerCase().includes('fail')
const duplicate = (o: any) => Boolean(o.is_duplicate_invoice || o.duplicate_warning)
const review = (o: any) => Boolean(o.needs_review) || ['pending', 'needs_review'].includes(String(o.review_status || '').toLowerCase())

function StatCard({ label, value, hint, icon, tone = 'emerald', onClick }: { label: string; value: string | number; hint: string; icon: ReactNode; tone?: 'emerald' | 'sky' | 'amber' | 'rose' | 'violet'; onClick?: () => void }) {
  const colors = {
    emerald: 'from-emerald-500 to-teal-600 shadow-emerald-100', sky: 'from-sky-500 to-blue-600 shadow-sky-100',
    amber: 'from-amber-400 to-orange-500 shadow-amber-100', rose: 'from-rose-500 to-red-600 shadow-rose-100',
    violet: 'from-violet-500 to-purple-600 shadow-violet-100',
  }
  const Comp = onClick ? 'button' : 'div'
  return <Comp onClick={onClick} className={`group w-full rounded-[1.6rem] border border-slate-100 bg-white p-4 text-right shadow-sm transition ${onClick ? 'hover:-translate-y-1 hover:shadow-xl' : ''}`}>
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black tracking-tight text-[#102a32]">{value}</p></div>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${colors[tone]}`}>{icon}</span>
    </div>
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-50 pt-3"><p className="text-[11px] font-bold text-slate-400">{hint}</p>{onClick && <ChevronLeft size={15} className="text-slate-300 transition group-hover:-translate-x-1 group-hover:text-emerald-600" />}</div>
  </Comp>
}

function AreaChart({ data }: { data: { label: string; orders: number; delivered: number }[] }) {
  const max = Math.max(1, ...data.map(x => x.orders)); const width = 700; const height = 210
  const points = data.map((x, i) => `${data.length === 1 ? width / 2 : i * width / (data.length - 1)},${height - 20 - x.orders / max * 165}`).join(' ')
  const deliveredPoints = data.map((x, i) => `${data.length === 1 ? width / 2 : i * width / (data.length - 1)},${height - 20 - x.delivered / max * 165}`).join(' ')
  const fill = `0,${height} ${points} ${width},${height}`
  return <div className="rounded-[1.8rem] border border-slate-100 bg-white p-5 shadow-sm xl:col-span-2">
    <div className="mb-5 flex items-start justify-between"><div><h3 className="font-black text-[#102a32]">حركة الأوردرات خلال الدورة</h3><p className="mt-1 text-xs font-bold text-slate-400">الإجمالي مقابل ما تم تسليمه فعليًا</p></div><div className="flex gap-3 text-[11px] font-black"><span className="text-emerald-600">● الإجمالي</span><span className="text-sky-500">● تم التسليم</span></div></div>
    <div className="h-56 w-full overflow-hidden rounded-2xl bg-gradient-to-b from-emerald-50/60 to-white">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
        <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10b981" stopOpacity=".24"/><stop offset="1" stopColor="#10b981" stopOpacity="0"/></linearGradient></defs>
        {[45, 90, 135, 180].map(y => <line key={y} x1="0" x2={width} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="5 7" />)}
        <polygon points={fill} fill="url(#chartFill)"/><polyline points={points} fill="none" stroke="#059669" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><polyline points={deliveredPoints} fill="none" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
    <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-400">{data.map(x => <span key={x.label}>{x.label}</span>)}</div>
  </div>
}

function Donut({ deliveredCount, reviewCount, failedCount, other }: { deliveredCount: number; reviewCount: number; failedCount: number; other: number }) {
  const total = Math.max(1, deliveredCount + reviewCount + failedCount + other)
  const a = deliveredCount / total * 100, b = reviewCount / total * 100, c = failedCount / total * 100
  const bg = `conic-gradient(#10b981 0 ${a}%,#f59e0b ${a}% ${a + b}%,#f43f5e ${a + b}% ${a + b + c}%,#cbd5e1 0)`
  return <div className="rounded-[1.8rem] border border-slate-100 bg-white p-5 shadow-sm"><h3 className="font-black text-[#102a32]">جودة دورة التشغيل</h3><p className="mt-1 text-xs font-bold text-slate-400">توزيع الحالات في لقطة واحدة</p><div className="mt-5 flex items-center justify-center gap-5"><div className="relative h-36 w-36 rounded-full" style={{ background: bg }}><div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white"><b className="text-2xl text-[#102a32]">{pct(deliveredCount / total * 100)}</b><span className="text-[10px] font-bold text-slate-400">تسليم</span></div></div><div className="space-y-2 text-xs font-black text-slate-600"><Legend color="bg-emerald-500" label="تم التسليم" value={deliveredCount}/><Legend color="bg-amber-500" label="مراجعة" value={reviewCount}/><Legend color="bg-rose-500" label="فاشل" value={failedCount}/><Legend color="bg-slate-300" label="أخرى" value={other}/></div></div></div>
}
function Legend({ color, label, value }: { color: string; label: string; value: number }) { return <div className="flex items-center gap-2"><i className={`h-2.5 w-2.5 rounded-full ${color}`}/><span className="min-w-[68px]">{label}</span><b>{value}</b></div> }

function ProgressList({ title, subtitle, rows, onRow }: { title: string; subtitle: string; rows: { id: string; label: string; sub?: string; value: number; rate?: number; tone?: string }[]; onRow?: (id: string) => void }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return <div className="rounded-[1.8rem] border border-slate-100 bg-white p-5 shadow-sm"><h3 className="font-black text-[#102a32]">{title}</h3><p className="mt-1 text-xs font-bold text-slate-400">{subtitle}</p><div className="mt-5 space-y-4">{rows.slice(0, 6).map((r, i) => <button key={r.id} onClick={() => onRow?.(r.id)} className="block w-full text-right group"><div className="mb-1.5 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-xs font-black text-slate-500">{i + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-700">{r.label}</p><p className="truncate text-[10px] font-bold text-slate-400">{r.sub}</p></div><b className={r.tone || 'text-[#102a32]'}>{r.value}</b>{r.rate != null && <span className="text-[10px] font-black text-slate-400">{pct(r.rate)}</span>}</div><div className="mr-9 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400 transition-all group-hover:from-emerald-600" style={{ width: `${Math.max(4, r.value / max * 100)}%` }}/></div></button>)}{!rows.length && <p className="py-12 text-center text-sm font-bold text-slate-400">لا توجد بيانات ضمن الفلتر الحالي</p>}</div></div>
}

function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) { return <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-[11px] font-black text-emerald-600">{eyebrow}</p><h2 className="mt-1 text-xl font-black text-[#102a32]">{title}</h2></div>{action}</div> }

export default function AdminDashboard() {
  const navigate = useNavigate(); const period = useMemo(() => getOperationalPeriod(), [])
  const [stats, setStats] = useState<AdminStats | null>(null); const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true); const [view, setView] = useState<ViewKey>('overview'); const [mobileNav, setMobileNav] = useState(false)
  const [search, setSearch] = useState(''); const [branch, setBranch] = useState('all'); const [lockedBranchId, setLockedBranchId] = useState<string | null>(null); const [lockedBranchName, setLockedBranchName] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null); const [drawer, setDrawer] = useState<DrawerData>(null)

  async function load() {
    setLoading(true)
    try {
      let branchId: string | null = null, branchName: string | null = null
      const local = getRiderSession()
      if (isBranchScopedRole(local.role)) { branchId = local.branch_id; branchName = local.branch_name }
      else { const session = await getCurrentSession(); const profile = session?.user?.id ? await getUserProfile(session.user.id) : null; if (isBranchScopedRole(profile?.role)) branchId = profile?.branch_id || null }
      if (branchId && !branchName) { const { data } = await supabase.from('branches').select('name,display_name').eq('id', branchId).maybeSingle(); branchName = (data as any)?.display_name || (data as any)?.name || null }
      setLockedBranchId(branchId); setLockedBranchName(branchName); if (branchId) setBranch(branchId)
      const [admin, customerRes] = await Promise.all([getAdminStats(branchId), supabase.from('customer_delivery_analytics').select('*').order('total_sales', { ascending: false }).limit(1500)])
      let customerRows = ((customerRes as any).data || []) as CustomerRow[]
      if ((customerRes as any).error) {
        const fallback = await supabase.from('delivery_customers').select('*').limit(1500)
        customerRows = ((fallback.data || []) as any[]).map(c => ({ customer_id: c.id || c.customer_code, customer_code: c.customer_code, customer_name: c.name || c.customer_name, phone: c.phone, branch_name: c.branch_name || c.branch, total_sales: n(c.total_sales), invoices_count: n(c.invoices_count), average_invoice: n(c.average_invoice), days_since_last_invoice: c.days_since_last_invoice, delivery_problem_count: n(c.delivery_problem_count), customer_segment: c.customer_segment, risk_level: c.risk_level }))
      }
      if (branchId && branchName) customerRows = customerRows.filter(c => displayBranchName(c.branch_name) === displayBranchName(branchName))
      setStats(admin); setCustomers(customerRows); setLastUpdated(new Date())
    } catch (e: any) { toast.error(e?.message || 'تعذر تحميل مركز القيادة') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { const ch = supabase.channel(`command-center-${lockedBranchId || 'all'}`).on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', ...(lockedBranchId ? { filter: `branch_id=eq.${lockedBranchId}` } : {}) }, () => void load()).subscribe(); return () => { void supabase.removeChannel(ch) } }, [lockedBranchId])

  const riders = (stats?.riders || []) as any[], allOrders = ((stats as any)?.cycleOrders || []) as any[], allTrips = ((stats as any)?.cycleTrips || []) as any[]
  const riderBranch = (r: any) => displayBranchName(r?.branch_name || r?.branch || r?.branch_id)
  const branchMatch = (row: any) => { if (branch === 'all') return true; const r = riders.find(x => x.id === row.rider_id); return row.branch_id === branch || displayBranchName(row.branch_name || row.branch || riderBranch(r)) === displayBranchName(branch) }
  const textMatch = (row: any) => !search.trim() || [row.customer_name, row.customer_name_snapshot, row.customer_code, row.invoice_number, row.invoice_no, row.rider_name, row.name, row.phone].some(v => wildcardMatchText(String(v || ''), search))
  const orders = allOrders.filter(o => branchMatch(o) && textMatch(o)); const trips = allTrips.filter(t => branchMatch(t) && textMatch(t))
  const selectedBranchName = lockedBranchId && branch === lockedBranchId ? lockedBranchName : branch
  const filteredCustomers = customers.filter(c => (branch === 'all' || displayBranchName(c.branch_name) === displayBranchName(selectedBranchName)) && textMatch(c))
  const activeRiders = riders.filter(r => (branch === 'all' || r.branch_id === branch || riderBranch(r) === displayBranchName(branch)) && textMatch(r))

  const deliveredOrders = orders.filter(delivered), failedOrders = orders.filter(failed), duplicateOrders = orders.filter(duplicate), reviewOrders = orders.filter(review)
  const deliveryRate = orders.length ? deliveredOrders.length / orders.length * 100 : 0, riskRate = orders.length ? (failedOrders.length + duplicateOrders.length + reviewOrders.length) / orders.length * 100 : 0
  const customerSales = filteredCustomers.reduce((s, c) => s + n(c.total_sales), 0); const highRiskCustomers = filteredCustomers.filter(c => c.risk_level === 'high' || ['stopped', 'at_risk'].includes(String(c.customer_segment)))
  const today = new Date().toISOString().slice(0, 10); const todayOrders = orders.filter(o => orderDate(o) === today)

  const dateChart = useMemo(() => { const start = new Date(`${period.start}T00:00:00`), end = new Date(`${period.end}T00:00:00`), dates: string[] = []; for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(d.toISOString().slice(0, 10)); const step = Math.max(1, Math.ceil(dates.length / 9)); return dates.filter((_, i) => i % step === 0 || i === dates.length - 1).map(date => ({ label: date.slice(5), orders: orders.filter(o => orderDate(o) === date).length, delivered: orders.filter(o => orderDate(o) === date && delivered(o)).length })) }, [orders, period])
  const riderAnalytics = activeRiders.map(r => { const ro = orders.filter(o => o.rider_id === r.id), rt = trips.filter(t => t.rider_id === r.id), done = ro.filter(delivered).length, problems = ro.filter(o => failed(o) || duplicate(o) || review(o)).length; return { id: r.id, name: r.name || r.username || 'دليفري', branch: riderBranch(r), orders: ro.length, trips: rt.length, delivered: done, problems, rate: ro.length ? done / ro.length * 100 : 0, score: Math.max(0, Math.round((ro.length ? done / ro.length * 70 : 0) + (ro.length ? (1 - problems / ro.length) * 30 : 0))) } }).sort((a, b) => b.score - a.score || b.orders - a.orders)
  const branchAnalytics = useMemo(() => { const labels = Array.from(new Set([...CANONICAL_BRANCHES, ...riders.map(riderBranch).filter(Boolean)])); return labels.map(label => { const bo = allOrders.filter(o => displayBranchName(o.branch_name || o.branch || riderBranch(riders.find(r => r.id === o.rider_id))) === label), bc = customers.filter(c => displayBranchName(c.branch_name) === label), br = riders.filter(r => riderBranch(r) === label); const done = bo.filter(delivered).length, problems = bo.filter(o => failed(o) || duplicate(o) || review(o)).length; return { id: label, label, orders: bo.length, riders: br.length, customers: bc.length, sales: bc.reduce((s, c) => s + n(c.total_sales), 0), delivered: done, problems, rate: bo.length ? done / bo.length * 100 : 0 } }).filter(x => x.orders || x.riders || x.customers).sort((a, b) => b.orders - a.orders) }, [allOrders, customers, riders])

  const branchOptions = lockedBranchId ? [{ value: lockedBranchId, label: lockedBranchName || lockedBranchId }] : [{ value: 'all', label: 'كل الفروع' }, ...Array.from(new Set([...CANONICAL_BRANCHES, ...branchAnalytics.map(b => b.label)])).map(x => ({ value: x, label: x }))]
  const tabs: { key: ViewKey; label: string; icon: ReactNode }[] = [{ key: 'overview', label: 'نظرة عامة', icon: <LayoutDashboard size={18}/> }, { key: 'riders', label: 'تحليل الدليفري', icon: <Bike size={18}/> }, { key: 'customers', label: 'تحليل العملاء', icon: <Users size={18}/> }, { key: 'branches', label: 'تحليل الفروع', icon: <Building2 size={18}/> }]

  async function signOut() { await logout(); navigate('/login') }
  function openOrders(title: string, rows: any[]) { setDrawer({ title, subtitle: `${rows.length} أوردر من البيانات الفعلية`, rows, kind: 'orders' }) }

  return <div dir="rtl" className="min-h-screen bg-[#f4f8f8] text-[#102a32]">
    <div className="flex min-h-screen">
      <aside className={`${mobileNav ? 'fixed inset-y-0 right-0 z-50 flex shadow-2xl' : 'hidden'} w-[280px] shrink-0 flex-col border-l border-slate-100 bg-[#0b2d33] p-5 text-white lg:sticky lg:top-0 lg:flex lg:h-screen`}>
        <div className="flex items-center gap-3 border-b border-white/10 pb-5"><img src="/logo.png" alt="دواء" className="h-12 w-12 rounded-2xl bg-white object-contain p-1"/><div><p className="font-black">مركز قيادة دواء</p><p className="text-[11px] font-bold text-emerald-200/70">Delivery Intelligence</p></div><button onClick={() => setMobileNav(false)} className="mr-auto lg:hidden"><X/></button></div>
        <nav className="mt-6 space-y-2">{tabs.map(t => <button key={t.key} onClick={() => { setView(t.key); setMobileNav(false) }} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black transition ${view === t.key ? 'bg-emerald-400 text-[#08272c] shadow-lg shadow-emerald-950/30' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>{t.icon}{t.label}</button>)}</nav>
        <div className="mt-7 overflow-y-auto border-t border-white/10 pt-5"><p className="mb-3 px-3 text-[10px] font-black text-slate-500">الأدوات التشغيلية</p>{[{ l: 'مركز العمليات الحي', p: '/admin/ops', i: <Activity size={17}/> }, { l: 'تخطيط المسارات', p: '/admin/route-plan', i: <Route size={17}/> }, { l: 'التدفق النقدي', p: '/admin/cash', i: <Wallet size={17}/> }, { l: 'دفتر الفواتير', p: '/admin/invoice-notebook', i: <FileWarning size={17}/> }, { l: 'الحماية والأنماط', p: '/admin/fraud-alerts', i: <ShieldCheck size={17}/> }, { l: 'مركز التقارير', p: '/admin/reports', i: <BarChart3 size={17}/> }, { l: 'المطابقة والمراجعة', p: '/admin/reconciliation', i: <ShieldCheck size={17}/> }, { l: 'الحضور والجداول', p: '/admin/rider-schedules', i: <Clock3 size={17}/> }, { l: 'الحوافز والخصومات', p: '/admin/rider-actions', i: <Gift size={17}/> }].map(x => <button key={x.p + x.l} onClick={() => navigate(x.p)} className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white">{x.i}{x.l}</button>)}</div>
        <div className="mt-auto rounded-2xl bg-white/5 p-4"><p className="text-xs font-black text-white">الدورة التشغيلية</p><p className="mt-1 text-[11px] font-bold text-slate-400">{period.start} ← {period.end}</p><button onClick={signOut} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-xs font-black hover:bg-rose-500"><LogOut size={15}/> تسجيل الخروج</button></div>
      </aside>
      {mobileNav && <button aria-label="إغلاق القائمة" onClick={() => setMobileNav(false)} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"/>}

      <main className="min-w-0 flex-1 p-3 sm:p-5 xl:p-7">
        <header className="mb-5 rounded-[1.8rem] border border-white bg-white/90 p-4 shadow-sm backdrop-blur-xl sm:p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} className="rounded-xl border p-2.5 lg:hidden"><Menu size={20}/></button><div><div className="flex items-center gap-2"><span className="flex h-7 items-center gap-1 rounded-full bg-emerald-50 px-3 text-[10px] font-black text-emerald-700"><Activity size={12}/> مباشر</span><p className="text-[11px] font-black text-slate-400">آخر تحديث {lastUpdated?.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) || '—'}</p></div><h1 className="mt-1 text-xl font-black sm:text-2xl">صباح الخير، دي صورة التشغيل الحقيقية</h1></div></div><div className="flex gap-2"><button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/> تحديث</button><button onClick={() => navigate('/admin/reconciliation')} className="flex items-center gap-2 rounded-xl bg-[#0b2d33] px-4 py-2.5 text-xs font-black text-white"><BarChart3 size={16}/> التقرير الكامل</button></div></div>
          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_220px]"><div className="relative"><Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن عميل، دليفري، فاتورة أو كود..." className="h-12 w-full rounded-xl border border-slate-100 bg-slate-50 pr-11 pl-4 text-xs font-bold outline-none focus:border-emerald-300 focus:bg-white"/></div><select value={branch} onChange={e => setBranch(e.target.value)} disabled={!!lockedBranchId} className="h-12 rounded-xl border border-slate-100 bg-slate-50 px-4 text-xs font-black outline-none">{branchOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</select></div>
        </header>

        {view === 'overview' && <>
          <SectionTitle eyebrow="الملخص التنفيذي" title="الأرقام التي تحتاجها لاتخاذ قرار الآن" action={<span className={`rounded-full px-3 py-1 text-[10px] font-black ${riskRate > 20 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>مؤشر المخاطر {pct(riskRate)}</span>}/>
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4"><StatCard label="أوردرات اليوم" value={todayOrders.length} hint={`${orders.length} خلال الدورة`} icon={<PackageCheck size={21}/>} onClick={() => openOrders('أوردرات اليوم', todayOrders)}/><StatCard label="معدل التسليم" value={pct(deliveryRate)} hint={`${deliveredOrders.length} أوردر تم تسليمه`} icon={<CheckCircle2 size={21}/>} tone="sky" onClick={() => openOrders('الأوردرات المسلمة', deliveredOrders)}/><StatCard label="تحتاج تدخل" value={failedOrders.length + duplicateOrders.length + reviewOrders.length} hint="فشل + تكرار + مراجعة" icon={<AlertTriangle size={21}/>} tone="rose" onClick={() => openOrders('الأوردرات التي تحتاج تدخل', orders.filter(o => failed(o) || duplicate(o) || review(o)))}/><StatCard label="قيمة قاعدة العملاء" value={money(customerSales)} hint={`${filteredCustomers.length} عميل مرتبط`} icon={<Wallet size={21}/>} tone="violet" onClick={() => setView('customers')}/></section>
          <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.35fr]"><SmartAlertsCenter orders={orders as any} riders={activeRiders as any}/><LiveRiderLeaderboard orders={orders as any} trips={trips as any} riders={activeRiders as any} onOpen={id => navigate(`/admin/riders/${id}/performance`)}/></section>
          <section className="mt-4"><RiderOperationsHealth/></section>
          <section className="mt-4 grid gap-4 xl:grid-cols-3"><AreaChart data={dateChart}/><Donut deliveredCount={deliveredOrders.length} reviewCount={reviewOrders.length} failedCount={failedOrders.length} other={Math.max(0, orders.length - deliveredOrders.length - reviewOrders.length - failedOrders.length)}/></section>
          <section className="mt-4 grid gap-4 xl:grid-cols-3"><ProgressList title="أفضل الدليفري" subtitle="ترتيب مركب من التسليم وجودة الأوردر" rows={riderAnalytics.map(r => ({ id: r.id, label: r.name, sub: `${r.branch} · تقييم ${r.score}/100`, value: r.orders, rate: r.rate }))} onRow={id => navigate(`/admin/riders/${id}/performance`)}/><ProgressList title="قوة الفروع" subtitle="حجم التشغيل ومعدل التسليم" rows={branchAnalytics.map(b => ({ id: b.id, label: b.label, sub: `${b.riders} دليفري · ${b.customers} عميل`, value: b.orders, rate: b.rate }))} onRow={id => { setBranch(id); setView('branches') }}/><ProgressList title="عملاء يحتاجون متابعة" subtitle="خطر توقف أو مشاكل في التوصيل" rows={highRiskCustomers.slice(0, 6).map(c => ({ id: c.customer_id, label: c.customer_name || 'عميل', sub: `${displayBranchName(c.branch_name)} · ${c.days_since_last_invoice ?? '—'} يوم`, value: n(c.total_sales), tone: 'text-rose-600' }))} onRow={id => setDrawer({ title: 'تحليل العميل', subtitle: 'السجل التجاري والتشغيلي', rows: filteredCustomers.filter(c => c.customer_id === id), kind: 'customers' })}/></section>
        </>}

        {view === 'riders' && <RidersView rows={riderAnalytics} onOpen={id => navigate(`/admin/riders/${id}/performance`)}/>}
        {view === 'customers' && <CustomersView rows={filteredCustomers} onOpen={row => setDrawer({ title: row.customer_name || 'تحليل العميل', subtitle: 'قراءة كاملة للقيمة والنشاط والمخاطر', rows: [row], kind: 'customers' })} onFull={() => navigate('/admin/customer-analytics')}/>}
        {view === 'branches' && <BranchesView rows={branchAnalytics} onOpen={row => setDrawer({ title: row.label, subtitle: 'تحليل أداء الفرع', rows: [row], kind: 'branches' })}/>}
      </main>
    </div>
    {drawer && <DetailDrawer data={drawer} onClose={() => setDrawer(null)} onNavigate={(path) => navigate(path)}/>}
  </div>
}

function RidersView({ rows, onOpen }: { rows: any[]; onOpen: (id: string) => void }) {
  const avg = rows.length ? rows.reduce((s, r) => s + r.score, 0) / rows.length : 0; const risks = rows.filter(r => r.problems > 0)
  return <><SectionTitle eyebrow="تحليل الدليفري" title="أداء كل فرد بشكل عادل وواضح"/><section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="الدليفري النشط" value={rows.length} hint="ضمن نطاق الفرع الحالي" icon={<Bike/>}/><StatCard label="متوسط التقييم" value={pct(avg)} hint="تسليم + جودة" icon={<Star/>} tone="violet"/><StatCard label="أداء ممتاز" value={rows.filter(r => r.score >= 85).length} hint="تقييم 85 فأكثر" icon={<TrendingUp/>} tone="sky"/><StatCard label="يحتاج متابعة" value={risks.length} hint="لديه مشكلة واحدة على الأقل" icon={<TrendingDown/>} tone="rose"/></section><div className="mt-4 overflow-hidden rounded-[1.8rem] border border-slate-100 bg-white shadow-sm"><div className="border-b p-5"><h3 className="font-black">بطاقة أداء الفريق</h3><p className="mt-1 text-xs font-bold text-slate-400">اضغط على أي دليفري لفتح تقريره التفصيلي والحوافز</p></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50 text-[11px] font-black text-slate-500"><tr><th className="p-4">الدليفري</th><th>الفرع</th><th>الأوردرات</th><th>التسليم</th><th>المشاوير</th><th>المشاكل</th><th>التقييم</th><th></th></tr></thead><tbody>{rows.map((r, i) => <tr key={r.id} className="border-t border-slate-50 hover:bg-emerald-50/30"><td className="p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0b2d33] font-black text-white">{i + 1}</span><b>{r.name}</b></div></td><td className="font-bold text-slate-500">{r.branch}</td><td className="font-black">{r.orders}</td><td className="text-emerald-700 font-black">{r.delivered} · {pct(r.rate)}</td><td>{r.trips}</td><td className={r.problems ? 'font-black text-rose-600' : 'text-slate-400'}>{r.problems}</td><td><span className={`rounded-full px-3 py-1 text-xs font-black ${r.score >= 85 ? 'bg-emerald-50 text-emerald-700' : r.score >= 65 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{r.score}/100</span></td><td><button onClick={() => onOpen(r.id)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">فتح التحليل</button></td></tr>)}</tbody></table></div></div></>
}

function CustomersView({ rows, onOpen, onFull }: { rows: CustomerRow[]; onOpen: (row: CustomerRow) => void; onFull: () => void }) {
  const vip = rows.filter(r => r.customer_segment === 'vip'), danger = rows.filter(r => r.risk_level === 'high'), issues = rows.filter(r => n(r.delivery_problem_count) > 0), sales = rows.reduce((s, r) => s + n(r.total_sales), 0)
  return <><SectionTitle eyebrow="تحليل العملاء" title="القيمة، النشاط، ومَن نخشى أن نفقده" action={<button onClick={onFull} className="flex items-center gap-2 rounded-xl bg-[#0b2d33] px-4 py-2 text-xs font-black text-white">الصفحة المتقدمة <ArrowLeft size={14}/></button>}/><section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="إجمالي العملاء" value={rows.length} hint={money(sales)} icon={<Users/>}/><StatCard label="عملاء VIP" value={vip.length} hint="أعلى قيمة شرائية" icon={<Star/>} tone="violet"/><StatCard label="معرضون للتوقف" value={danger.length} hint="أولوية للاسترجاع" icon={<TrendingDown/>} tone="rose"/><StatCard label="مشاكل توصيل" value={issues.length} hint="تؤثر على رضا العميل" icon={<FileWarning/>} tone="amber"/></section><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.slice(0, 18).map(r => <button key={r.customer_id} onClick={() => onOpen(r)} className="rounded-[1.5rem] border border-slate-100 bg-white p-4 text-right shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-black">{r.customer_name || 'عميل غير مسمى'}</h3><p className="mt-1 text-[11px] font-bold text-slate-400">{r.customer_code || 'بدون كود'} · {displayBranchName(r.branch_name)}</p></div><span className={`h-fit rounded-full px-2.5 py-1 text-[10px] font-black ${r.risk_level === 'high' ? 'bg-rose-50 text-rose-700' : r.customer_segment === 'vip' ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>{r.customer_segment || 'نشط'}</span></div><div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center"><Mini label="المبيعات" value={money(n(r.total_sales))}/><Mini label="الفواتير" value={n(r.invoices_count)}/><Mini label="مشاكل" value={n(r.delivery_problem_count)}/></div></button>)}</div></>
}

function BranchesView({ rows, onOpen }: { rows: any[]; onOpen: (row: any) => void }) { return <><SectionTitle eyebrow="تحليل الفروع" title="مقارنة عادلة بين حجم التشغيل وجودته"/><div className="grid gap-4 xl:grid-cols-2">{rows.map(r => <button key={r.id} onClick={() => onOpen(r)} className="overflow-hidden rounded-[1.8rem] border border-slate-100 bg-white text-right shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className="bg-gradient-to-l from-[#0b2d33] to-[#14515a] p-5 text-white"><div className="flex justify-between"><div><p className="text-xs font-bold text-emerald-200">تقرير الفرع</p><h3 className="mt-1 text-2xl font-black">{r.label}</h3></div><Building2 size={34} className="text-emerald-300"/></div></div><div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4"><Mini label="الأوردرات" value={r.orders}/><Mini label="معدل التسليم" value={pct(r.rate)}/><Mini label="الدليفري" value={r.riders}/><Mini label="العملاء" value={r.customers}/></div><div className="mx-5 mb-5 flex items-center justify-between rounded-2xl bg-slate-50 p-4"><div><p className="text-[10px] font-black text-slate-400">قيمة قاعدة العملاء</p><b>{money(r.sales)}</b></div><div className="text-left"><p className="text-[10px] font-black text-slate-400">حالات تحتاج تدخل</p><b className={r.problems ? 'text-rose-600' : 'text-emerald-600'}>{r.problems}</b></div></div></button>)}</div></> }
function Mini({ label, value }: { label: string; value: string | number }) { return <div><p className="text-[10px] font-black text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-[#102a32]">{value}</p></div> }

function DetailDrawer({ data, onClose, onNavigate }: { data: Exclude<DrawerData, null>; onClose: () => void; onNavigate: (path: string) => void }) {
  return <div className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-sm" onMouseDown={onClose}><aside dir="rtl" onMouseDown={e => e.stopPropagation()} className="absolute inset-y-0 left-0 w-full max-w-2xl overflow-y-auto bg-[#f7fafa] p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black text-emerald-600">تفاصيل وتحليل</p><h2 className="mt-1 text-2xl font-black">{data.title}</h2><p className="mt-1 text-xs font-bold text-slate-400">{data.subtitle}</p></div><button onClick={onClose} className="rounded-xl border bg-white p-2"><X/></button></div>
    {data.kind === 'orders' && <div className="mt-6 space-y-3">{data.rows.slice(0, 60).map((o: any) => <div key={o.id} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div><p className="text-[10px] font-black text-slate-400">فاتورة</p><b>{o.invoice_number || o.invoice_no || o.order_no || 'بدون رقم'}</b></div><div className="flex flex-wrap gap-1">{delivered(o) && <Tag text="تم التسليم" tone="green"/>}{failed(o) && <Tag text="فاشل" tone="red"/>}{duplicate(o) && <Tag text="مكرر" tone="amber"/>}{review(o) && <Tag text="مراجعة" tone="amber"/>}</div></div><div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs font-bold text-slate-500"><span>العميل: <b className="text-slate-700">{o.customer_name || o.customer_name_snapshot || '—'}</b></span><span>الدليفري: <b className="text-slate-700">{o.rider_name || '—'}</b></span><span>التاريخ: <b className="text-slate-700">{orderDate(o) || '—'}</b></span><span>القيمة: <b className="text-slate-700">{money(n(o.invoice_amount || o.invoice_value))}</b></span></div></div>)}<button onClick={() => onNavigate('/admin/reconciliation')} className="w-full rounded-2xl bg-[#0b2d33] py-3 text-sm font-black text-white">فتح المطابقة والمراجعة</button></div>}
    {data.kind === 'customers' && data.rows.map((c: CustomerRow) => <div key={c.customer_id} className="mt-6 space-y-4"><div className="rounded-[1.8rem] bg-gradient-to-l from-[#0b2d33] to-[#17616a] p-6 text-white"><p className="text-xs font-bold text-emerald-200">القيمة الإجمالية</p><p className="mt-2 text-4xl font-black">{money(n(c.total_sales))}</p><p className="mt-2 text-xs font-bold text-slate-300">{c.customer_code || 'بدون كود'} · {c.phone || 'بدون هاتف'} · {displayBranchName(c.branch_name)}</p></div><div className="grid grid-cols-2 gap-3"><StatCard label="الفواتير" value={n(c.invoices_count)} hint={`متوسط ${money(n(c.average_invoice))}`} icon={<CircleDollarSign/>}/><StatCard label="أوردرات التوصيل" value={n(c.total_orders)} hint={`${n(c.matched_orders)} مطابق`} icon={<PackageCheck/>} tone="sky"/><StatCard label="من آخر شراء" value={`${c.days_since_last_invoice ?? '—'} يوم`} hint="مؤشر النشاط" icon={<Clock3/>} tone="amber"/><StatCard label="مشاكل التوصيل" value={n(c.delivery_problem_count)} hint={`مخاطر: ${c.risk_level || 'منخفضة'}`} icon={<AlertTriangle/>} tone="rose"/></div><div className="rounded-2xl border bg-white p-5"><h3 className="font-black">القرار المقترح</h3><p className="mt-2 text-sm font-bold leading-7 text-slate-500">{c.risk_level === 'high' ? 'عميل ذو أولوية عالية للاسترجاع. راجع آخر مشكلة توصيل وتواصل معه بعرض مناسب.' : c.customer_segment === 'vip' ? 'عميل عالي القيمة. حافظ على مستوى الخدمة وراقب أي مشكلة توصيل فور ظهورها.' : 'العميل في وضع مستقر. استمر في المتابعة الدورية وراقب معدل تكرار الشراء.'}</p></div></div>)}
    {data.kind === 'branches' && data.rows.map((b: any) => <div key={b.id} className="mt-6"><div className="grid grid-cols-2 gap-3"><StatCard label="الأوردرات" value={b.orders} hint={`${b.delivered} تم تسليمه`} icon={<PackageCheck/>}/><StatCard label="معدل التسليم" value={pct(b.rate)} hint={`${b.problems} تحتاج تدخل`} icon={<TrendingUp/>} tone="sky"/><StatCard label="فريق الدليفري" value={b.riders} hint="دليفري نشط" icon={<Bike/>} tone="violet"/><StatCard label="قاعدة العملاء" value={b.customers} hint={money(b.sales)} icon={<Users/>} tone="amber"/></div><button onClick={() => { onClose(); onNavigate('/admin/executive') }} className="mt-5 w-full rounded-2xl bg-[#0b2d33] py-3 text-sm font-black text-white">فتح غرفة التحكم المتقدمة</button></div>)}
  </aside></div>
}
function Tag({ text, tone }: { text: string; tone: 'green' | 'red' | 'amber' }) { const cls = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'red' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'; return <span className={`rounded-full px-2 py-1 text-[10px] font-black ${cls}`}>{text}</span> }
