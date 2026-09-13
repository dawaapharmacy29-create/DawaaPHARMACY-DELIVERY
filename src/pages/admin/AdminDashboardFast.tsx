import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CheckCircle2, Clock3, FileWarning, PackageCheck, RefreshCw, TrendingDown, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getCurrentSession, getRiderSession, getUserProfile } from '../../lib/auth'
import { displayBranchName } from '../../lib/branchUtils'
import { formatDateTime, getOperationalPeriod } from '../../lib/helpers'
import { isBranchScopedRole } from '../../lib/permissions'
import { supabase } from '../../lib/supabase'
import StatCard from '../../components/ui/StatCard'

function getRpcResult<T = any>(data: any): T | null {
  return (Array.isArray(data) ? data[0] : data) as T | null
}

function statusLabel(order: any) {
  const status = String(order?.status || '').toLowerCase()
  if (status === 'delivered' || order?.delivered_at) return { text: 'تم', cls: 'bg-emerald-50 text-emerald-700' }
  if (['failed', 'returned', 'rejected'].includes(status) || order?.failed_reason) return { text: 'فشل', cls: 'bg-rose-50 text-rose-700' }
  return { text: 'مفتوح', cls: 'bg-amber-50 text-amber-700' }
}

export default function AdminDashboardFast() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [scope, setScope] = useState<{ branchId: string | null; branchName: string | null }>({ branchId: null, branchName: null })
  const refreshTimer = useRef<number | null>(null)
  const loadInFlight = useRef<Promise<void> | null>(null)

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
    return { branchId, branchName }
  }, [])

  const load = useCallback(async (showToast = false) => {
    if (loadInFlight.current) return loadInFlight.current
    const task = (async () => {
      try {
        setLoading(true)
        const resolved = await resolveScope()
        setScope(resolved)
        const { data, error } = await supabase.rpc('admin_delivery_dashboard_fast', {
          p_period_start: period.start,
          p_period_end: period.end,
          p_branch_id: resolved.branchId,
        })
        const result = getRpcResult<any>(data)
        if (error || !result?.success) throw new Error(error?.message || result?.message || 'تعذر تحميل الداشبورد السريع')
        setPayload(result)
        setUpdatedAt(new Date())
        if (showToast) toast.success('تم تحديث الداشبورد')
      } catch (error: any) {
        toast.error(error?.message || 'تعذر تحميل الداشبورد')
      } finally {
        setLoading(false)
      }
    })()
    loadInFlight.current = task
    try { await task } finally { loadInFlight.current = null }
  }, [period.end, period.start, resolveScope])

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimer.current !== null) return
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      void load(false)
    }, 2500)
  }, [load])

  useEffect(() => { void load(false) }, [load])
  useEffect(() => {
    const channel = supabase
      .channel('admin-fast-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_trips' }, scheduleRealtimeRefresh)
      .subscribe()
    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      void supabase.removeChannel(channel)
    }
  }, [scheduleRealtimeRefresh])

  const summary = payload?.summary || {}
  const riders = Array.isArray(payload?.riders) ? payload.riders : []
  const branches = Array.isArray(payload?.branches) ? payload.branches : []
  const latest = Array.isArray(payload?.latest_orders) ? payload.latest_orders : []
  const daily = Array.isArray(payload?.daily) ? payload.daily : []
  const maxDaily = Math.max(1, ...daily.map((d: any) => Number(d.total || 0)))

  return (
    <main className="space-y-6" dir="rtl">
      <section className="rounded-[2.3rem] bg-gradient-to-l from-[#083941] via-[#075b63] to-[#008e92] p-5 text-white shadow-xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-teal-200">مركز قيادة Dawaa Delivery · Fast Mode</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">الداشبورد التشغيلي السريع</h1>
            <p className="mt-2 text-sm font-bold text-white/75">الدورة: {period.start} إلى {period.end}{scope.branchId ? ` · ${displayBranchName(scope.branchName || scope.branchId)}` : ' · كل الفروع'} · آخر تحديث {updatedAt ? formatDateTime(updatedAt.toISOString()) : 'جارٍ التحميل'}</p>
          </div>
          <button onClick={() => void load(true)} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-5 py-3 text-sm font-black transition hover:bg-white/25 disabled:opacity-60"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث</button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="أوردرات اليوم" value={Number(summary.today || 0)} hint={`${summary.today_delivered || 0} تم · ${summary.today_failed || 0} فشل`} icon={<Activity size={18} />} tone="sky" loading={loading} onClick={() => navigate('/admin/reconciliation')} />
        <StatCard label="أوردرات الدورة" value={Number(summary.total || 0)} hint={`معدل النجاح ${Number(summary.success_rate || 0).toFixed(1)}%`} icon={<PackageCheck size={18} />} tone="teal" loading={loading} onClick={() => navigate('/admin/reconciliation')} />
        <StatCard label="تم التسليم" value={Number(summary.delivered || 0)} hint="تسليم فعلي" icon={<CheckCircle2 size={18} />} tone="emerald" loading={loading} />
        <StatCard label="فشل" value={Number(summary.failed || 0)} hint="يحتاج مراجعة الأسباب" icon={<TrendingDown size={18} />} tone="rose" loading={loading} />
        <StatCard label="عالقة الآن" value={Number(summary.overdue || 0)} hint="أكثر من 60 دقيقة" icon={<Clock3 size={18} />} tone="rose" loading={loading} onClick={() => navigate('/admin/ops')} />
        <StatCard label="فواتير مكررة" value={Number(summary.duplicates || 0)} hint="تحتاج قرارًا إداريًا" icon={<FileWarning size={18} />} tone="amber" loading={loading} onClick={() => navigate('/admin/duplicate-invoices')} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4"><h2 className="text-lg font-black">حركة الأوردرات خلال الدورة</h2><p className="text-xs font-bold text-slate-400">مجمعة على السيرفر بدون تنزيل آلاف الصفوف</p></div>
          <div className="flex h-56 items-end gap-1 overflow-x-auto rounded-2xl bg-slate-50 p-3">
            {daily.map((d: any) => <div key={String(d.date)} className="flex min-w-[20px] flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${d.total}`}><span className="w-full rounded-t-lg bg-teal-500" style={{ height: `${Math.max(4, Number(d.total || 0) / maxDaily * 175)}px` }} /><span className="text-[8px] font-bold text-slate-400">{String(d.date).slice(5)}</span></div>)}
          </div>
        </div>
        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black">الفروع</h2><Users size={19} className="text-teal-600" /></div>
          <div className="space-y-3">{branches.map((b: any) => <div key={String(b.branch_id || b.branch_name)} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between"><b>{displayBranchName(b.branch_name)}</b><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">{Number(b.success_rate || 0).toFixed(0)}%</span></div><div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px] font-bold text-slate-500"><span>أوردرات<br/><b className="text-slate-800">{b.orders}</b></span><span>فشل<br/><b className="text-rose-700">{b.failed}</b></span><span>مناديب<br/><b className="text-slate-800">{b.riders}</b></span><span>عملاء<br/><b className="text-slate-800">{b.customers}</b></span></div></div>)}</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b p-5"><div><h2 className="text-lg font-black">أداء المناديب</h2><p className="text-xs font-bold text-slate-400">الحسابات تمت داخل قاعدة البيانات</p></div><Users className="text-teal-600" size={20}/></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-[11px] font-black text-slate-500"><tr><th className="p-4 text-right">المندوب</th><th>الدورة</th><th>اليوم</th><th>تم</th><th>فشل</th><th>مفتوح</th><th>عالقة</th><th>مشاوير</th><th>نجاح</th><th></th></tr></thead><tbody>{riders.map((r: any) => <tr key={r.id} className="border-t border-slate-50 font-bold"><td className="p-4"><b>{r.name}</b><p className="text-[10px] text-slate-400">{displayBranchName(r.branch_name)}</p></td><td className="text-center">{r.cycle_orders}</td><td className="text-center">{r.today_orders}</td><td className="text-center text-emerald-700">{r.delivered}</td><td className="text-center text-rose-700">{r.failed}</td><td className="text-center">{r.open}</td><td className="text-center text-amber-700">{r.overdue}</td><td className="text-center">{r.trips}</td><td className="text-center">{Number(r.success_rate || 0).toFixed(0)}%</td><td className="p-3"><button onClick={() => navigate(`/admin/riders/${r.id}/performance`)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">فتح</button></td></tr>)}</tbody></table></div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-black">أحدث 20 أوردر</h2><p className="text-xs font-bold text-slate-400">آخر النشاط فقط بدل تحميل كل الدورة في المتصفح</p></div><Activity className="text-teal-600" size={20}/></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{latest.map((o: any) => { const s=statusLabel(o); return <article key={o.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-2"><div><b>فاتورة {o.invoice_number || '—'}</b><p className="mt-1 text-xs font-bold text-slate-500">{o.customer_name || 'عميل غير محدد'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${s.cls}`}>{s.text}</span></div><div className="mt-3 text-[11px] font-bold text-slate-400">{o.rider_name || 'مندوب غير محدد'} · {displayBranchName(o.branch_name)} · {o.registered_at ? formatDateTime(o.registered_at) : '—'}</div></article> })}</div>
      </section>
    </main>
  )
}
