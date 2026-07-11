import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, Building2, CheckCircle2, Clock3, FileWarning, PackageCheck, RefreshCw, Search, ShieldAlert, Star, TrendingDown, Users } from 'lucide-react'
import { toast } from 'sonner'
import { getCurrentSession, getRiderSession, getUserProfile } from '../../lib/auth'
import { displayBranchName } from '../../lib/branchUtils'
import { fetchAllRows, type QueryFilter } from '../../lib/fetchAllRows'
import { formatDateTime, getOperationalPeriod, wildcardMatchText } from '../../lib/helpers'
import { isBranchScopedRole } from '../../lib/permissions'
import { supabase } from '../../lib/supabase'

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

function Card({ title, value, hint, icon, tone = 'emerald', onClick }: any) {
  const cls = { emerald: 'bg-emerald-50 text-emerald-700', sky: 'bg-sky-50 text-sky-700', rose: 'bg-rose-50 text-rose-700', amber: 'bg-amber-50 text-amber-700', violet: 'bg-violet-50 text-violet-700' }[tone as string]
  return <button type="button" onClick={onClick} className="min-h-[164px] w-full rounded-[1.8rem] border border-slate-100 bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-slate-500">{title}</p><p className="mt-3 text-4xl font-black text-[#102a32]">{value}</p></div><span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${cls}`}>{icon}</span></div><p className="mt-4 border-t border-slate-50 pt-3 text-[11px] font-bold text-slate-400">{hint}</p></button>
}

function Priority({ title, value, detail, tone, onClick }: any) {
  const cls = { rose: 'border-rose-100 bg-rose-50 text-rose-700', amber: 'border-amber-100 bg-amber-50 text-amber-700', sky: 'border-sky-100 bg-sky-50 text-sky-700', emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700' }[tone as string]
  return <button onClick={onClick} className={`min-h-[168px] rounded-[1.6rem] border p-5 text-right shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${cls}`}><div className="flex items-center justify-between"><b>{title}</b><span className="text-3xl font-black">{value}</span></div><p className="mt-3 min-h-12 text-xs font-bold text-slate-500">{detail}</p><span className="mt-3 inline-flex rounded-xl bg-white/80 px-3 py-2 text-[11px] font-black">فتح</span></button>
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

  return <main className="space-y-6" dir="rtl">
    <section className="rounded-[2.3rem] bg-gradient-to-l from-[#083941] via-[#075b63] to-[#008e92] p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black text-emerald-200">مركز قيادة Dawaa Delivery</p><h1 className="mt-2 text-3xl font-black">داشبورد أداء الصيدلية والدليفري والفروع</h1><p className="mt-2 text-sm font-bold text-white/75">الدورة الحالية: {period.start} إلى {period.end} · آخر تحديث {updatedAt ? formatDateTime(updatedAt.toISOString()) : 'جارٍ التحميل'}</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-5 py-3 text-sm font-black"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/> تحديث كامل</button></div>
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_240px]"><label className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث: فاتورة، عميل، كود، مندوب..." className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/50"/></label><select value={branch} onChange={e => setBranch(e.target.value)} disabled={Boolean(scope.branchId)} className="rounded-2xl bg-[#0b4c55] px-4 py-3 text-sm font-black text-white outline-none">{branches.map(b => <option key={b} value={b}>{b === 'all' ? 'كل الفروع' : b}</option>)}</select></div>
    </section>

    {error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">{error}</section>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Card title="أوردرات اليوم" value={loading ? '—' : summary.today} hint={`${summary.todayDone} تم · ${summary.todayBad} فشل`} icon={<Activity/>} tone="sky" onClick={() => navigate('/admin/reconciliation')}/>
      <Card title="أوردرات الدورة" value={loading ? '—' : summary.total} hint={`معدل النجاح ${summary.rate.toFixed(1)}%`} icon={<PackageCheck/>} onClick={() => navigate('/admin/reconciliation')}/>
      <Card title="تم التسليم" value={loading ? '—' : summary.done} hint="تسليم فعلي من كامل الدورة" icon={<CheckCircle2/>}/>
      <Card title="فشل" value={loading ? '—' : summary.bad} hint="راجع الأسباب والعملاء" icon={<TrendingDown/>} tone="rose"/>
      <Card title="عالقة الآن" value={loading ? '—' : summary.overdue} hint="أكثر من 60 دقيقة" icon={<Clock3/>} tone="rose" onClick={() => navigate('/admin/ops')}/>
      <Card title="فواتير مكررة" value={loading ? '—' : summary.duplicates} hint="تحتاج قرارًا إداريًا" icon={<FileWarning/>} tone="amber" onClick={() => navigate('/admin/duplicate-invoices')}/>
    </section>

    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><ShieldAlert/></span><div><h2 className="text-xl font-black">أولويات تحتاج قرار الآن</h2><p className="text-xs font-bold text-slate-400">نفس المميزات القديمة مع بيانات كاملة ودقيقة</p></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Priority title="أوردرات عالقة" value={summary.overdue} detail="ابدأ بالأقدم وتواصل مع المندوب أو الفرع" tone="rose" onClick={() => navigate('/admin/ops')}/><Priority title="فواتير مكررة" value={summary.duplicates} detail="اعتماد أو رفض قبل إغلاق الدورة" tone="amber" onClick={() => navigate('/admin/duplicate-invoices')}/><Priority title="مندوب يحتاج متابعة" value={riskRider ? 1 : 0} detail={riskRider ? `${riskRider.rider.name || riskRider.rider.username} لديه أعلى خطر` : 'لا توجد مخاطر واضحة'} tone="sky" onClick={() => navigate('/admin/performance')}/><Priority title="أفضل مندوب" value={topRider?.done || 0} detail={topRider ? `${topRider.rider.name || topRider.rider.username} — نجاح ${topRider.rate.toFixed(0)}%` : 'لا توجد بيانات'} tone="emerald" onClick={() => navigate('/admin/performance')}/></div></section>

    <section className="grid gap-5 xl:grid-cols-[2fr_1fr]">
      <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm"><div className="mb-5"><h2 className="text-xl font-black">حركة الأوردرات خلال الدورة</h2><p className="mt-1 text-xs font-bold text-slate-400">الرسم البياني اليومي عاد بنفس المساحة الواضحة</p></div><div className="flex h-[330px] items-end gap-1 overflow-x-auto rounded-[1.5rem] bg-gradient-to-b from-emerald-50/80 to-white p-4">{days.map(d => <button key={d.date} title={`${d.date}: ${d.total} أوردر`} className="group flex min-w-[24px] flex-1 flex-col items-center justify-end gap-1"><span className="hidden rounded-lg bg-[#0b2d33] px-2 py-1 text-[10px] font-black text-white group-hover:block">{d.total}</span><span className="w-full rounded-t-xl bg-emerald-500/85" style={{ height: `${Math.max(5, d.total / maxDay * 245)}px` }}/><span className="text-[9px] font-bold text-slate-400">{d.date.slice(5)}</span></button>)}</div></section>
      <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">مقارنة الفروع</h2><Building2 className="text-sky-600"/></div><div className="space-y-4">{branchRows.map((r: any) => <article key={r.label} className="rounded-2xl border bg-slate-50 p-4"><div className="flex items-center justify-between"><b>{r.label}</b><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">{r.rate.toFixed(0)}%</span></div><div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs font-bold text-slate-500"><span>أوردرات<br/><b>{r.orders}</b></span><span>فشل<br/><b>{r.bad}</b></span><span>مناديب<br/><b>{r.riders}</b></span><span>عملاء<br/><b>{r.customers}</b></span></div></article>)}</div></section>
    </section>

    <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b p-6"><div><h2 className="text-xl font-black">بطاقة أداء المندوبين</h2><p className="mt-1 text-xs font-bold text-slate-400">جدول كامل بعرض الصفحة مثل التصميم القديم</p></div><Users className="text-teal-600"/></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-slate-50 text-[11px] font-black text-slate-500"><tr><th className="p-4 text-right">المندوب</th><th>الدورة</th><th>اليوم</th><th>تم</th><th>فشل</th><th>مفتوح</th><th>عالقة</th><th>مشاوير</th><th>نجاح</th><th>تقديري</th><th></th></tr></thead><tbody>{riderRows.map((r, i) => <tr key={r.rider.id} className="border-t border-slate-50 font-bold"><td className="p-4"><b>{i + 1}. {r.rider.name || r.rider.username}</b><p className="text-[10px] text-slate-400">{displayBranchName(r.rider.branch_name || r.rider.branch_id)}</p></td><td className="text-center">{r.cycle}</td><td className="text-center">{r.today}</td><td className="text-center font-black text-emerald-700">{r.done}</td><td className="text-center text-rose-700">{r.bad}</td><td className="text-center">{r.open}</td><td className="text-center text-amber-700">{r.overdue}</td><td className="text-center">{r.trips}</td><td className="text-center">{r.rate.toFixed(0)}%</td><td className="text-center">{Math.round(r.earnings).toLocaleString('ar-EG')} ج</td><td className="p-3"><button onClick={() => navigate(`/admin/riders/${r.rider.id}/performance`)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">فتح</button></td></tr>)}</tbody></table></div></section>

    <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">أحدث الأوردرات</h2><Activity className="text-sky-600"/></div><div className="grid gap-3 md:grid-cols-2">{filtered.slice(0, 20).map(o => { const r = riderMap.get(o.rider_id); return <article key={o.id} className="rounded-2xl border p-4"><div className="flex justify-between gap-3"><div><b>فاتورة {invoice(o) || 'بدون رقم'}</b><p className="mt-1 text-xs font-bold text-slate-500">{customer(o)} {customerCode(o) ? `· ${customerCode(o)}` : ''}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{r?.name || r?.username || 'مندوب غير محدد'} · {formatDateTime(o.registered_at || o.created_at)}</p></div><span className={`h-fit rounded-xl px-3 py-2 text-[11px] font-black ${delivered(o) ? 'bg-emerald-50 text-emerald-700' : failed(o) ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{delivered(o) ? 'تم' : failed(o) ? 'فشل' : 'مفتوح'}</span></div></article> })}</div></section><section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">ملخص سريع</h2><Star className="text-amber-500"/></div><div className="space-y-3"><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-black text-emerald-700">أفضل مندوب</p><b className="mt-1 block text-xl">{topRider?.rider.name || topRider?.rider.username || '—'}</b></div><div className="rounded-2xl bg-sky-50 p-4"><p className="text-xs font-black text-sky-700">إجمالي المشاوير</p><b className="mt-1 block text-2xl">{trips.length.toLocaleString('ar-EG')}</b></div><div className="rounded-2xl bg-violet-50 p-4"><p className="text-xs font-black text-violet-700">إجمالي قيمة الفواتير</p><b className="mt-1 block text-2xl">{Math.round(filtered.reduce((s, o) => s + num(o.invoice_amount), 0)).toLocaleString('ar-EG')} ج</b></div></div></section></section>
  </main>
}
