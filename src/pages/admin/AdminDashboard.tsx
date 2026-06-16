import { useEffect, useMemo, useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import {
    AlertTriangle, BarChart3, Bell, Bike, CheckCircle2, ClipboardCheck,
    ClipboardList, Clock3, Download, FileCheck2, FileText, Gift, Home,
    LogOut, Package, RefreshCw, Route, Search, ShieldCheck, Eye, Store,
    TrendingUp, Users, UploadCloud, XCircle
  } from 'lucide-react'
  import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend
  } from 'recharts'
  import { toast } from 'sonner'
  import { getCurrentSession, getRiderSession, getUserProfile, logout } from '../../lib/auth'
  import { getAdminStats, getRiderScheduleExceptions, getRiderRewardsPenalties } from '../../lib/delivery'
  import { formatMoney, getOperationalPeriod, wildcardMatchText, TRIP_TYPE_LABELS, TRIP_STATUS_LABELS } from '../../lib/helpers'
  import { DeliveryOrder, InternalTrip, Rider } from '../../lib/types'
  import { CANONICAL_BRANCHES } from '../../lib/branchUtils'
  import { supabase } from '../../lib/supabase'
  import { sendBatteryNotification } from '../../lib/notifications'
  import RiderDeviceStatusTable, { type RiderDeviceStatusRow } from '../../components/RiderDeviceStatusTable'
  import { isBranchScopedRole } from '../../lib/permissions'
  import NotificationBell from '../../components/NotificationBell'
  import AdminBroadcastPanel from '../../components/AdminBroadcastPanel'

  type AdminStats = Awaited<ReturnType<typeof getAdminStats>>
  type NavItem = { label: string; icon: React.ReactNode; path?: string; badge?: number; active?: boolean }
  type Drilldown = { title: string; type: 'orders' | 'trips' | 'alerts' | 'riders'; rows: any[] } | null

  type MetricCardProps = {
    title: string
    value: string | number
    subtitle?: string
    icon: React.ReactNode
    tone?: 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'slate'
    onClick?: () => void
  }

  const toneClasses: Record<NonNullable<MetricCardProps['tone']>, { icon: string; accent: string; ring: string }> = {
    green:  { icon: 'bg-emerald-50 text-emerald-600',  accent: 'text-emerald-600',  ring: 'hover:border-emerald-200' },
    blue:   { icon: 'bg-sky-50 text-sky-600',          accent: 'text-sky-600',      ring: 'hover:border-sky-200' },
    orange: { icon: 'bg-orange-50 text-orange-600',    accent: 'text-orange-600',   ring: 'hover:border-orange-200' },
    red:    { icon: 'bg-rose-50 text-rose-600',        accent: 'text-rose-600',     ring: 'hover:border-rose-200' },
    purple: { icon: 'bg-purple-50 text-purple-600',    accent: 'text-purple-600',   ring: 'hover:border-purple-200' },
    slate:  { icon: 'bg-slate-100 text-slate-600',     accent: 'text-slate-600',    ring: 'hover:border-slate-200' },
  }

  function getOrderDate(order: any): string {
    return order?.delivery_date || (order?.registered_at || order?.created_at || '').slice(0, 10)
  }
  function getTripDate(trip: any): string {
    return trip?.trip_date || (trip?.registered_at || trip?.created_at || '').slice(0, 10)
  }
  function isDeleted(row: any)   { return Boolean(row?.deleted_at) }
  function isDelivered(order: any) {
    return ['delivered', 'تم التسليم'].includes(String(order?.status || '').toLowerCase()) || Boolean(order?.delivered_at)
  }
  function isFailed(order: any) {
    const s = String(order?.status || '').toLowerCase()
    return s.includes('fail') || s === 'failed' || Boolean(order?.failed_at) || Boolean(order?.failed_reason)
  }
  function isReview(order: any) {
    return Boolean(order?.needs_review) || ['pending', 'needs_review', 'registered'].includes(String(order?.review_status || order?.status || '').toLowerCase())
  }
  function isMultiplier(order: any) {
    return Number(order?.order_multiplier ?? (order?.is_multiplier_order ? 1.5 : 1)) >= 1.5
  }
  function cycleLabel(p: { start: string; end: string }) { return `${p.start} → ${p.end}` }
  function daysBetween(startIso: string, endIso: string) {
    const start = new Date(`${startIso}T00:00:00`)
    const end   = new Date(`${endIso}T00:00:00`)
    const diff  = Math.round((end.getTime() - start.getTime()) / 86400000)
    return Array.from({ length: Math.max(1, diff + 1) }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i)
      return d.toISOString().slice(0, 10)
    })
  }

  // ─── Components ───────────────────────────────────────────────────────────────
  function MetricCard({ title, value, subtitle, icon, tone = 'green', onClick }: MetricCardProps) {
    const t = toneClasses[tone]
    const Comp = onClick ? 'button' : 'div'
    return (
      <Comp
        onClick={onClick as any}
        className={`group rounded-3xl border border-slate-100 bg-white p-4 text-right shadow-sm transition-all ${t.ring} ${onClick ? 'hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 w-full' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${t.icon}`}>{icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-600">{title}</p>
            <p className="mt-2 text-3xl font-black leading-none text-[#061827]">{value}</p>
            {subtitle && <p className={`mt-2 text-xs font-black ${t.accent}`}>{subtitle}</p>}
          </div>
        </div>
      </Comp>
    )
  }

  function SideBar({ items, onLogout, userName, userRole }: { items: NavItem[]; onLogout: () => void; userName?: string; userRole?: string }) {
    return (
      <aside className="hidden w-[260px] shrink-0 border-l border-slate-100 bg-white p-5 lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-3">
          <img src="/dawaa-logo.jpeg" className="h-12 w-12 rounded-2xl border object-contain p-1 shadow-sm" alt="Dawaa" />
          <div>
            <p className="font-black text-[#061827]">لوحة إدارة الدليفري</p>
            <p className="text-xs font-bold text-slate-400">نظام إدارة عمليات التوصيل</p>
          </div>
        </div>
        <nav className="space-y-1">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => item.path && (window.location.href = item.path)}
              className={`relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-right text-sm font-black transition ${item.active ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {!!item.badge && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">{item.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-3xl border bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Users size={22} /></div>
            <div className="flex-1">
              <p className="font-black text-[#061827]">{userName || 'المدير'}</p>
              <p className="text-xs text-slate-400">{userRole || 'admin'}</p>
            </div>
          </div>
          <button onClick={onLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-100">
            <LogOut size={16} /> تسجيل خروج
          </button>
        </div>
      </aside>
    )
  }

  const CHART_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#f97316']

  function OrdersLineChart({ values }: { values: { label: string; value: number }[] }) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-base font-black text-[#061827]">تطور الأوردرات خلال الدورة</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={values} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              formatter={(v: any) => [v, 'أوردرات']}
            />
            <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: '#059669' }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  function BranchBarChart({ rows }: { rows: { label: string; value: number }[] }) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-base font-black text-[#061827]">الأوردرات حسب الفرع</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} formatter={(v: any) => [v, 'أوردر']} />
            <Bar dataKey="value" fill="#008E92" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  function HourlyBarChart({ rows }: { rows: { label: string; value: number }[] }) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-base font-black text-[#061827]">أوقات الذروة</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} formatter={(v: any) => [v, 'أوردر']} />
            <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  function DonutStatusChart({ delivered, review, failed, duplicate }: { delivered: number; review: number; failed: number; duplicate: number }) {
    const total = Math.max(1, delivered + review + failed + duplicate)
    const data = [
      { name: 'تم التسليم', value: delivered, color: '#10b981' },
      { name: 'تحت المراجعة', value: review, color: '#f59e0b' },
      { name: 'فاشل', value: failed, color: '#ef4444' },
      { name: 'مكرر', value: duplicate, color: '#8b5cf6' },
    ].filter(d => d.value > 0)

    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-base font-black text-[#061827]">حالات الأوردرات</h3>
        <div className="flex items-center justify-center gap-4">
          <div className="relative">
            <ResponsiveContainer width={130} height={130}>
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={60} dataKey="value" paddingAngle={2}>
                  {data.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} formatter={(v: any) => [v, 'أوردر']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-slate-400">الإجمالي</span>
              <span className="text-lg font-black text-[#061827]">{total}</span>
            </div>
          </div>
          <div className="space-y-1.5 text-xs font-bold text-slate-600">
            {data.map(d => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span>{d.name}</span>
                <span className="font-black text-[#061827]">{d.value}</span>
                <span className="text-slate-400">({Math.round(d.value/total*100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function EmptyLine({ text }: { text: string }) {
    return <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-black text-slate-400">{text}</div>
  }

  function RankingList({ riders }: { riders: Array<{ id: string; name: string; orders: number; branch?: string }> }) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-base font-black text-[#061827]">أفضل المندوبين</h3>
        <div className="space-y-3">
          {riders.slice(0, 6).length ? riders.slice(0, 6).map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white font-black text-emerald-600">{i + 1}</span>
              <div className="flex-1">
                <p className="font-black text-[#061827]">{r.name}</p>
                <p className="text-xs font-bold text-slate-400">{r.branch || 'كل الفروع'}</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-700">{r.orders}</span>
            </div>
          )) : <EmptyLine text="لا توجد بيانات ترتيب بعد" />}
        </div>
      </div>
    )
  }

  function ReviewTable({ orders, riders }: { orders: DeliveryOrder[]; riders: Rider[] }) {
    const rows = orders.filter((o: any) => !isDeleted(o) && (isReview(o) || isFailed(o) || o.is_duplicate_invoice || isMultiplier(o))).slice(0, 8)
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black text-[#061827]">أوردرات تحت المراجعة</h3>
          <button onClick={() => (window.location.href = '/admin/reconciliation')} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">عرض الكل</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead className="text-xs font-black text-slate-400">
              <tr>
                <th className="p-3">رقم الفاتورة</th>
                <th className="p-3">العميل</th>
                <th className="p-3">المندوب</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length ? rows.map((o: any) => {
                const rider = riders.find(r => r.id === o.rider_id)
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="p-3 font-black text-[#061827]">{o.invoice_no || o.invoice_number || o.order_no || 'بدون رقم'}</td>
                    <td className="p-3"><p className="font-bold text-slate-700">{o.customer_name || o.customer_name_snapshot || 'عميل غير محدد'}</p><p className="text-xs text-slate-400">{o.customer_code || o.customer_code_snapshot || ''}</p></td>
                    <td className="p-3 font-bold text-slate-600">{o.rider_name || rider?.name || o.driver_name || 'غير مربوط'}</td>
                    <td className="p-3"><StatusBadges order={o} /></td>
                    <td className="p-3"><div className="flex gap-2"><button className="rounded-xl border border-emerald-200 px-3 py-1 text-xs font-black text-emerald-700">موافقة</button><button className="rounded-xl border border-rose-200 px-3 py-1 text-xs font-black text-rose-700">استبعاد</button></div></td>
                  </tr>
                )
              }) : <tr><td colSpan={5} className="p-6 text-center font-bold text-slate-400">لا توجد أوردرات تحت المراجعة حاليًا</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function StatusBadges({ order }: { order: any }) {
    const badges: { text: string; cls: string }[] = []
    if (isFailed(order))               badges.push({ text: 'فاشل',   cls: 'bg-rose-50 text-rose-700' })
    if (order?.is_duplicate_invoice)   badges.push({ text: 'مكرر',   cls: 'bg-amber-50 text-amber-700' })
    if (isMultiplier(order))           badges.push({ text: '×1.5',   cls: 'bg-orange-50 text-orange-700' })
    if (isReview(order))               badges.push({ text: 'مراجعة', cls: 'bg-sky-50 text-sky-700' })
    if (!badges.length)                badges.push({ text: 'عادي',   cls: 'bg-slate-100 text-slate-600' })
    return <div className="flex flex-wrap gap-1">{badges.map(b => <span key={b.text} className={`rounded-full px-2 py-1 text-[11px] font-black ${b.cls}`}>{b.text}</span>)}</div>
  }

  function AlertList({ duplicate, failed, multiplier, late, pendingActions }: { duplicate: number; failed: number; multiplier: number; late: number; pendingActions: number }) {
    const alerts = [
      { icon: <XCircle size={18} />,     title: 'أوردرات فاشلة لا تحتسب',          sub: `${failed} أوردر فاشل`,           tone: 'text-rose-600 bg-rose-50',     show: failed > 0 },
      { icon: <FileText size={18} />,    title: 'فواتير مكررة بحاجة لتدقيق',       sub: `${duplicate} فاتورة مكررة`,       tone: 'text-rose-600 bg-rose-50',     show: duplicate > 0 },
      { icon: <TrendingUp size={18} />,  title: 'طلبات ×1.5 تنتظر الموافقة',       sub: `${multiplier} طلب تحت المراجعة`, tone: 'text-orange-600 bg-orange-50', show: multiplier > 0 },
      { icon: <Clock3 size={18} />,      title: 'مشاكل في الحضور',                 sub: `${late} تأخير/حضور ناقص`,        tone: 'text-amber-600 bg-amber-50',   show: late > 0 },
      { icon: <Gift size={18} />,        title: 'خصومات ومكافآت تحت المراجعة',     sub: `${pendingActions} موقف`,         tone: 'text-purple-600 bg-purple-50', show: pendingActions > 0 },
    ]
    const visible = alerts.filter(a => a.show)
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-base font-black text-[#061827]">أهم التنبيهات</h3>
        {visible.length === 0
          ? <EmptyLine text="لا توجد تنبيهات حرجة — كل شيء على ما يرام" />
          : <div className="space-y-2">
              {visible.map((a) => (
                <div key={a.title} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.tone}`}>{a.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-black text-[#061827]">{a.title}</p>
                    <p className="text-xs font-bold text-slate-400">{a.sub}</p>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    )
  }

  // ─── Main Component ───────────────────────────────────────────────────────────
  export default function AdminDashboard() {
    const navigate = useNavigate()
    const [stats, setStats] = useState<AdminStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [deviceRows, setDeviceRows] = useState<RiderDeviceStatusRow[]>([])
    const [search, setSearch] = useState('')
    const [branch, setBranch] = useState('all')
    const [lockedBranchId, setLockedBranchId] = useState<string | null>(null)
    const [lockedBranchName, setLockedBranchName] = useState<string | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [pendingExceptions, setPendingExceptions] = useState(0)
    const [drilldown, setDrilldown] = useState<Drilldown>(null)
    const [totalRewards, setTotalRewards] = useState(0)
    const [totalPenalties, setTotalPenalties] = useState(0)
    const [userName, setUserName] = useState<string>('')
    const [userRole, setUserRole] = useState<string>('')
    const period = useMemo(() => getOperationalPeriod(), [])

    async function loadStats() {
      try {
        setLoading(true)
        let branchScopeId: string | null = null
        let branchScopeName: string | null = null

        const localSession = getRiderSession()
        if (isBranchScopedRole(localSession.role)) {
          branchScopeId = localSession.branch_id
          branchScopeName = localSession.branch_name
          setUserName(localSession.rider_name || localSession.username || 'مدير الفرع')
          setUserRole(localSession.role || '')
        } else {
          const session = await getCurrentSession()
          const profile = session?.user?.id ? await getUserProfile(session.user.id) : null
          if (profile) {
            setUserName(profile.display_name || profile.username || '')
            setUserRole(profile.role || '')
          }
          if (isBranchScopedRole(profile?.role)) branchScopeId = profile?.branch_id || null
        }

        if (branchScopeId && !branchScopeName) {
          const { data: b } = await supabase.from('branches').select('name, display_name').eq('id', branchScopeId).maybeSingle()
          branchScopeName = (b as any)?.display_name || (b as any)?.name || null
        }
        setLockedBranchId(branchScopeId)
        setLockedBranchName(branchScopeName)
        if (branchScopeId) setBranch(branchScopeId)

        const [s, exceptions, devices, rewardsPenalties] = await Promise.all([
          getAdminStats(branchScopeId),
          getRiderScheduleExceptions(),
          branchScopeId
            ? supabase.from('rider_device_status').select('*').eq('branch_id', branchScopeId).order('last_seen_at', { ascending: false })
            : supabase.from('rider_device_status').select('*').order('last_seen_at', { ascending: false }),
          getRiderRewardsPenalties(undefined, period.start, period.end),
        ])

        setStats(s)
        setDeviceRows(((devices as any).data || []) as RiderDeviceStatusRow[])
        setPendingExceptions(exceptions.filter((e: any) => e.status === 'pending' && (!branchScopeId || e.branch_id === branchScopeId)).length)

        const approved = rewardsPenalties.filter((rp: any) => rp.status === 'approved')
        setTotalRewards(approved.filter((rp: any) => rp.type === 'reward').reduce((s: number, rp: any) => s + Number(rp.amount || 0), 0))
        setTotalPenalties(approved.filter((rp: any) => rp.type === 'penalty').reduce((s: number, rp: any) => s + Number(rp.amount || 0), 0))
      } catch {
        toast.error('حصلت مشكلة في تحميل لوحة الإدارة')
      } finally {
        setLoading(false)
      }
    }

    useEffect(() => { void loadStats() }, [refreshKey])

    useEffect(() => {
      const channel = supabase
        .channel(`admin-dashboard-orders-${lockedBranchId || 'all'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', ...(lockedBranchId ? { filter: `branch_id=eq.${lockedBranchId}` } : {}) }, () => setRefreshKey(k => k + 1))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_trips',  ...(lockedBranchId ? { filter: `branch_id=eq.${lockedBranchId}` } : {}) }, () => setRefreshKey(k => k + 1))
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }, [lockedBranchId])

    async function handleLogout() { await logout(); navigate('/login') }

    const riders      = (stats?.riders   ?? []).filter(Boolean) as Rider[]
    const ordersToday = (stats?.orders   ?? []).filter((o: any) => o && !isDeleted(o)) as DeliveryOrder[]
    const tripsToday  = (stats?.trips    ?? []).filter(Boolean) as InternalTrip[]
    const cycleOrders = ((stats as any)?.cycleOrders ?? []).filter((o: any) => o && !isDeleted(o)) as DeliveryOrder[]
    const cycleTrips  = ((stats as any)?.cycleTrips  ?? []).filter(Boolean) as InternalTrip[]
    const attendance  = (stats?.attendance ?? []).filter(Boolean) as any[]

    const branchOptions = useMemo(() => {
      if (lockedBranchId) return [lockedBranchName || lockedBranchId]
      return CANONICAL_BRANCHES
    }, [lockedBranchId, lockedBranchName])

    function riderBranch(rider?: Rider) { return (rider as any)?.branch_name || rider?.branch_id || 'غير محدد' }

    function filterByBranch<T extends any>(rows: T[]) {
      return rows.filter((row: any) => {
        const rider = riders.find(r => r.id === row.rider_id)
        const rowBranch = row.branch_name || row.branch || riderBranch(rider)
        const branchOk = lockedBranchId
          ? row.branch_id === lockedBranchId || rowBranch === lockedBranchName
          : branch === 'all' || rowBranch === branch || row.branch_id === branch
        const searchOk = !search.trim() || [row.customer_name, row.customer_name_snapshot, row.invoice_no, row.invoice_number, row.order_no, row.rider_name, row.driver_name, rider?.name, rider?.username].some(v => wildcardMatchText(String(v || ''), search))
        return branchOk && searchOk
      })
    }

    const fOrdersToday = filterByBranch(ordersToday)
    const fTripsToday  = filterByBranch(tripsToday)
    const fCycleOrders = filterByBranch(cycleOrders)
    const fCycleTrips  = filterByBranch(cycleTrips)

    const delivered    = fCycleOrders.filter(isDelivered).length
    const failed       = fCycleOrders.filter(isFailed).length
    const duplicate    = fCycleOrders.filter((o: any) => o.is_duplicate_invoice || o.duplicate_warning).length
    const review       = fCycleOrders.filter(isReview).length
    const onePointFive = fCycleOrders.filter(isMultiplier).length
    const lateRiders   = attendance.filter(a => Number(a.late_minutes || 0) > 0).length
    const failedToday  = fOrdersToday.filter(isFailed).length
    const duplicateToday = fOrdersToday.filter((o: any) => o.is_duplicate_invoice || o.duplicate_warning).length
    const multiplierToday = fOrdersToday.filter(isMultiplier).length
    const criticalAlerts = failedToday + duplicateToday + multiplierToday + lateRiders

    const riderRows = riders.map(r => {
      const orders = fCycleOrders.filter(o => o.rider_id === r.id)
      const trips  = fCycleTrips.filter(t => t.rider_id === r.id)
      return { id: r.id, name: r.name, branch: riderBranch(r), orders: orders.length, trips: trips.length, failed: orders.filter(isFailed).length, multiplier: orders.filter(isMultiplier).length }
    }).sort((a, b) => b.orders - a.orders)

    const branchChartData = useMemo(() => {
      const map = new Map<string, number>()
      fCycleOrders.forEach((o: any) => {
        const rider = riders.find(r => r.id === o.rider_id)
        const label = o.branch_name || o.branch || riderBranch(rider)
        map.set(label, (map.get(label) || 0) + 1)
      })
      return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6)
    }, [fCycleOrders, riders])

    const hourlyChartData = useMemo(() => {
      const hours = [8, 10, 12, 14, 16, 18, 20, 22]
      return hours.map(h => ({
        label: `${String(h).padStart(2, '0')}:00`,
        value: fCycleOrders.filter((o: any) => {
          const d = new Date(o.registered_at || o.created_at || o.delivery_date)
          return !Number.isNaN(d.getTime()) && d.getHours() >= h && d.getHours() < h + 2
        }).length
      }))
    }, [fCycleOrders])

    const lineChartData = useMemo(() => {
      const dates  = daysBetween(period.start, period.end)
      const sample = dates.filter((_, i) => i % Math.max(1, Math.floor(dates.length / 7)) === 0).slice(-8)
      return sample.map(d => ({ label: d.slice(5), value: fCycleOrders.filter(o => getOrderDate(o) === d).length }))
    }, [fCycleOrders, period])

    const navItems: NavItem[] = [
      { label: 'الرئيسية',           icon: <Home size={18} />,         path: '/admin',                    active: true },
      { label: 'إدارة الدليفري',     icon: <Bike size={18} />,         path: '/admin/riders' },
      { label: 'حسابات الدليفري',    icon: <ShieldCheck size={18} />,  path: '/admin/rider-accounts' },
      { label: 'لوحة مدير الفرع',   icon: <Store size={18} />,        path: '/admin/branch' },
      { label: 'الأوردرات والمطابقة', icon: <ClipboardList size={18}/>, path: '/admin/reconciliation',    badge: review },
      { label: 'المشاوير',           icon: <Route size={18} />,        path: '/admin/trips' },
      { label: 'الحضور والجدول',     icon: <Users size={18} />,        path: '/admin/rider-schedules' },
      { label: 'الأداء',             icon: <BarChart3 size={18} />,    path: '/admin/performance' },
      { label: 'خصومات ومكافآت',    icon: <Gift size={18} />,         path: '/admin/rider-actions',      badge: pendingExceptions },
      { label: 'فواتير مكررة',      icon: <FileText size={18} />,     path: '/admin/duplicate-invoices', badge: duplicate || undefined },
      { label: 'رفع العملاء',       icon: <UploadCloud size={18} />,  path: '/admin/customer-import' },
      { label: 'تحليل العملاء',     icon: <TrendingUp size={18} />,   path: '/admin/customer-analytics' },
    ]

    return (
      <div dir="rtl" className="min-h-screen bg-[#f5f8f9] text-[#061827]">
        <div className="flex min-h-screen">
          <SideBar items={navItems} onLogout={handleLogout} userName={userName} userRole={userRole} />
          <main className="min-w-0 flex-1 p-4 lg:p-6">
            {/* Header */}
            <header className="mb-5 flex flex-col gap-3 rounded-[2rem] border border-white bg-white/90 p-4 shadow-sm backdrop-blur lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black text-emerald-600">لوحة إدارة الدليفري</p>
                <h1 className="mt-1 text-2xl font-black lg:text-3xl">التحكم التشغيلي والمراجعة الذكية</h1>
                <p className="mt-1 text-xs font-bold text-slate-400">الدورة الحالية: {cycleLabel(period)} • تحديث تلقائي مباشر</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AdminBroadcastPanel branchId={lockedBranchId} branchName={lockedBranchName} />
                <NotificationBell branchId={lockedBranchId} />
                <button onClick={() => navigate('/admin/reconciliation')} className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-700">
                  <Download size={18} /> تقرير PDF
                </button>
                <button onClick={() => setRefreshKey(k => k + 1)} className="rounded-2xl border bg-white p-3 text-slate-600 hover:bg-slate-50" disabled={loading}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
                <button onClick={handleLogout} className="rounded-2xl border bg-white p-3 text-slate-600 hover:bg-slate-50"><LogOut size={18} /></button>
              </div>
            </header>

            {/* Search & branch filter */}
            <section className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن أوردر، فاتورة، مندوب، عميل... استخدم * مثل ا*س*لا*" className="h-14 w-full rounded-2xl border border-slate-100 bg-white pr-12 pl-4 text-sm font-bold outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50" />
              </div>
              <select value={branch} onChange={e => setBranch(e.target.value)} disabled={!!lockedBranchId} className="h-14 rounded-2xl border border-slate-100 bg-white px-4 text-sm font-black outline-none focus:border-emerald-300 disabled:bg-slate-50">
                {lockedBranchId && <option value={lockedBranchId}>{lockedBranchName || lockedBranchId}</option>}
                <option value="all">كل الفروع</option>
                {branchOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <button onClick={() => navigate('/admin/riders')} className="h-14 rounded-2xl border border-slate-100 bg-white px-5 text-sm font-black text-slate-600 hover:bg-slate-50"><Store size={16} className="ml-2 inline" />إدارة الدليفري</button>
            </section>

            {/* ─── الصف الأول: التنبيهات الحرجة أولاً ───────────────────────── */}
            {criticalAlerts > 0 && (
              <section className="mb-5 rounded-3xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <AlertTriangle size={20} className="text-rose-600" />
                  <p className="font-black text-rose-700">تنبيهات تحتاج إجراء فوري</p>
                  {failedToday > 0 && <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700">{failedToday} فاشل اليوم</span>}
                  {duplicateToday > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">{duplicateToday} مكرر اليوم</span>}
                  {multiplierToday > 0 && <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">{multiplierToday} طلب ×1.5</span>}
                  {lateRiders > 0 && <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-black text-yellow-700">{lateRiders} تأخير حضور</span>}
                  <button onClick={() => navigate('/admin/reconciliation')} className="mr-auto rounded-2xl bg-rose-600 px-4 py-2 text-xs font-black text-white">مراجعة الآن</button>
                </div>
              </section>
            )}

            {/* ─── بطاقات المقاييس الرئيسية ───────────────────────────────── */}
            <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard title="أوردرات فاشلة الدورة"         value={failed}          subtitle="لا تحتسب"           icon={<XCircle size={22} />}        tone="red"    onClick={() => openOrderDrilldown('الأوردرات الفاشلة', fCycleOrders.filter(isFailed))} />
              <MetricCard title="فواتير مكررة الدورة"          value={duplicate}       subtitle="تحتاج تدقيق"        icon={<FileText size={22} />}       tone="red"    onClick={() => openOrderDrilldown('الفواتير المكررة', fCycleOrders.filter((o:any)=>o.is_duplicate_invoice||o.duplicate_warning))} />
              <MetricCard title="أوردرات ×1.5 تحت المراجعة"   value={onePointFive}    subtitle="انتظار الموافقة"     icon={<TrendingUp size={22} />}     tone="orange" onClick={() => openOrderDrilldown('أوردرات ×1.5', fCycleOrders.filter(isMultiplier))} />
              <MetricCard title="أوردرات تحت المراجعة"         value={review}          subtitle="تحتاج إجراء"        icon={<AlertTriangle size={22} />}  tone="orange" onClick={() => openOrderDrilldown('تحت المراجعة', fCycleOrders.filter(isReview))} />
              <MetricCard title="إجمالي أوردرات اليوم"         value={fOrdersToday.length}  subtitle="اضغط للتفاصيل" icon={<Package size={22} />}        tone="green"  onClick={() => openOrderDrilldown('أوردرات اليوم', fOrdersToday)} />
              <MetricCard title="إجمالي مشاوير اليوم"          value={fTripsToday.length}   subtitle="كل المشاوير"   icon={<Bike size={22} />}           tone="blue"   onClick={() => openTripDrilldown('مشاوير اليوم', fTripsToday)} />
              <MetricCard title="إجمالي أوردرات الدورة"        value={fCycleOrders.length}  subtitle={cycleLabel(period)} icon={<ClipboardCheck size={22}/>} tone="green" onClick={() => openOrderDrilldown('أوردرات الدورة', fCycleOrders)} />
              <MetricCard title="تم التسليم — الدورة"          value={delivered}       subtitle={`${fCycleOrders.length > 0 ? Math.round(delivered/fCycleOrders.length*100) : 0}% معدل تسليم`} icon={<CheckCircle2 size={22} />} tone="green" onClick={() => openOrderDrilldown('تم التسليم', fCycleOrders.filter(isDelivered))} />
            </section>

            {/* ─── الرسوم البيانية التفاعلية ──────────────────────────────── */}
            <section className="mb-5 grid gap-4 xl:grid-cols-4">
              <OrdersLineChart values={lineChartData} />
              <BranchBarChart rows={branchChartData} />
              <HourlyBarChart rows={hourlyChartData} />
              <DonutStatusChart delivered={delivered} review={review} failed={failed} duplicate={duplicate} />
            </section>

            {/* ─── أوردرات المراجعة + التنبيهات ───────────────────────────── */}
            <section className="mb-5 grid gap-4 xl:grid-cols-3">
              <ReviewTable orders={fCycleOrders} riders={riders} />
              <div className="grid gap-4">
                <AlertList duplicate={duplicate} failed={failed} multiplier={onePointFive} late={lateRiders} pendingActions={pendingExceptions} />
                {/* ملخص الخصومات والمكافآت — بيانات حقيقية */}
                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-base font-black text-[#061827]">ملخص الخصومات والمكافآت</h3>
                  <div className="space-y-3 text-sm font-black">
                    <div className="flex justify-between rounded-2xl bg-rose-50 p-3 text-rose-700">
                      <span>إجمالي الخصومات (الدورة)</span>
                      <span>{formatMoney(totalPenalties)}</span>
                    </div>
                    <div className="flex justify-between rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                      <span>إجمالي المكافآت (الدورة)</span>
                      <span>{formatMoney(totalRewards)}</span>
                    </div>
                    <div className="flex justify-between rounded-2xl bg-slate-50 p-3 text-slate-700">
                      <span>حوافز الشهرية (الأساسية)</span>
                      <span>{formatMoney(riders.reduce((s, r) => s + Number((r as any).monthly_incentive_base || 0), 0))}</span>
                    </div>
                  </div>
                  <button onClick={() => navigate('/admin/rider-actions')} className="mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">إدارة الخصومات والمكافآت</button>
                </div>
              </div>
            </section>

            {/* ─── الترتيب + جاهزية التشغيل ────────────────────────────────── */}
            <section className="mb-5 grid gap-4 xl:grid-cols-4">
              <RankingList riders={riderRows} />
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-base font-black text-[#061827]">جاهزية التشغيل</h3>
                <div className="space-y-3 text-sm font-black">
                  <ReadyRow label="النظام"             state="سليم"                         tone="green" />
                  <ReadyRow label="المندوبين النشطين"  state={`${riders.length} مندوب`}     tone="green" />
                  <ReadyRow label="الحضور"             state={lateRiders ? `${lateRiders} تحذير` : 'جيد'} tone={lateRiders ? 'orange' : 'green'} />
                  <ReadyRow label="المراجعة"           state={review ? `${review} معلق` : 'جيدة'} tone={review ? 'orange' : 'green'} />
                  <ReadyRow label="التنبيهات الحرجة"   state={failed + duplicate ? `${failed+duplicate} حرج` : 'جيد'} tone={failed + duplicate ? 'red' : 'green'} />
                </div>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm xl:col-span-2">
                <h3 className="mb-4 text-base font-black text-[#061827]">تقرير نهاية الدورة PDF</h3>
                <div className="grid grid-cols-2 gap-2 text-xs font-black text-slate-600">
                  {['أيام الحضور','ساعات الحضور','الخصومات','المكافآت','إجمالي الأوردرات','أوردرات ×1','أوردرات ×1.5','المشاوير','الفاشلة والخاطئة','المطابقة مع بي كونكت'].map(x =>
                    <div key={x} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2"><CheckCircle2 size={14} className="text-emerald-600" />{x}</div>
                  )}
                </div>
                <button onClick={() => navigate('/admin/reconciliation')} className="mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">إنشاء التقرير PDF</button>
              </div>
            </section>

            {/* ─── مراقبة البطارية (ثانوية — في الأسفل) ───────────────────── */}
            <section className="mb-5">
              <details className="group">
                <summary className="flex cursor-pointer items-center gap-3 rounded-3xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><BarChart3 size={18} /></span>
                  <span className="font-black text-[#061827]">مراقبة شحن بطاريات المندوبين</span>
                  <span className="mr-auto text-xs text-slate-400 group-open:hidden">اضغط للعرض</span>
                </summary>
                <div className="mt-3">
                  <RiderDeviceStatusTable rows={deviceRows} loading={loading} onRefresh={() => setRefreshKey(k => k + 1)} title="حالة الأجهزة والبطاريات" onNotify={sendBatteryNotification} />
                </div>
              </details>
            </section>

            {/* ─── Drilldown Modal ─────────────────────────────────────────────── */}
            {drilldown && (
              <DrilldownModal
                data={drilldown}
                riders={riders}
                onClose={() => setDrilldown(null)}
                onOpenFull={() => {
                  const q = drilldown.type === 'trips' ? '/admin/trips' : '/admin/reconciliation'
                  navigate(q)
                }}
              />
            )}
          </main>
        </div>
      </div>
    )

    function openOrderDrilldown(title: string, rows: DeliveryOrder[]) { setDrilldown({ title, type: 'orders', rows }) }
    function openTripDrilldown(title: string, rows: InternalTrip[])   { setDrilldown({ title, type: 'trips', rows }) }
  }

  function DrilldownModal({ data, riders, onClose, onOpenFull }: { data: Exclude<Drilldown, null>; riders: Rider[]; onClose: () => void; onOpenFull: () => void }) {
    const rows = data.rows.slice(0, 80)
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-3 backdrop-blur-sm lg:items-center" role="dialog" aria-modal="true">
        <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div>
              <p className="text-xs font-black text-emerald-600">تفاصيل فعلية من قاعدة البيانات</p>
              <h2 className="text-xl font-black text-[#061827]">{data.title}</h2>
              <p className="text-xs font-bold text-slate-400">عدد العناصر: {data.rows.length}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={onOpenFull} className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-black text-white"><Eye size={16} className="ml-1 inline" />فتح الصفحة الكاملة</button>
              <button onClick={onClose} className="rounded-2xl border px-4 py-2 text-sm font-black text-slate-600">إغلاق</button>
            </div>
          </div>
          <div className="max-h-[65vh] overflow-auto p-5">
            {data.type === 'orders' && (
              <div className="grid gap-3">
                {rows.length ? rows.map((o: any) => {
                  const rider = riders.find(r => r.id === o.rider_id)
                  return (
                    <div key={o.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-400">فاتورة / أوردر</p>
                          <p className="text-lg font-black text-[#061827]">{o.invoice_no || o.invoice_number || o.order_no || 'بدون رقم'}</p>
                        </div>
                        <StatusBadges order={o} />
                      </div>
                      <div className="mt-3 grid gap-2 text-sm font-bold text-slate-600 md:grid-cols-4">
                        <p>العميل: <b>{o.customer_name || o.customer_name_snapshot || '—'}</b></p>
                        <p>الكود: <b>{o.customer_code || o.customer_code_snapshot || '—'}</b></p>
                        <p>المندوب: <b>{o.rider_name || rider?.name || o.driver_name || 'غير مربوط'}</b></p>
                        <p>الحالة: <b>{o.final_count_status || o.review_status || o.status || '—'}</b></p>
                      </div>
                    </div>
                  )
                }) : <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-black text-slate-400">لا توجد بيانات في هذا القسم</div>}
              </div>
            )}
            {data.type === 'trips' && (
              <div className="grid gap-3">
                {rows.length ? rows.map((t: any) => (
                  <div key={t.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-lg font-black text-[#061827]">{t.from_label || 'من'} ← {t.to_label || 'إلى'}</p>
                    <div className="mt-2 grid gap-2 text-sm font-bold text-slate-600 md:grid-cols-4">
                      <p>النوع: <b>{TRIP_TYPE_LABELS[(t.trip_type || 'other') as keyof typeof TRIP_TYPE_LABELS] || t.trip_type}</b></p>
                      <p>الحالة: <b>{TRIP_STATUS_LABELS[(t.status || 'pending_approval') as keyof typeof TRIP_STATUS_LABELS] || t.status}</b></p>
                      <p>إثبات: <b>{t.invoice_ref || t.proof_reference || '—'}</b></p>
                      <p>التاريخ: <b>{t.trip_date || String(t.created_at || '').slice(0,10)}</b></p>
                    </div>
                  </div>
                )) : <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-black text-slate-400">لا توجد مشاوير</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  function ReadyRow({ label, state, tone }: { label: string; state: string; tone: 'green' | 'orange' | 'red' }) {
    const cls = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'orange' ? 'bg-orange-50 text-orange-700' : 'bg-rose-50 text-rose-700'
    return <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><span>{label}</span><span className={`rounded-full px-3 py-1 text-xs ${cls}`}>{state}</span></div>
  }
  