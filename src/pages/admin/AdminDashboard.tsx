import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bike,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Gift,
  Home,
  LogOut,
  Package,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Eye,
  Store,
  TrendingUp,
  Users,
  UploadCloud,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { getCurrentSession, getRiderSession, getUserProfile, logout } from '../../lib/auth'
import { getAdminStats, getRiderScheduleExceptions } from '../../lib/delivery'
import { formatMoney, getOperationalPeriod, wildcardMatchText, TRIP_TYPE_LABELS, TRIP_STATUS_LABELS } from '../../lib/helpers'
import { DeliveryOrder, InternalTrip, Rider } from '../../lib/types'
import { CANONICAL_BRANCHES, displayBranchName } from '../../lib/branchUtils'
import { supabase } from '../../lib/supabase'
import RiderDeviceStatusTable, { type RiderDeviceStatusRow } from '../../components/RiderDeviceStatusTable'
import { isBranchScopedRole } from '../../lib/permissions'

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
  green: { icon: 'bg-emerald-50 text-emerald-600', accent: 'text-emerald-600', ring: 'hover:border-emerald-200' },
  blue: { icon: 'bg-sky-50 text-sky-600', accent: 'text-sky-600', ring: 'hover:border-sky-200' },
  orange: { icon: 'bg-orange-50 text-orange-600', accent: 'text-orange-600', ring: 'hover:border-orange-200' },
  red: { icon: 'bg-rose-50 text-rose-600', accent: 'text-rose-600', ring: 'hover:border-rose-200' },
  purple: { icon: 'bg-purple-50 text-purple-600', accent: 'text-purple-600', ring: 'hover:border-purple-200' },
  slate: { icon: 'bg-slate-100 text-slate-600', accent: 'text-slate-600', ring: 'hover:border-slate-200' }
}

function getOrderDate(order: any): string {
  return order?.delivery_date || (order?.registered_at || order?.created_at || '').slice(0, 10)
}

function getTripDate(trip: any): string {
  return trip?.trip_date || (trip?.registered_at || trip?.created_at || '').slice(0, 10)
}

function isDeleted(row: any) {
  return Boolean(row?.deleted_at)
}

function isDelivered(order: any) {
  return ['delivered', 'تم التسليم'].includes(String(order?.status || '').toLowerCase()) || Boolean(order?.delivered_at)
}

function isFailed(order: any) {
  const status = String(order?.status || '').toLowerCase()
  return status.includes('fail') || status === 'failed' || Boolean(order?.failed_at) || Boolean(order?.failed_reason)
}

function isReview(order: any) {
  return Boolean(order?.needs_review) || ['pending', 'needs_review', 'registered'].includes(String(order?.review_status || order?.status || '').toLowerCase())
}

function isMultiplier(order: any) {
  return Number(order?.order_multiplier ?? (order?.is_multiplier_order ? 1.5 : 1)) >= 1.5
}

function cycleLabel(period: { start: string; end: string }) {
  return `${period.start} → ${period.end}`
}

function daysBetween(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T00:00:00`)
  const end = new Date(`${endIso}T00:00:00`)
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000)
  return Array.from({ length: Math.max(1, diff + 1) }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

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

function SideBar({ items, onLogout }: { items: NavItem[]; onLogout: () => void }) {
  return (
    <aside className="hidden w-[260px] shrink-0 border-l border-slate-100 bg-white p-5 lg:flex lg:flex-col">
      <div className="mb-8 flex items-center gap-3">
        <img src="/logo.png" className="h-12 w-12 rounded-2xl border object-contain p-1 shadow-sm" alt="Dawaa" />
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
            <p className="font-black text-[#061827]">المدير التنفيذي</p>
            <p className="text-xs text-slate-400">dr.moaz</p>
          </div>
        </div>
        <button onClick={onLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-100">
          <LogOut size={16} /> تسجيل خروج
        </button>
      </div>
    </aside>
  )
}

function MiniBarChart({ title, rows, tone = 'green' }: { title: string; rows: { label: string; value: number }[]; tone?: 'green' | 'red' | 'blue' | 'orange' }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  const barClass = tone === 'red' ? 'bg-rose-500' : tone === 'blue' ? 'bg-sky-500' : tone === 'orange' ? 'bg-orange-500' : 'bg-emerald-500'
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-5 text-base font-black text-[#061827]">{title}</h3>
      {rows.length ? (
        <div className="flex h-48 items-end gap-3 border-b border-slate-100 px-2 pb-3">
          {rows.map(row => (
            <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="text-xs font-black text-slate-600">{row.value}</span>
              <div className="flex h-32 w-full items-end rounded-t-2xl bg-slate-50">
                <div className={`w-full rounded-t-2xl ${barClass}`} style={{ height: `${Math.max(6, Math.round(row.value / max * 100))}%` }} />
              </div>
              <span className="w-full truncate text-center text-[11px] font-bold text-slate-400">{row.label}</span>
            </div>
          ))}
        </div>
      ) : <EmptyLine text="لا توجد بيانات كافية" />}
    </div>
  )
}

function LineChartCard({ title, values }: { title: string; values: { label: string; value: number }[] }) {
  const max = Math.max(1, ...values.map(v => v.value))
  const points = values.map((v, i) => {
    const x = values.length <= 1 ? 50 : (i / (values.length - 1)) * 100
    const y = 100 - (v.value / max) * 80 - 10
    return `${x},${y}`
  }).join(' ')
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-base font-black text-[#061827]">{title}</h3>
      <div className="relative h-56 rounded-3xl bg-gradient-to-b from-emerald-50/70 to-white p-4">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
          <polyline points={points} fill="none" stroke="#059669" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {values.map((v, i) => {
            const x = values.length <= 1 ? 50 : (i / (values.length - 1)) * 100
            const y = 100 - (v.value / max) * 80 - 10
            return <circle key={v.label} cx={x} cy={y} r="1.7" fill="#059669" />
          })}
        </svg>
        <div className="absolute inset-x-4 bottom-3 flex justify-between text-[10px] font-bold text-slate-400">
          {values.map(v => <span key={v.label}>{v.label}</span>)}
        </div>
      </div>
    </div>
  )
}

function DonutStatus({ delivered, review, failed, duplicate }: { delivered: number; review: number; failed: number; duplicate: number }) {
  const total = Math.max(1, delivered + review + failed + duplicate)
  const green = delivered / total * 100
  const orange = review / total * 100
  const red = failed / total * 100
  const purple = duplicate / total * 100
  const bg = `conic-gradient(#10b981 0 ${green}%, #f59e0b ${green}% ${green + orange}%, #ef4444 ${green + orange}% ${green + orange + red}%, #8b5cf6 ${green + orange + red}% ${green + orange + red + purple}%, #e5e7eb 0)`
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-base font-black text-[#061827]">حالات الأوردرات</h3>
      <div className="flex items-center justify-center gap-6">
        <div className="relative h-36 w-36 rounded-full" style={{ background: bg }}>
          <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white">
            <span className="text-xs font-bold text-slate-400">الإجمالي</span>
            <span className="text-2xl font-black text-[#061827]">{total}</span>
          </div>
        </div>
        <div className="space-y-2 text-sm font-bold text-slate-600">
          <Legend color="bg-emerald-500" label="تم التسليم" value={delivered} />
          <Legend color="bg-amber-500" label="تحت المراجعة" value={review} />
          <Legend color="bg-rose-500" label="فاشل" value={failed} />
          <Legend color="bg-purple-500" label="مكرر" value={duplicate} />
        </div>
      </div>
    </div>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${color}`} /><span>{label}</span><span className="text-[#061827]">{value}</span></div>
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
                  <td className="p-3"><div className="flex gap-2"><button className="rounded-xl border border-emerald-200 px-3 py-1 text-xs font-black text-emerald-700">موافقة</button><button className="rounded-xl border border-sky-200 px-3 py-1 text-xs font-black text-sky-700">تحويل</button><button className="rounded-xl border border-rose-200 px-3 py-1 text-xs font-black text-rose-700">استبعاد</button></div></td>
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
  if (isFailed(order)) badges.push({ text: 'فاشل', cls: 'bg-rose-50 text-rose-700' })
  if (order?.is_duplicate_invoice) badges.push({ text: 'مكرر', cls: 'bg-amber-50 text-amber-700' })
  if (isMultiplier(order)) badges.push({ text: '×1.5', cls: 'bg-orange-50 text-orange-700' })
  if (isReview(order)) badges.push({ text: 'مراجعة', cls: 'bg-sky-50 text-sky-700' })
  if (!badges.length) badges.push({ text: 'عادي', cls: 'bg-slate-100 text-slate-600' })
  return <div className="flex flex-wrap gap-1">{badges.map(b => <span key={b.text} className={`rounded-full px-2 py-1 text-[11px] font-black ${b.cls}`}>{b.text}</span>)}</div>
}

function AlertList({ duplicate, failed, multiplier, late, pendingActions }: { duplicate: number; failed: number; multiplier: number; late: number; pendingActions: number }) {
  const alerts = [
    { icon: <FileText size={18} />, title: 'فواتير مكررة بحاجة لتدقيق', sub: `${duplicate} فاتورة مكررة`, tone: 'text-rose-600 bg-rose-50' },
    { icon: <XCircle size={18} />, title: 'أوردرات فاشلة لا تحتسب', sub: `${failed} أوردر فاشل`, tone: 'text-rose-600 bg-rose-50' },
    { icon: <TrendingUp size={18} />, title: 'طلبات ×1.5 تنتظر الموافقة', sub: `${multiplier} طلب تحت المراجعة`, tone: 'text-orange-600 bg-orange-50' },
    { icon: <Clock3 size={18} />, title: 'مشاكل في الحضور', sub: `${late} تأخير/حضور ناقص`, tone: 'text-amber-600 bg-amber-50' },
    { icon: <Gift size={18} />, title: 'خصومات ومكافآت تحت المراجعة', sub: `${pendingActions} موقف`, tone: 'text-purple-600 bg-purple-50' }
  ]
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-base font-black text-[#061827]">أهم التنبيهات</h3>
      <div className="space-y-2">
        {alerts.map((a) => (
          <div key={a.title} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.tone}`}>{a.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-black text-[#061827]">{a.title}</p>
              <p className="text-xs font-bold text-slate-400">{a.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

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
  const [, setLastUpdated] = useState<Date | null>(null)
  const [drilldown, setDrilldown] = useState<Drilldown>(null)
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
      } else {
        const session = await getCurrentSession()
        const profile = session?.user?.id ? await getUserProfile(session.user.id) : null
        if (isBranchScopedRole(profile?.role)) branchScopeId = profile?.branch_id || null
      }
      if (branchScopeId && !branchScopeName) {
        const { data: b } = await supabase.from('branches').select('name, display_name').eq('id', branchScopeId).maybeSingle()
        branchScopeName = (b as any)?.display_name || (b as any)?.name || null
      }
      setLockedBranchId(branchScopeId)
      setLockedBranchName(branchScopeName)
      if (branchScopeId) setBranch(branchScopeId)
      const [s, exceptions, devices] = await Promise.all([
        getAdminStats(branchScopeId),
        getRiderScheduleExceptions(),
        branchScopeId
          ? supabase.from('rider_device_status').select('*').eq('branch_id', branchScopeId).order('last_seen_at', { ascending: false })
          : supabase.from('rider_device_status').select('*').order('last_seen_at', { ascending: false })
      ])
      setStats(s)
      setLastUpdated(new Date())
      setDeviceRows(((devices as any).data || []) as RiderDeviceStatusRow[])
      setPendingExceptions(exceptions.filter((e: any) => e.status === 'pending' && (!branchScopeId || e.branch_id === branchScopeId)).length)
    } catch (error) {
      toast.error('حصلت مشكلة في تحميل لوحة الإدارة')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadStats() }, [refreshKey])

  useEffect(() => {
    const channel = supabase
      .channel(`admin-dashboard-orders-${lockedBranchId || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_orders', ...(lockedBranchId ? { filter: `branch_id=eq.${lockedBranchId}` } : {}) },
        () => setRefreshKey(k => k + 1)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internal_trips', ...(lockedBranchId ? { filter: `branch_id=eq.${lockedBranchId}` } : {}) },
        () => setRefreshKey(k => k + 1)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [lockedBranchId])

  async function sendBatteryNotification(row: RiderDeviceStatusRow) {
    try {
      const message = row.battery_supported
        ? `تنبيه من الإدارة: بطارية جهازك الآن ${row.battery_percent ?? 'غير معروف'}%${row.is_charging ? ' والجهاز على الشاحن' : ' والجهاز ليس على الشاحن'}. برجاء الحفاظ على شحن الجهاز أثناء الشيفت.`
        : 'تنبيه من الإدارة: برجاء التأكد من شحن الهاتف وفتح التطبيق أثناء الشيفت.'

      const { error } = await supabase.rpc('create_rider_notification', {
        p_rider_id: row.rider_id,
        p_title: 'تنبيه مهم بخصوص شحن الهاتف',
        p_message: message,
        p_notification_type: 'battery_warning',
        p_severity: row.warning_level === 'critical' ? 'danger' : 'warning',
        p_reference_table: 'rider_device_status',
        p_reference_id: row.id || null,
        p_metadata: {
          battery_percent: row.battery_percent,
          is_charging: row.is_charging,
          online: row.online,
          source: 'admin_dashboard'
        }
      })
      if (error) throw error
      toast.success(`تم إرسال التنبيه إلى ${row.rider_name || 'الدليفري'}`)
    } catch (e: any) {
      toast.error(e?.message || 'فشل إرسال التنبيه')
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const riders = (stats?.riders ?? []).filter(Boolean) as Rider[]
  const ordersToday = (stats?.orders ?? []).filter((o: any) => o && !isDeleted(o)) as DeliveryOrder[]
  const tripsToday = (stats?.trips ?? []).filter(Boolean) as InternalTrip[]
  const cycleOrders = ((stats as any)?.cycleOrders ?? []).filter((o: any) => o && !isDeleted(o)) as DeliveryOrder[]
  const cycleTrips = ((stats as any)?.cycleTrips ?? []).filter(Boolean) as InternalTrip[]
  const attendance = (stats?.attendance ?? []).filter(Boolean) as any[]
  const branchOptions = useMemo(() => {
    // التطبيق الرسمي يعمل على فرعين فقط: فرع الشامي وفرع شكري
    if (lockedBranchId) return [lockedBranchName || lockedBranchId]
    return CANONICAL_BRANCHES
  }, [lockedBranchId, lockedBranchName])

  function riderBranch(rider?: Rider) {
    return displayBranchName((rider as any)?.branch_name || (rider as any)?.branch || rider?.branch_id)
  }

  function filterByBranch<T extends any>(rows: T[], dateGetter?: (row: T) => string) {
    return rows.filter((row: any) => {
      const rider = riders.find(r => r.id === row.rider_id)
      const rowBranch = displayBranchName(row.branch_name || row.branch || riderBranch(rider))
      const branchOk = lockedBranchId
        ? row.branch_id === lockedBranchId || rowBranch === lockedBranchName
        : branch === 'all' || rowBranch === branch || row.branch_id === branch
      const searchOk = !search.trim() || [row.customer_name, row.customer_name_snapshot, row.invoice_no, row.invoice_number, row.order_no, row.rider_name, row.driver_name, rider?.name, rider?.username].some(v => wildcardMatchText(String(v || ''), search))
      const dateOk = dateGetter ? Boolean(dateGetter(row)) : true
      return branchOk && searchOk && dateOk
    })
  }

  const fOrdersToday = filterByBranch(ordersToday, getOrderDate)
  const fTripsToday = filterByBranch(tripsToday, getTripDate)
  const fCycleOrders = filterByBranch(cycleOrders, getOrderDate)
  const fCycleTrips = filterByBranch(cycleTrips, getTripDate)

  const delivered = fCycleOrders.filter(isDelivered).length
  const failed = fCycleOrders.filter(isFailed).length
  const duplicate = fCycleOrders.filter((o: any) => o.is_duplicate_invoice || o.duplicate_warning).length
  const review = fCycleOrders.filter(isReview).length
  const onePointFive = fCycleOrders.filter(isMultiplier).length
  const deleted = fCycleOrders.filter(isDeleted).length
  const failedToday = fOrdersToday.filter(isFailed).length
  const multiplierToday = fOrdersToday.filter(isMultiplier).length
  const duplicateToday = fOrdersToday.filter((o: any) => o.is_duplicate_invoice || o.duplicate_warning).length
  const lateRiders = attendance.filter(a => Number(a.late_minutes || 0) > 0).length

  const riderRows = riders.map(r => {
    const orders = fCycleOrders.filter(o => o.rider_id === r.id)
    const trips = fCycleTrips.filter(t => t.rider_id === r.id)
    return { id: r.id, name: r.name, branch: riderBranch(r), orders: orders.length, trips: trips.length, failed: orders.filter(isFailed).length, multiplier: orders.filter(isMultiplier).length }
  }).sort((a, b) => b.orders - a.orders)

  const branchRows = useMemo(() => {
    const map = new Map<string, { label: string; value: number }>()
    fCycleOrders.forEach((o: any) => {
      const rider = riders.find(r => r.id === o.rider_id)
      const label = displayBranchName(o.branch_name || o.branch || riderBranch(rider))
      map.set(label, { label, value: (map.get(label)?.value || 0) + 1 })
    })
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 6)
  }, [fCycleOrders, riders])

  const hourlyRows = useMemo(() => {
    const hours = [8, 10, 12, 14, 16, 18, 20, 22]
    return hours.map(h => ({ label: `${String(h).padStart(2, '0')}:00`, value: fCycleOrders.filter((o: any) => {
      const d = new Date(o.registered_at || o.created_at || o.delivery_date)
      return !Number.isNaN(d.getTime()) && d.getHours() >= h && d.getHours() < h + 2
    }).length }))
  }, [fCycleOrders])

  const lineRows = useMemo(() => {
    const dates = daysBetween(period.start, period.end)
    const sample = dates.filter((_, i) => i % Math.max(1, Math.floor(dates.length / 7)) === 0).slice(-8)
    return sample.map(d => ({ label: d.slice(5), value: fCycleOrders.filter(o => getOrderDate(o) === d).length }))
  }, [fCycleOrders, period])

  const failureRows = [
    { label: 'فاتورة مكررة', value: duplicate },
    { label: 'عنوان غير صحيح', value: fCycleOrders.filter((o: any) => String(o.failed_reason || o.review_reason || '').includes('عنوان')).length },
    { label: 'فشل تسليم', value: failed },
    { label: 'بدون إثبات', value: fCycleTrips.filter((t: any) => !t.has_invoice_reference).length },
    { label: 'محذوفة', value: deleted }
  ]


  function openOrderDrilldown(title: string, rows: DeliveryOrder[]) {
    setDrilldown({ title, type: 'orders', rows })
  }

  function openTripDrilldown(title: string, rows: InternalTrip[]) {
    setDrilldown({ title, type: 'trips', rows })
  }

  function openAlertDrilldown(title: string) {
    const rows = [
      ...fCycleOrders.filter((o: any) => isFailed(o) || o.is_duplicate_invoice || o.duplicate_warning || isMultiplier(o) || isReview(o)).map((o: any) => ({ kind: 'order', title: o.invoice_no || o.invoice_number || o.order_no || 'أوردر بدون رقم', subtitle: o.customer_name || o.customer_name_snapshot || 'عميل غير محدد', tone: isFailed(o) ? 'فشل' : o.is_duplicate_invoice || o.duplicate_warning ? 'تكرار' : isMultiplier(o) ? '×1.5' : 'مراجعة' })),
      ...attendance.filter(a => Number(a.late_minutes || 0) > 0).map((a: any) => ({ kind: 'attendance', title: a.rider_name || 'حضور', subtitle: `${a.work_date || ''} — تأخير ${a.late_minutes || 0} دقيقة`, tone: 'حضور' }))
    ]
    setDrilldown({ title, type: 'alerts', rows })
  }

  const navItems: NavItem[] = [
    { label: 'الرئيسية', icon: <Home size={18} />, path: '/admin', active: true },
    { label: 'غرفة التحكم', icon: <BarChart3 size={18} />, path: '/admin/executive' },
    { label: 'إدارة الدليفري', icon: <Bike size={18} />, path: '/admin/riders' },
    { label: 'حسابات الدليفري', icon: <ShieldCheck size={18} />, path: '/admin/rider-accounts' },
    { label: 'لوحة مدير الفرع', icon: <Store size={18} />, path: '/admin/branch' },
    { label: 'الأوردرات', icon: <ClipboardList size={18} />, path: '/admin/reconciliation', badge: review },
    { label: 'المشاوير', icon: <Route size={18} />, path: '/admin/trips' },
    { label: 'المطابقة', icon: <ShieldCheck size={18} />, path: '/admin/reconciliation' },
    { label: 'رفع العملاء', icon: <UploadCloud size={18} />, path: '/admin/customer-import' },
    { label: 'تحليل العملاء', icon: <TrendingUp size={18} />, path: '/admin/customer-analytics' },
    { label: 'الحضور', icon: <Users size={18} />, path: '/admin/rider-schedules' },
    { label: 'الخصومات والمكافآت', icon: <Gift size={18} />, path: '/admin/rider-actions', badge: pendingExceptions },
    { label: 'التنبيهات', icon: <Bell size={18} />, path: '/admin/rider-actions', badge: failed + duplicate + review },
    { label: 'السياسات', icon: <FileCheck2 size={18} />, path: '/admin/rider-actions' },
    { label: 'التقارير', icon: <BarChart3 size={18} />, path: '/admin/reconciliation' }
  ]

  return (
    <div dir="rtl" className="min-h-screen bg-[#f5f8f9] text-[#061827]">
      <div className="flex min-h-screen">
        <SideBar items={navItems} onLogout={handleLogout} />
        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <header className="mb-5 flex flex-col gap-3 rounded-[2rem] border border-white bg-white/90 p-4 shadow-sm backdrop-blur lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-emerald-600">لوحة إدارة الدليفري</p>
              <h1 className="mt-1 text-2xl font-black lg:text-3xl">التحكم التشغيلي والمراجعة الذكية</h1>
              <p className="mt-1 text-xs font-bold text-slate-400">الدورة الحالية: {cycleLabel(period)} • آخر تحديث مباشر</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => navigate('/admin/reconciliation')} className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-700">
                <Download size={18} /> تقرير PDF
              </button>
              <button onClick={() => setRefreshKey(k => k + 1)} className="rounded-2xl border bg-white p-3 text-slate-600 hover:bg-slate-50" disabled={loading}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
              <button onClick={handleLogout} className="rounded-2xl border bg-white p-3 text-slate-600 hover:bg-slate-50"><LogOut size={18} /></button>
            </div>
          </header>

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

          <RiderDeviceStatusTable
            rows={deviceRows}
            loading={loading}
            onRefresh={() => setRefreshKey(k => k + 1)}
            title="مراقبة شحن بطاريات كل الدليفري"
            onNotify={sendBatteryNotification}
          />

          <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard title="إجمالي أوردرات اليوم" value={fOrdersToday.length} subtitle="اضغط للتفاصيل" icon={<Package size={22} />} onClick={() => openOrderDrilldown('إجمالي أوردرات اليوم', fOrdersToday)} />
            <MetricCard title="إجمالي مشاوير اليوم" value={fTripsToday.length} subtitle="كل المشاوير" icon={<Bike size={22} />} tone="blue" onClick={() => openTripDrilldown('إجمالي مشاوير اليوم', fTripsToday)} />
            <MetricCard title="إجمالي أوردرات الدورة" value={fCycleOrders.length} subtitle="من 26 إلى 25" icon={<ClipboardCheck size={22} />} tone="green" onClick={() => openOrderDrilldown('إجمالي أوردرات الدورة', fCycleOrders)} />
            <MetricCard title="إجمالي مشاوير الدورة" value={fCycleTrips.length} subtitle="تشغيل داخلي" icon={<Route size={22} />} tone="blue" onClick={() => openTripDrilldown('إجمالي مشاوير الدورة', fCycleTrips)} />
            <MetricCard title="أوردرات ×1.5 تحت المراجعة" value={onePointFive} subtitle="لا تحتسب إلا بعد الموافقة" icon={<TrendingUp size={22} />} tone="orange" onClick={() => openOrderDrilldown('أوردرات ×1.5 تحت المراجعة', fCycleOrders.filter(isMultiplier))} />
            <MetricCard title="فواتير مكررة" value={duplicate} subtitle="تحتاج تدقيق" icon={<FileText size={22} />} tone="red" onClick={() => openOrderDrilldown('الفواتير المكررة', fCycleOrders.filter((o:any)=>o.is_duplicate_invoice || o.duplicate_warning))} />
            <MetricCard title="أوردرات فاشلة" value={failed} subtitle="لا تحتسب" icon={<XCircle size={22} />} tone="red" onClick={() => openOrderDrilldown('الأوردرات الفاشلة لا تحتسب', fCycleOrders.filter(isFailed))} />
            <MetricCard title="تنبيهات حرجة" value={failedToday + duplicateToday + multiplierToday + lateRiders} subtitle="تحتاج إجراء" icon={<AlertTriangle size={22} />} tone="red" onClick={() => openAlertDrilldown('التنبيهات الحرجة')} />
          </section>

          <section className="mb-5 grid gap-4 xl:grid-cols-4">
            <LineChartCard title="تطور الأوردرات خلال الدورة" values={lineRows} />
            <MiniBarChart title="الأوردرات حسب الفرع" rows={branchRows} />
            <MiniBarChart title="أوقات الذروة" rows={hourlyRows} tone="blue" />
            <DonutStatus delivered={delivered} review={review} failed={failed} duplicate={duplicate} />
          </section>

          <section className="mb-5 grid gap-4 xl:grid-cols-3">
            <ReviewTable orders={fCycleOrders} riders={riders} />
            <div className="grid gap-4">
              <AlertList duplicate={duplicate} failed={failed} multiplier={onePointFive} late={lateRiders} pendingActions={pendingExceptions} />
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-base font-black text-[#061827]">تقرير نهاية الدورة PDF</h3>
                <div className="grid grid-cols-2 gap-2 text-xs font-black text-slate-600">
                  {['أيام الحضور', 'ساعات الحضور', 'الخصومات', 'المكافآت', 'إجمالي الأوردرات', 'أوردرات ×1', 'أوردرات ×1.5', 'المشاوير', 'الفاشلة والخاطئة', 'المطابقة مع بي كونكت'].map(x => <div key={x} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2"><CheckCircle2 size={14} className="text-emerald-600" />{x}</div>)}
                </div>
                <button onClick={() => navigate('/admin/reconciliation')} className="mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">إنشاء التقرير PDF</button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-4">
            <MiniBarChart title="أكثر أسباب الفشل" rows={failureRows} tone="red" />
            <RankingList riders={riderRows} />
            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-base font-black text-[#061827]">ملخص الخصومات والمكافآت</h3>
              <div className="space-y-3 text-sm font-black">
                <div className="flex justify-between rounded-2xl bg-rose-50 p-3 text-rose-700"><span>إجمالي الخصومات</span><span>{formatMoney(0)}</span></div>
                <div className="flex justify-between rounded-2xl bg-emerald-50 p-3 text-emerald-700"><span>إجمالي المكافآت</span><span>{formatMoney(0)}</span></div>
                <div className="flex justify-between rounded-2xl bg-slate-50 p-3 text-slate-700"><span>حوافز البداية</span><span>{formatMoney(riders.reduce((s, r) => s + Number((r as any).monthly_incentive_base || 0), 0))}</span></div>
              </div>
              <button onClick={() => navigate('/admin/rider-actions')} className="mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">إدارة الخصومات والمكافآت</button>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-base font-black text-[#061827]">جاهزية التشغيل</h3>
              <div className="space-y-3 text-sm font-black">
                <ReadyRow label="النظام" state="سليم" tone="green" />
                <ReadyRow label="المندوبين النشطين" state={`${riders.length}`} tone="green" />
                <ReadyRow label="الحضور" state={lateRiders ? 'تحذير' : 'جيد'} tone={lateRiders ? 'orange' : 'green'} />
                <ReadyRow label="المراجعة" state={review ? 'تحتاج متابعة' : 'جيدة'} tone={review ? 'orange' : 'green'} />
                <ReadyRow label="التنبيهات" state={failed + duplicate ? 'حرج' : 'جيد'} tone={failed + duplicate ? 'red' : 'green'} />
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <QuickAction label="غرفة التحكم التنفيذية" value="مخاطر وحوافز" icon={<BarChart3 size={18} />} path="/admin/executive" />
            <QuickAction label="اعتماد طلبات ×1.5" value={`${onePointFive} طلب`} icon={<TrendingUp size={18} />} path="/admin/reconciliation" />
            <QuickAction label="تحويل أوردر لمشوار" value="من المراجعة" icon={<Route size={18} />} path="/admin/reconciliation" />
            <QuickAction label="السياسات والتنبيهات" value="بنود الدليفري" icon={<Bell size={18} />} path="/admin/rider-actions" />
            <QuickAction label="تجربة تطبيق الموبايل" value="PWA" icon={<Home size={18} />} path="/rider" />
          </section>

          {drilldown && (
            <DrilldownModal
              data={drilldown}
              riders={riders}
              onClose={() => setDrilldown(null)}
              onOpenFull={() => {
                const q = drilldown.type === 'trips' ? '/admin/trips' : drilldown.title.includes('×1.5') ? '/admin/reconciliation?filter=multiplier' : drilldown.title.includes('مكررة') ? '/admin/reconciliation?filter=duplicate' : drilldown.title.includes('فاشلة') ? '/admin/reconciliation?filter=failed' : '/admin/reconciliation'
                navigate(q)
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
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
              }) : <EmptyLine text="لا توجد بيانات في هذا القسم" />}
            </div>
          )}
          {data.type === 'trips' && (
            <div className="grid gap-3">
              {rows.length ? rows.map((t: any) => (
                <div key={t.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-lg font-black text-[#061827]">{t.from_label || t.from_branch_name || 'من'} ← {t.to_label || t.to_branch_name || 'إلى'}</p>
                  <div className="mt-2 grid gap-2 text-sm font-bold text-slate-600 md:grid-cols-4"><p>النوع: <b>{TRIP_TYPE_LABELS[(t.trip_type || 'other') as keyof typeof TRIP_TYPE_LABELS] || t.trip_type}</b></p><p>الحالة: <b>{TRIP_STATUS_LABELS[(t.status || 'pending_approval') as keyof typeof TRIP_STATUS_LABELS] || t.status}</b></p><p>إثبات: <b>{t.invoice_ref || t.proof_reference || '—'}</b></p><p>التاريخ: <b>{t.trip_date || String(t.created_at || '').slice(0,10)}</b></p></div>
                </div>
              )) : <EmptyLine text="لا توجد مشاوير" />}
            </div>
          )}
          {data.type === 'alerts' && (
            <div className="grid gap-3">
              {rows.length ? rows.map((a: any, idx: number) => <div key={idx} className="flex items-center justify-between rounded-3xl border border-slate-100 bg-slate-50 p-4"><div><p className="font-black text-[#061827]">{a.title}</p><p className="text-sm font-bold text-slate-400">{a.subtitle}</p></div><span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">{a.tone}</span></div>) : <EmptyLine text="لا توجد تنبيهات حرجة" />}
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

function QuickAction({ label, value, icon, path }: { label: string; value: string; icon: React.ReactNode; path: string }) {
  return <button onClick={() => (window.location.href = path)} className="flex items-center gap-3 rounded-3xl border border-slate-100 bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">{icon}</span><span className="flex-1"><span className="block font-black text-[#061827]">{label}</span><span className="text-xs font-bold text-slate-400">{value}</span></span></button>
}
