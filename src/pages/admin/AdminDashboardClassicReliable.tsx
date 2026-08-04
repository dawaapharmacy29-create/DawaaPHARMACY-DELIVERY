import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Building2, CheckCircle2, Clock3, FileWarning, PackageCheck, RefreshCw, Search, ShieldAlert, Star, TrendingDown, Users } from 'lucide-react'
import { toast } from 'sonner'
import { getCurrentSession, getRiderSession, getUserProfile } from '../../lib/auth'
import { displayBranchName } from '../../lib/branchUtils'
import { fetchAllRows, type QueryFilter } from '../../lib/fetchAllRows'
import { formatDateTime, getOperationalPeriod, wildcardMatchText } from '../../lib/helpers'
import { isBranchScopedRole } from '../../lib/permissions'
import { supabase } from '../../lib/supabase'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import type { BadgeTone } from '../../components/ui/Badge'

const todayIso = () => new Date().toISOString().slice(0, 10)
const num = (v: unknown) => Number(v || 0) || 0
const dateOf = (o: any) => String(o.delivery_date || o.work_date || o.registered_at || o.created_at || '').slice(0, 10)
const delivered = (o: any) => String(o.status || '').toLowerCase() === 'delivered' || Boolean(o.delivered_at)
const failed = (o: any) => ['failed', 'returned', 'rejected'].includes(String(o.status || '').toLowerCase()) || Boolean(o.failed_reason)
const closed = (o: any) => delivered(o) || failed(o) || String(o.status || '').toLowerCase() === 'cancelled'
const ageMinutes = (o: any) => Math.max(0, Math.floor((Date.now() - new Date(o.registered_at || o.created_at || Date.now()).getTime()) / 60000))
const invoice = (o: any) => String(o.invoice_number || o.invoice_no || '')
const customer = (o: any) => String(o.customer_name_snapshot || o.customer_name || 'عميل غير محدد')
const customerCode = (o: any) => String(o.customer_code_snapshot || o.customer_code || '')
const branchName = (o: any, r?: any) => displayBranchName(o.branch_name || r?.branch_name || o.branch_id || r?.branch_id || 'غير محدد')

function Priority({ title, value, detail, tone, onClick }: { title: string; value: number; detail: string; tone: 'rose' | 'amber' | 'sky' | 'emerald'; onClick?: () => void }) {
  const cls = {
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    sky: 'border-sky-100 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  }[tone]
  return (
    <button onClick={onClick} className={`min-h-[168px] rounded-[1.6rem] border p-5 text-right shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${cls}`}>
      <div className="flex items-center justify-between">
        <b>{title}</b>
        <span className="text-3xl font-black">{value}</span>
      </div>
      <p className="mt-3 min-h-12 text-xs font-bold text-slate-500">{detail}</p>
      <span className="mt-3 inline-flex rounded-xl bg-white/80 px-3 py-2 text-[11px] font-black">فتح</span>
    </button>
  )
}

function orderStatusBadge(delivered: boolean, failed: boolean): { label: string; tone: BadgeTone } {
  if (delivered) return { label: 'تم', tone: 'success' }
  if (failed) return { label: 'فشل', tone: 'danger' }
  return { label: 'مفتوح', tone: 'warning' }
}

export default function AdminDashboardClassicReliable() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [branch, setBranch] = useState('all')
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<{ branchId: string | null; branchName: string | null }>({ branchId: null, branchName: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const resolveScope = useCallback(async () => {
    let branchId: string | null = null
    let resolvedName: string | null = null
    const local: any = getRiderSession()
    if (local && isBranchScopedRole(local.role)) {
      branchId = local.branch_id || null
      resolvedName = local.branch_name || null
    } else {
      const session = await getCurrentSession()
      const profile: any = session?.user?.id ? await getUserProfile(session.user.id) : null
      if (isBranchScopedRole(profile?.role)) {
        branchId = profile?.branch_id || null
        resolvedName = profile?.branch_name || null
      }
    }
    if (branchId && !resolvedName) {
      const { data } = await supabase.from('branches').select('name,display_name').eq('id', branchId).maybeSingle()
      resolvedName = (data as any)?.display_name || (data as any)?.name || null
    }
    return { branchId, branchName: resolvedName }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resolved = await resolveScope()
      setScope(resolved)
      if (resolved.branchId) setBranch(displayBranchName(resolved.branchName || resolved.branchId))
      const branchFilters: QueryFilter[] = resolved.branchId ? [{ column: 'branch_id', operator: 'eq', value: resolved.branchId }] : []
      const [allOrders, allRiders, allTrips] = await Promise.all([
        fetchAllRows<any>({ table: 'delivery_orders', filters: [{ column: 'delivery_date', operator: 'gte', value: period.start }, { column: 'delivery_date', operator: 'lte', value: period.end }, ...branchFilters], orderColumn: 'registered_at', ascending: false }),
        fetchAllRows<any>({ table: 'riders', filters: [{ column: 'status', operator: 'eq', value: 'active' }, ...branchFilters], orderColumn: 'created_at' }),
        fetchAllRows<any>({ table: 'internal_trips', filters: [{ column: 'trip_date', operator: 'gte', value: period.start }, { column: 'trip_date', operator: 'lte', value: period.end }, ...branchFilters], orderColumn: 'registered_at', ascending: false }),
      ])
      setOrders(allOrders)
      setRiders(allRiders)
      setTrips(allTrips)
      setUpdatedAt(new Date())
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات الداشبورد')
      toast.error(e?.message || 'تعذر تحميل بيانات الداشبورد')
    } finally {
      setLoading(false)
    }
  }, [period.end, period.start, resolveScope])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const channel = supabase.channel('classic-reliable-dashboard').on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders' }, () => void load()).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load])

  const riderMap = useMemo(() => new Map(riders.map(r => [r.id, r])), [riders])
  const branches = useMemo(() => ['all', ...Array.from(new Set(orders.map(o => branchName(o, riderMap.get(o.rider_id))).filter(Boolean)))], [orders, riderMap])
  const filtered = useMemo(() => orders.filter(o => {
    const r = riderMap.get(o.rider_id)
    const branchOk = branch === 'all' || branchName(o, r) === branch
    const q = search.trim()
    const searchOk = !q || [invoice(o), customer(o), customerCode(o), r?.name, r?.username].some(v => wildcardMatchText(String(v || ''), q))
    return branchOk && searchOk
  }), [branch, orders, riderMap, search])

  const today = todayIso()
  const todayOrders = useMemo(() => filtered.filter(o => dateOf(o) === today), [filtered, today])
  const summary = useMemo(() => {
    const done = filtered.filter(delivered).length
    const bad = filtered.filter(failed).length
    const open = filtered.filter(o => !closed(o)).length
    const overdue = filtered.filter(o => !closed(o) && ageMinutes(o) > 60).length
    const duplicates = filtered.filter(o => Boolean(o.is_duplicate_invoice) || String(o.duplicate_review_status || '').toLowerCase() === 'pending').length
    return { total: filtered.length, done, bad, open, overdue, duplicates, rate: filtered.length ? done / filtered.length * 100 : 0, today: todayOrders.length, todayDone: todayOrders.filter(delivered).length, todayBad: todayOrders.filter(failed).length }
  }, [filtered, todayOrders])

  const days = useMemo(() => {
    const out: { date: string; total: number; delivered: number; failed: number }[] = []
    const cursor = new Date(`${period.start}T00:00:00`)
    const end = new Date(`${period.end}T00:00:00`)
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10)
      const rows = filtered.filter(o => dateOf(o) === key)
      out.push({ date: key, total: rows.length, delivered: rows.filter(delivered).length, failed: rows.filter(failed).length })
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }, [filtered, period.end, period.start])
  const maxDay = Math.max(1, ...days.map(d => d.total))

  const riderRows = useMemo(() => riders.map(r => {
    const ro = filtered.filter(o => o.rider_id === r.id)
    const td = todayOrders.filter(o => o.rider_id === r.id)
    const tr = trips.filter(t => t.rider_id === r.id)
    const done = ro.filter(delivered).length
    const bad = ro.filter(failed).length
    const open = ro.filter(o => !closed(o)).length
    const overdue = ro.filter(o => !closed(o) && ageMinutes(o) > 60).length
    return { rider: r, cycle: ro.length, today: td.length, done, bad, open, overdue, trips: tr.length, rate: ro.length ? done / ro.length * 100 : 0, earnings: done * num(r.order_rate) + tr.length * num(r.trip_rate) }
  }).filter(x => x.cycle || x.trips).sort((a, b) => b.done - a.done || b.rate - a.rate), [filtered, riders, todayOrders, trips])

  const branchRows = useMemo(() => Object.values(filtered.reduce((acc: Record<string, any>, o) => {
    const r = riderMap.get(o.rider_id)
    const label = branchName(o, r)
    acc[label] ||= { label, orders: 0, done: 0, bad: 0, riders: new Set<string>(), customers: new Set<string>() }
    acc[label].orders += 1
    if (delivered(o)) acc[label].done += 1
    if (failed(o)) acc[label].bad += 1
    acc[label].riders.add(o.rider_id)
    acc[label].customers.add(customerCode(o) || customer(o))
    return acc
  }, {})).map((x: any) => ({ ...x, riders: x.riders.size, customers: x.customers.size, rate: x.orders ? x.done / x.orders * 100 : 0 })), [filtered, riderMap])

  const topRider = riderRows[0]
  const riskRider = [...riderRows].sort((a, b) => (b.bad + b.overdue) - (a.bad + a.overdue))[0]

  return (
    <main className="space-y-6" dir="rtl">
      <section className="rounded-[2.3rem] bg-gradient-to-l from-[#083941] via-[#075b63] to-[#008e92] p-5 text-white shadow-xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-teal-200">مركز قيادة Dawaa Delivery</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">داشبورد أداء الصيدلية والدليفري والفروع</h1>
            <p className="mt-2 text-sm font-bold text-white/75">
              الدورة الحالية: {period.start} إلى {period.end} · آخر تحديث {updatedAt ? formatDateTime(updatedAt.toISOString()) : 'جارٍ التحميل'}
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-5 py-3 text-sm font-black transition hover:bg-white/25 disabled:opacity-60">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث كامل
          </button>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_240px]">
          <label className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3">
            <Search size={19} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث: فاتورة، عميل، كود، مندوب..." className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/50" />
          </label>
          <select value={branch} onChange={e => setBranch(e.target.value)} disabled={Boolean(scope.branchId)} className="rounded-2xl bg-[#0b4c55] px-4 py-3 text-sm font-black text-white outline-none disabled:opacity-70">
            {branches.map(b => <option key={b} value={b}>{b === 'all' ? 'كل الفروع' : b}</option>)}
          </select>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">{error}</section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="أوردرات اليوم" value={summary.today} hint={`${summary.todayDone} تم · ${summary.todayBad} فشل`} icon={<Activity size={18} />} tone="sky" loading={loading} onClick={() => navigate('/admin/reconciliation')} />
        <StatCard label="أوردرات الدورة" value={summary.total} hint={`معدل النجاح ${summary.rate.toFixed(1)}%`} icon={<PackageCheck size={18} />} tone="teal" loading={loading} onClick={() => navigate('/admin/reconciliation')} />
        <StatCard label="تم التسليم" value={summary.done} hint="تسليم فعلي من كامل الدورة" icon={<CheckCircle2 size={18} />} tone="emerald" loading={loading} />
        <StatCard label="فشل" value={summary.bad} hint="راجع الأسباب والعملاء" icon={<TrendingDown size={18} />} tone="rose" loading={loading} />
        <StatCard label="عالقة الآن" value={summary.overdue} hint="أكثر من 60 دقيقة" icon={<Clock3 size={18} />} tone="rose" loading={loading} onClick={() => navigate('/admin/ops')} />
        <StatCard label="فواتير مكررة" value={summary.duplicates} hint="تحتاج قرارًا إداريًا" icon={<FileWarning size={18} />} tone="amber" loading={loading} onClick={() => navigate('/admin/duplicate-invoices')} />
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><ShieldAlert /></span>
          <div>
            <h2 className="text-lg font-black sm:text-xl">أولويات تحتاج قرار الآن</h2>
            <p className="text-xs font-bold text-slate-400">أهم 4 نقاط تستحق المتابعة الفورية</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Priority title="أوردرات عالقة" value={summary.overdue} detail="ابدأ بالأقدم وتواصل مع المندوب أو الفرع" tone="rose" onClick={() => navigate('/admin/ops')} />
          <Priority title="فواتير مكررة" value={summary.duplicates} detail="اعتماد أو رفض قبل إغلاق الدورة" tone="amber" onClick={() => navigate('/admin/duplicate-invoices')} />
          <Priority title="مندوب يحتاج متابعة" value={riskRider ? 1 : 0} detail={riskRider ? `${riskRider.rider.name || riskRider.rider.username} لديه أعلى خطر` : 'لا توجد مخاطر واضحة'} tone="sky" onClick={() => navigate('/admin/performance')} />
          <Priority title="أفضل مندوب" value={topRider?.done || 0} detail={topRider ? `${topRider.rider.name || topRider.rider.username} — نجاح ${topRider.rate.toFixed(0)}%` : 'لا توجد بيانات'} tone="emerald" onClick={() => navigate('/admin/performance')} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-black sm:text-xl">حركة الأوردرات خلال الدورة</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">توزيع الأوردرات اليومي على مدار الدورة الحالية</p>
          </div>
          {days.some(d => d.total > 0) ? (
            <div className="flex h-[280px] items-end gap-1 overflow-x-auto rounded-[1.5rem] bg-gradient-to-b from-teal-50/70 to-white p-4 sm:h-[330px]">
              {days.map(d => (
                <button key={d.date} title={`${d.date}: ${d.total} أوردر`} className="group flex min-w-[22px] flex-1 flex-col items-center justify-end gap-1">
                  <span className="hidden rounded-lg bg-[#0b2d33] px-2 py-1 text-[10px] font-black text-white group-hover:block">{d.total}</span>
                  <span className="w-full rounded-t-xl bg-teal-500/85" style={{ height: `${Math.max(5, d.total / maxDay * 245)}px` }} />
                  <span className="text-[9px] font-bold text-slate-400">{d.date.slice(5)}</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="لا توجد أوردرات في هذه الدورة بعد" description="سيظهر الرسم البياني بمجرد تسجيل أول أوردر" />
          )}
        </section>
        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black sm:text-xl">مقارنة الفروع</h2>
            <Building2 className="text-teal-600" size={20} />
          </div>
          {branchRows.length ? (
            <div className="space-y-3">
              {branchRows.map((r: any) => (
                <article key={r.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <b className="font-black">{r.label}</b>
                    <Badge tone="success">{r.rate.toFixed(0)}%</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs font-bold text-slate-500">
                    <span>أوردرات<br /><b className="text-slate-800">{r.orders}</b></span>
                    <span>فشل<br /><b className="text-slate-800">{r.bad}</b></span>
                    <span>مناديب<br /><b className="text-slate-800">{r.riders}</b></span>
                    <span>عملاء<br /><b className="text-slate-800">{r.customers}</b></span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="لا توجد بيانات فروع بعد" />
          )}
        </section>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-black sm:text-xl">بطاقة أداء المندوبين</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">أداء كل مندوب خلال الدورة الحالية</p>
          </div>
          <Users className="text-teal-600" size={20} />
        </div>

        {riderRows.length === 0 ? (
          <div className="p-5 sm:p-6"><EmptyState title="لا يوجد مناديب لديهم نشاط في هذه الدورة" /></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-slate-50 text-[11px] font-black text-slate-500">
                  <tr>
                    <th className="p-4 text-right">المندوب</th>
                    <th>الدورة</th><th>اليوم</th><th>تم</th><th>فشل</th><th>مفتوح</th><th>عالقة</th><th>مشاوير</th><th>نجاح</th><th>تقديري</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {riderRows.map((r, i) => (
                    <tr key={r.rider.id} className="border-t border-slate-50 font-bold">
                      <td className="p-4">
                        <b>{i + 1}. {r.rider.name || r.rider.username}</b>
                        <p className="text-[10px] text-slate-400">{displayBranchName(r.rider.branch_name || r.rider.branch_id)}</p>
                      </td>
                      <td className="text-center">{r.cycle}</td>
                      <td className="text-center">{r.today}</td>
                      <td className="text-center font-black text-emerald-700">{r.done}</td>
                      <td className="text-center text-rose-700">{r.bad}</td>
                      <td className="text-center">{r.open}</td>
                      <td className="text-center text-amber-700">{r.overdue}</td>
                      <td className="text-center">{r.trips}</td>
                      <td className="text-center">{r.rate.toFixed(0)}%</td>
                      <td className="text-center">{Math.round(r.earnings).toLocaleString('ar-EG')} ج</td>
                      <td className="p-3">
                        <button onClick={() => navigate(`/admin/riders/${r.rider.id}/performance`)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black transition hover:bg-teal-50 hover:text-teal-700">فتح</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {riderRows.map((r, i) => (
                <article key={r.rider.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <b className="font-black">{i + 1}. {r.rider.name || r.rider.username}</b>
                      <p className="text-[11px] font-bold text-slate-400">{displayBranchName(r.rider.branch_name || r.rider.branch_id)}</p>
                    </div>
                    <Badge tone="teal">{r.rate.toFixed(0)}% نجاح</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px] font-bold text-slate-500">
                    <span>تم<br /><b className="text-emerald-700">{r.done}</b></span>
                    <span>فشل<br /><b className="text-rose-700">{r.bad}</b></span>
                    <span>عالقة<br /><b className="text-amber-700">{r.overdue}</b></span>
                    <span>مشاوير<br /><b className="text-slate-800">{r.trips}</b></span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                    <span className="text-xs font-black text-slate-600">{Math.round(r.earnings).toLocaleString('ar-EG')} ج تقديري</span>
                    <button onClick={() => navigate(`/admin/riders/${r.rider.id}/performance`)} className="rounded-xl bg-white px-3 py-2 text-xs font-black shadow-sm">فتح</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black sm:text-xl">أحدث الأوردرات</h2>
            <Activity className="text-teal-600" size={20} />
          </div>
          {filtered.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.slice(0, 20).map(o => {
                const r = riderMap.get(o.rider_id)
                const status = orderStatusBadge(delivered(o), failed(o))
                return (
                  <article key={o.id} className="rounded-2xl border border-slate-100 p-4">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <b>فاتورة {invoice(o) || 'بدون رقم'}</b>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">{customer(o)} {customerCode(o) ? `· ${customerCode(o)}` : ''}</p>
                        <p className="mt-1 text-[11px] font-bold text-slate-400">{r?.name || r?.username || 'مندوب غير محدد'} · {formatDateTime(o.registered_at || o.created_at)}</p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <EmptyState title="لا توجد أوردرات مطابقة" description="جرّب تعديل البحث أو الفرع المختار" />
          )}
        </section>
        <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black sm:text-xl">ملخص سريع</h2>
            <Star className="text-amber-500" size={20} />
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-black text-emerald-700">أفضل مندوب</p>
              <b className="mt-1 block text-xl">{topRider?.rider.name || topRider?.rider.username || '—'}</b>
            </div>
            <div className="rounded-2xl bg-sky-50 p-4">
              <p className="text-xs font-black text-sky-700">إجمالي المشاوير</p>
              <b className="mt-1 block text-2xl">{trips.length.toLocaleString('ar-EG')}</b>
            </div>
            <div className="rounded-2xl bg-violet-50 p-4">
              <p className="text-xs font-black text-violet-700">إجمالي قيمة الفواتير</p>
              <b className="mt-1 block text-2xl">{Math.round(filtered.reduce((s, o) => s + num(o.invoice_amount), 0)).toLocaleString('ar-EG')} ج</b>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
