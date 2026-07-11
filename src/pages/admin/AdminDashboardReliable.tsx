import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  FileWarning,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { getCurrentSession, getRiderSession, getUserProfile } from '../../lib/auth'
import { displayBranchName } from '../../lib/branchUtils'
import { fetchAllRows, type QueryFilter } from '../../lib/fetchAllRows'
import { formatDateTime, getOperationalPeriod, wildcardMatchText } from '../../lib/helpers'
import { isBranchScopedRole } from '../../lib/permissions'
import { supabase } from '../../lib/supabase'

const todayIso = () => new Date().toISOString().slice(0, 10)
const number = (value: unknown) => Number(value || 0) || 0
const dateOf = (row: any) => String(row.delivery_date || row.work_date || row.registered_at || row.created_at || '').slice(0, 10)
const isDelivered = (row: any) => String(row.status || '').toLowerCase() === 'delivered' || Boolean(row.delivered_at)
const isFailed = (row: any) => String(row.status || '').toLowerCase() === 'failed' || Boolean(row.failed_reason)
const isClosed = (row: any) => isDelivered(row) || isFailed(row) || String(row.status || '').toLowerCase() === 'cancelled'
const orderAgeMinutes = (row: any) => {
  const timestamp = row.registered_at || row.created_at
  if (!timestamp) return 0
  const parsed = new Date(timestamp).getTime()
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((Date.now() - parsed) / 60000)) : 0
}
const orderBranch = (row: any, rider?: any) => displayBranchName(row.branch_name || rider?.branch_name || row.branch_id || rider?.branch_id || 'غير محدد')
const customerName = (row: any) => String(row.customer_name_snapshot || row.customer_name || 'عميل غير محدد')
const customerCode = (row: any) => String(row.customer_code_snapshot || row.customer_code || '')
const invoiceNumber = (row: any) => String(row.invoice_number || row.invoice_no || '')

function StatCard({ title, value, hint, icon, tone = 'emerald', onClick }: {
  title: string
  value: string | number
  hint: string
  icon: React.ReactNode
  tone?: 'emerald' | 'sky' | 'amber' | 'rose' | 'violet'
  onClick?: () => void
}) {
  const toneClass = {
    emerald: 'bg-emerald-50 text-emerald-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    violet: 'bg-violet-50 text-violet-700',
  }[tone]

  return (
    <button type="button" onClick={onClick} className="w-full rounded-[1.7rem] border border-slate-100 bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-black text-[#102a32]">{value}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClass}`}>{icon}</span>
      </div>
      <p className="mt-3 border-t border-slate-50 pt-3 text-[11px] font-bold text-slate-400">{hint}</p>
    </button>
  )
}

function PriorityCard({ title, value, detail, action, tone, onClick }: {
  title: string
  value: number
  detail: string
  action: string
  tone: 'rose' | 'amber' | 'sky' | 'emerald'
  onClick: () => void
}) {
  const toneClass = {
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    sky: 'border-sky-100 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  }[tone]

  return (
    <button type="button" onClick={onClick} className={`rounded-[1.5rem] border p-4 text-right shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${toneClass}`}>
      <div className="flex items-center justify-between gap-3"><b>{title}</b><span className="text-2xl font-black">{value.toLocaleString('ar-EG')}</span></div>
      <p className="mt-2 min-h-10 text-xs font-bold text-slate-500">{detail}</p>
      <span className="mt-3 inline-flex rounded-xl bg-white/80 px-3 py-2 text-[11px] font-black">{action}</span>
    </button>
  )
}

type SectionState = { loading: boolean; error: string | null; loadedAt: Date | null }
const initialSection: SectionState = { loading: true, error: null, loadedAt: null }

export default function AdminDashboardReliable() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [branch, setBranch] = useState('all')
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<{ branchId: string | null; branchName: string | null }>({ branchId: null, branchName: null })
  const [ordersState, setOrdersState] = useState<SectionState>(initialSection)
  const [peopleState, setPeopleState] = useState<SectionState>(initialSection)
  const [tripsState, setTripsState] = useState<SectionState>(initialSection)

  const resolveScope = useCallback(async () => {
    let branchId: string | null = null
    let branchName: string | null = null
    const local: any = getRiderSession()

    if (local && isBranchScopedRole(local.role)) {
      branchId = local.branch_id || null
      branchName = local.branch_name || null
    } else {
      const session = await getCurrentSession()
      const profile: any = session?.user?.id ? await getUserProfile(session.user.id) : null
      if (isBranchScopedRole(profile?.role)) {
        branchId = profile?.branch_id || null
        branchName = profile?.branch_name || null
      }
    }

    if (branchId && !branchName) {
      const { data } = await supabase.from('branches').select('name,display_name').eq('id', branchId).maybeSingle()
      branchName = (data as any)?.display_name || (data as any)?.name || null
    }

    return { branchId, branchName }
  }, [])

  const load = useCallback(async () => {
    const resolvedScope = await resolveScope()
    setScope(resolvedScope)
    if (resolvedScope.branchId) setBranch(displayBranchName(resolvedScope.branchName || resolvedScope.branchId))

    setOrdersState({ loading: true, error: null, loadedAt: null })
    setPeopleState({ loading: true, error: null, loadedAt: null })
    setTripsState({ loading: true, error: null, loadedAt: null })

    const branchFilters: QueryFilter[] = resolvedScope.branchId
      ? [{ column: 'branch_id', operator: 'eq', value: resolvedScope.branchId }]
      : []

    const orderPromise = fetchAllRows<any>({
      table: 'delivery_orders',
      filters: [
        { column: 'delivery_date', operator: 'gte', value: period.start },
        { column: 'delivery_date', operator: 'lte', value: period.end },
        ...branchFilters,
      ],
      orderColumn: 'registered_at',
      ascending: false,
    })

    const ridersPromise = fetchAllRows<any>({
      table: 'riders',
      filters: [
        { column: 'status', operator: 'eq', value: 'active' },
        ...branchFilters,
      ],
      orderColumn: 'created_at',
      ascending: true,
    })

    const tripsPromise = fetchAllRows<any>({
      table: 'internal_trips',
      filters: [
        { column: 'trip_date', operator: 'gte', value: period.start },
        { column: 'trip_date', operator: 'lte', value: period.end },
        ...branchFilters,
      ],
      orderColumn: 'registered_at',
      ascending: false,
    })

    const [orderResult, riderResult, tripResult] = await Promise.allSettled([orderPromise, ridersPromise, tripsPromise])
    const loadedAt = new Date()

    if (orderResult.status === 'fulfilled') {
      setOrders(orderResult.value)
      setOrdersState({ loading: false, error: null, loadedAt })
    } else {
      setOrdersState({ loading: false, error: orderResult.reason?.message || 'تعذر تحميل الأوردرات', loadedAt: null })
    }

    if (riderResult.status === 'fulfilled') {
      setRiders(riderResult.value)
      setPeopleState({ loading: false, error: null, loadedAt })
    } else {
      setPeopleState({ loading: false, error: riderResult.reason?.message || 'تعذر تحميل المناديب', loadedAt: null })
    }

    if (tripResult.status === 'fulfilled') {
      setTrips(tripResult.value)
      setTripsState({ loading: false, error: null, loadedAt })
    } else {
      setTripsState({ loading: false, error: tripResult.reason?.message || 'تعذر تحميل المشاوير', loadedAt: null })
    }

    if (orderResult.status === 'rejected' || riderResult.status === 'rejected' || tripResult.status === 'rejected') {
      toast.error('تم تحميل أجزاء الداشبورد، لكن يوجد قسم يحتاج إعادة المحاولة')
    }
  }, [period.end, period.start, resolveScope])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('reliable-admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders' }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load])

  const riderMap = useMemo(() => new Map(riders.map(rider => [rider.id, rider])), [riders])
  const branchOptions = useMemo(() => ['all', ...Array.from(new Set(orders.map(order => orderBranch(order, riderMap.get(order.rider_id))).filter(Boolean)))], [orders, riderMap])

  const filteredOrders = useMemo(() => orders.filter(order => {
    const rider = riderMap.get(order.rider_id)
    const matchesBranch = branch === 'all' || orderBranch(order, rider) === branch
    const query = search.trim()
    const matchesSearch = !query || [invoiceNumber(order), customerName(order), customerCode(order), rider?.name, rider?.username]
      .some(value => wildcardMatchText(String(value || ''), query))
    return matchesBranch && matchesSearch
  }), [branch, orders, riderMap, search])

  const today = todayIso()
  const todayOrders = useMemo(() => filteredOrders.filter(order => dateOf(order) === today), [filteredOrders, today])
  const summary = useMemo(() => {
    const delivered = filteredOrders.filter(isDelivered).length
    const failed = filteredOrders.filter(isFailed).length
    const open = filteredOrders.filter(order => !isClosed(order)).length
    const overdue = filteredOrders.filter(order => !isClosed(order) && orderAgeMinutes(order) > 60).length
    const duplicates = filteredOrders.filter(order => Boolean(order.is_duplicate_invoice) || String(order.duplicate_review_status || '').toLowerCase() === 'pending').length
    return {
      total: filteredOrders.length,
      delivered,
      failed,
      open,
      overdue,
      duplicates,
      successRate: filteredOrders.length ? (delivered / filteredOrders.length) * 100 : 0,
      todayTotal: todayOrders.length,
      todayDelivered: todayOrders.filter(isDelivered).length,
      todayFailed: todayOrders.filter(isFailed).length,
    }
  }, [filteredOrders, todayOrders])

  const riderRows = useMemo(() => riders.map(rider => {
    const riderOrders = filteredOrders.filter(order => order.rider_id === rider.id)
    const delivered = riderOrders.filter(isDelivered).length
    const failed = riderOrders.filter(isFailed).length
    const overdue = riderOrders.filter(order => !isClosed(order) && orderAgeMinutes(order) > 60).length
    const riderTrips = trips.filter(trip => trip.rider_id === rider.id).length
    return {
      rider,
      total: riderOrders.length,
      delivered,
      failed,
      overdue,
      trips: riderTrips,
      rate: riderOrders.length ? (delivered / riderOrders.length) * 100 : 0,
    }
  }).filter(row => row.total || row.trips).sort((a, b) => b.delivered - a.delivered || b.rate - a.rate), [filteredOrders, riders, trips])

  const bestRider = riderRows[0]
  const loading = ordersState.loading || peopleState.loading || tripsState.loading
  const latestLoadedAt = [ordersState.loadedAt, peopleState.loadedAt, tripsState.loadedAt].filter(Boolean).sort((a, b) => Number(b) - Number(a))[0] as Date | undefined

  return (
    <main className="space-y-5" dir="rtl">
      <section className="rounded-[2.2rem] bg-gradient-to-l from-[#073941] via-[#075c63] to-[#008e92] p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-emerald-200">مركز قيادة Dawaa Delivery</p>
            <h1 className="mt-2 text-3xl font-black">داشبورد أداء الصيدلية والدليفري والفروع</h1>
            <p className="mt-2 text-sm font-bold text-white/75">الدورة الحالية: {period.start} إلى {period.end} · آخر تحديث {latestLoadedAt ? formatDateTime(latestLoadedAt.toISOString()) : 'جارٍ التحميل'}</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-5 py-3 text-sm font-black backdrop-blur transition hover:bg-white/25 disabled:opacity-60">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث كامل
          </button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_280px]">
          <label className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3">
            <Search size={20} className="text-white/70" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث: فاتورة، عميل، كود، مندوب..." className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/55" />
          </label>
          <select value={branch} onChange={event => setBranch(event.target.value)} disabled={Boolean(scope.branchId)} className="rounded-2xl border-0 bg-white px-4 py-3 text-sm font-black text-[#073941] outline-none disabled:opacity-80">
            {branchOptions.map(option => <option key={option} value={option}>{option === 'all' ? 'كل الفروع' : option}</option>)}
          </select>
        </div>
      </section>

      {ordersState.error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">خطأ تحميل الأوردرات: {ordersState.error}</section>}
      {peopleState.error && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-700">خطأ تحميل المناديب: {peopleState.error}</section>}
      {tripsState.error && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-700">خطأ تحميل المشاوير: {tripsState.error}</section>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="أوردرات اليوم" value={loading ? '—' : summary.todayTotal.toLocaleString('ar-EG')} hint={`${summary.todayDelivered} تم · ${summary.todayFailed} فشل`} icon={<Activity size={22} />} tone="sky" />
        <StatCard title="أوردرات الدورة" value={loading ? '—' : summary.total.toLocaleString('ar-EG')} hint={`معدل النجاح ${summary.successRate.toFixed(1)}%`} icon={<PackageCheck size={22} />} />
        <StatCard title="تم التسليم" value={loading ? '—' : summary.delivered.toLocaleString('ar-EG')} hint="تسليم فعلي من كامل الدورة" icon={<CheckCircle2 size={22} />} />
        <StatCard title="فشل" value={loading ? '—' : summary.failed.toLocaleString('ar-EG')} hint="راجع الأسباب والعملاء" icon={<AlertTriangle size={22} />} tone="rose" />
        <StatCard title="عالقة الآن" value={loading ? '—' : summary.overdue.toLocaleString('ar-EG')} hint="أكثر من 60 دقيقة" icon={<Clock3 size={22} />} tone="rose" />
        <StatCard title="فواتير مكررة" value={loading ? '—' : summary.duplicates.toLocaleString('ar-EG')} hint="تحتاج قرارًا إداريًا" icon={<FileWarning size={22} />} tone="amber" onClick={() => navigate('/admin/duplicate-invoices')} />
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="text-xl font-black text-[#102a32]">أولويات تحتاج قرار الآن</h2><p className="mt-1 text-xs font-bold text-slate-400">الأرقام محسوبة من كامل الدورة بدون حد 1000 صف</p></div>
          <ShieldAlert className="text-rose-500" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PriorityCard title="أوردرات عالقة" value={summary.overdue} detail="ابدأ بالأقدم وتواصل مع المندوب أو الفرع" action="فتح غرفة العمليات" tone="rose" onClick={() => navigate('/admin/ops')} />
          <PriorityCard title="فواتير مكررة" value={summary.duplicates} detail="اعتماد أو رفض قبل إغلاق الدورة" action="فتح المطابقة" tone="amber" onClick={() => navigate('/admin/duplicate-invoices')} />
          <PriorityCard title="مندوب يحتاج متابعة" value={riderRows.filter(row => row.failed > 0 || row.overdue > 0).length} detail="مناديب لديهم فشل أو أوردرات متأخرة" action="فتح الأداء" tone="sky" onClick={() => navigate('/admin/performance')} />
          <PriorityCard title="أفضل مندوب" value={bestRider?.delivered || 0} detail={bestRider ? `${bestRider.rider.name || bestRider.rider.username} — نجاح ${bestRider.rate.toFixed(0)}%` : 'لا توجد بيانات بعد'} action="فتح التقرير" tone="emerald" onClick={() => navigate('/admin/performance')} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-black text-[#102a32]">أداء المناديب خلال الدورة</h2><p className="mt-1 text-xs font-bold text-slate-400">مبني على كل أوردرات الدورة</p></div><Users className="text-teal-600" /></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead><tr className="border-b text-xs text-slate-400"><th className="p-3 text-right">المندوب</th><th>الأوردرات</th><th>تم</th><th>فشل</th><th>متأخر</th><th>النسبة</th><th>المشاوير</th></tr></thead>
              <tbody>{riderRows.slice(0, 20).map(row => <tr key={row.rider.id} className="border-b border-slate-50 font-bold"><td className="p-3"><button onClick={() => navigate(`/admin/riders/${row.rider.id}/performance`)} className="font-black text-teal-700">{row.rider.name || row.rider.username}</button><div className="text-[10px] text-slate-400">{displayBranchName(row.rider.branch_name || row.rider.branch_id)}</div></td><td className="text-center">{row.total}</td><td className="text-center text-emerald-700">{row.delivered}</td><td className="text-center text-rose-700">{row.failed}</td><td className="text-center text-amber-700">{row.overdue}</td><td className="text-center">{row.rate.toFixed(1)}%</td><td className="text-center">{row.trips}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-black text-[#102a32]">أحدث الأوردرات</h2><p className="mt-1 text-xs font-bold text-slate-400">آخر 30 أوردرًا بعد الفلترة</p></div><Building2 className="text-sky-600" /></div>
          <div className="space-y-3">{filteredOrders.slice(0, 30).map(order => {
            const rider = riderMap.get(order.rider_id)
            return <article key={order.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-3"><div><b className="text-sm text-[#102a32]">فاتورة {invoiceNumber(order) || 'بدون رقم'}</b><p className="mt-1 text-xs font-bold text-slate-500">{customerName(order)} {customerCode(order) ? `· كود ${customerCode(order)}` : ''}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{rider?.name || rider?.username || 'مندوب غير محدد'} · {orderBranch(order, rider)} · {formatDateTime(order.registered_at || order.created_at)}</p></div><span className={`rounded-xl px-3 py-2 text-[11px] font-black ${isDelivered(order) ? 'bg-emerald-50 text-emerald-700' : isFailed(order) ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{isDelivered(order) ? 'تم التسليم' : isFailed(order) ? 'فشل' : 'قيد التنفيذ'}</span></div>{number(order.invoice_amount) > 0 && <p className="mt-2 text-sm font-black text-teal-700">{number(order.invoice_amount).toLocaleString('ar-EG')} ج</p>}</article>
          })}</div>
        </section>
      </section>
    </main>
  )
}
