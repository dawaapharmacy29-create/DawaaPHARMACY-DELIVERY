import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Archive, CheckCircle2, FileCheck2, LockKeyhole, PackageCheck, RefreshCw, Route, ShieldCheck, Users } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import CycleSelector from '../../components/CycleSelector'
import { loadCanonicalDeliveryData } from '../../lib/canonicalDeliveryData'
import { isDelivered, isFailed, isMultiplier, num } from '../../lib/deliveryAnalytics'
import { cycleForDate, CYCLE_STATUS_LABELS, type DeliveryCycleStatus } from '../../lib/deliveryCycles'
import { supabase } from '../../lib/supabase'

type CycleDbRow = {
  id: string
  cycle_key: string
  cycle_label: string
  period_start: string
  period_end: string
  status: DeliveryCycleStatus
  reconciliation_status?: string | null
  reports_status?: string | null
  archive_status?: string | null
}

type RiderSummary = {
  riderId: string
  riderName: string
  branchName: string
  orders1x: number
  orders15x: number
  delivered: number
  failed: number
  approvedTrips: number
  rejectedTrips: number
  pendingTrips: number
  deliveredValue: number
}

const FINAL_ORDER_STATUSES = new Set(['delivered', 'failed', 'cancelled', 'canceled'])
const APPROVED_TRIP_STATUSES = new Set(['approved', 'completed', 'countable'])
const REJECTED_TRIP_STATUSES = new Set(['rejected', 'cancelled', 'canceled'])

function normalized(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function tripStatus(row: any) {
  return normalized(row.review_status || row.status)
}

function english(value: number) {
  return Number(value || 0).toLocaleString('en-US')
}

function money(value: number) {
  return `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م`
}

function statusTone(status: DeliveryCycleStatus) {
  if (status === 'locked' || status === 'archived') return 'bg-slate-900 text-white'
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800'
  if (status === 'under_review') return 'bg-amber-100 text-amber-800'
  return 'bg-teal-100 text-teal-800'
}

export default function CycleClosingCenter() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const initialCycle = useMemo(() => cycleForDate(), [])
  const selectedFrom = params.get('from') || initialCycle.start
  const selectedTo = params.get('to') || initialCycle.end
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])
  const [cycleRow, setCycleRow] = useState<CycleDbRow | null>(null)
  const [approvedReports, setApprovedReports] = useState(0)
  const [totalReports, setTotalReports] = useState(0)
  const [verifiedArchiveAssets, setVerifiedArchiveAssets] = useState(0)
  const [archiveAssets, setArchiveAssets] = useState(0)

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const canonical = await loadCanonicalDeliveryData(selectedFrom, selectedTo)
      setOrders(canonical.orders || [])
      setTrips(canonical.trips || [])
      setRiders(canonical.riders || [])

      const { data: cycleData, error: cycleError } = await supabase
        .from('delivery_cycles')
        .select('*')
        .eq('period_start', selectedFrom)
        .eq('period_end', selectedTo)
        .maybeSingle()

      if (!cycleError) {
        const row = (cycleData || null) as CycleDbRow | null
        setCycleRow(row)
        if (row?.id) {
          const [reportsResult, assetsResult] = await Promise.all([
            supabase.from('rider_cycle_reports').select('report_status').eq('cycle_id', row.id),
            supabase.from('delivery_cycle_archive_assets').select('verification_status').eq('cycle_id', row.id),
          ])
          const reports = reportsResult.data || []
          const assets = assetsResult.data || []
          setTotalReports(reports.length)
          setApprovedReports(reports.filter((item: any) => ['approved', 'locked'].includes(normalized(item.report_status))).length)
          setArchiveAssets(assets.length)
          setVerifiedArchiveAssets(assets.filter((item: any) => normalized(item.verification_status) === 'verified').length)
        } else {
          setTotalReports(0); setApprovedReports(0); setArchiveAssets(0); setVerifiedArchiveAssets(0)
        }
      } else {
        setCycleRow(null)
        setTotalReports(0); setApprovedReports(0); setArchiveAssets(0); setVerifiedArchiveAssets(0)
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'تعذر تحميل بيانات إغلاق الدورة')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedFrom, selectedTo])

  useEffect(() => { void load() }, [load])

  const summary = useMemo(() => {
    const deliveredOrders = orders.filter(isDelivered)
    const failedOrders = orders.filter(isFailed)
    const pendingOrders = orders.filter(order => !FINAL_ORDER_STATUSES.has(normalized(order.status)))
    const duplicates = orders.filter(order => Boolean(order.is_duplicate_invoice) || normalized(order.final_count_status).includes('duplicate'))
    const multiplierOrders = deliveredOrders.filter(isMultiplier)
    const oneOrders = deliveredOrders.filter(order => !isMultiplier(order))
    const approvedTrips = trips.filter(trip => APPROVED_TRIP_STATUSES.has(tripStatus(trip)) && trip.is_countable !== false && !trip.duplicate_of)
    const rejectedTrips = trips.filter(trip => REJECTED_TRIP_STATUSES.has(tripStatus(trip)) || trip.is_countable === false)
    const pendingTrips = trips.filter(trip => !APPROVED_TRIP_STATUSES.has(tripStatus(trip)) && !REJECTED_TRIP_STATUSES.has(tripStatus(trip)) && !trip.duplicate_of)
    const missingProofTrips = trips.filter(trip => !trip.duplicate_of && !String(trip.proof_image_path || trip.proof_image_url || '').trim())
    const deliveredValue = deliveredOrders.reduce((sum, order) => sum + num(order.invoice_amount ?? order.invoice_value ?? order.amount), 0)
    return {
      totalOrders: orders.length,
      deliveredOrders: deliveredOrders.length,
      failedOrders: failedOrders.length,
      pendingOrders: pendingOrders.length,
      duplicates: duplicates.length,
      oneOrders: oneOrders.length,
      multiplierOrders: multiplierOrders.length,
      totalTrips: trips.filter(trip => !trip.duplicate_of).length,
      approvedTrips: approvedTrips.length,
      rejectedTrips: rejectedTrips.length,
      pendingTrips: pendingTrips.length,
      missingProofTrips: missingProofTrips.length,
      deliveredValue,
    }
  }, [orders, trips])

  const riderRows = useMemo<RiderSummary[]>(() => {
    const riderMap = new Map(riders.map(rider => [String(rider.id), rider]))
    const ids = new Set<string>()
    orders.forEach(order => order.rider_id && ids.add(String(order.rider_id)))
    trips.forEach(trip => trip.rider_id && ids.add(String(trip.rider_id)))
    return [...ids].map(riderId => {
      const rider = riderMap.get(riderId) as any
      const riderOrders = orders.filter(order => String(order.rider_id) === riderId)
      const deliveredOrders = riderOrders.filter(isDelivered)
      const riderTrips = trips.filter(trip => String(trip.rider_id) === riderId && !trip.duplicate_of)
      return {
        riderId,
        riderName: rider?.name || rider?.username || riderOrders[0]?.rider_name || riderTrips[0]?.rider_name || 'دليفري غير محدد',
        branchName: rider?.branch_name || riderOrders[0]?.branch_name || riderTrips[0]?.branch_name || '—',
        orders1x: deliveredOrders.filter(order => !isMultiplier(order)).length,
        orders15x: deliveredOrders.filter(isMultiplier).length,
        delivered: deliveredOrders.length,
        failed: riderOrders.filter(isFailed).length,
        approvedTrips: riderTrips.filter(trip => APPROVED_TRIP_STATUSES.has(tripStatus(trip)) && trip.is_countable !== false).length,
        rejectedTrips: riderTrips.filter(trip => REJECTED_TRIP_STATUSES.has(tripStatus(trip)) || trip.is_countable === false).length,
        pendingTrips: riderTrips.filter(trip => !APPROVED_TRIP_STATUSES.has(tripStatus(trip)) && !REJECTED_TRIP_STATUSES.has(tripStatus(trip))).length,
        deliveredValue: deliveredOrders.reduce((sum, order) => sum + num(order.invoice_amount ?? order.invoice_value ?? order.amount), 0),
      }
    }).sort((a, b) => b.delivered - a.delivered || a.riderName.localeCompare(b.riderName, 'ar'))
  }, [orders, trips, riders])

  const blockers = useMemo(() => [
    { label: 'أوردرات بلا حالة نهائية', value: summary.pendingOrders, route: '/admin/reconciliation' },
    { label: 'مشاوير تنتظر قرارًا', value: summary.pendingTrips, route: '/admin/trips' },
    { label: 'مشاوير بدون إثبات', value: summary.missingProofTrips, route: '/admin/trips' },
    { label: 'فواتير مشتبه في تكرارها', value: summary.duplicates, route: '/admin/duplicate-invoices' },
  ], [summary])

  const readyForReports = blockers.every(item => item.value === 0)
  const reportsReady = totalReports > 0 && approvedReports === totalReports
  const archiveVerified = archiveAssets > 0 && verifiedArchiveAssets === archiveAssets
  const cycleStatus = cycleRow?.status || (selectedFrom === initialCycle.start && selectedTo === initialCycle.end ? 'open' : 'under_review')

  function applyPeriod(from: string, to: string) {
    const next = new URLSearchParams(params)
    next.set('from', from); next.set('to', to)
    setParams(next)
  }

  return <div className="space-y-5 p-1 text-right" dir="rtl">
    <section className="rounded-[32px] bg-gradient-to-l from-[#061827] to-[#008E92] p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-teal-100">مركز إغلاق دورة الدليفري</p>
          <h1 className="mt-1 text-3xl font-black">مراجعة، اعتماد وأرشفة الدورة</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold text-teal-50">بعد اكتمال المطابقة واعتماد تقارير المناديب يمكن أرشفة الصور وتحرير المساحة، مع الاحتفاظ بملخص مالي وتشغيلي ثابت.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-2xl px-4 py-2 text-sm font-black ${statusTone(cycleStatus)}`}>{CYCLE_STATUS_LABELS[cycleStatus]}</span>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><RefreshCw size={17} className={refreshing ? 'animate-spin' : ''}/> تحديث</button>
        </div>
      </div>
    </section>

    <CycleSelector from={selectedFrom} to={selectedTo} onApply={applyPeriod} />

    {error && <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 font-black text-rose-700">{error}</div>}
    {loading && <div className="rounded-3xl bg-white p-8 text-center font-black text-slate-500 shadow-sm">جاري تحميل بيانات الدورة كاملة...</div>}

    {!loading && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric icon={<PackageCheck/>} label="أوردرات ×1" value={summary.oneOrders} hint={`${summary.deliveredOrders} مسلّم`} />
        <Metric icon={<PackageCheck/>} label="أوردرات ×1.5" value={summary.multiplierOrders} hint="مسلمة ومحتسبة" tone="amber" />
        <Metric icon={<Route/>} label="مشاوير معتمدة" value={summary.approvedTrips} hint={`${summary.totalTrips} إجمالي`} tone="emerald" />
        <Metric icon={<AlertTriangle/>} label="مشاوير مرفوضة" value={summary.rejectedTrips} hint={`${summary.pendingTrips} تنتظر`} tone="rose" />
        <Metric icon={<Users/>} label="الدليفري النشطون" value={riderRows.length} hint="لهم حركة في الدورة" tone="sky" />
        <Metric icon={<FileCheck2/>} label="قيمة المسلّم" value={money(summary.deliveredValue)} hint={`${summary.failedOrders} أوردر فاشل`} tone="violet" />
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <StageCard number="1" title="المطابقة والمراجعة" complete={readyForReports} subtitle={readyForReports ? 'لا توجد عوائق ظاهرة' : `${blockers.reduce((sum, item) => sum + item.value, 0)} عنصر يحتاج قرارًا`} icon={<ShieldCheck/>} />
        <StageCard number="2" title="تقارير الدليفري" complete={reportsReady} subtitle={totalReports ? `${approvedReports} من ${totalReports} معتمدة` : 'لم تُنشأ Snapshots بعد'} icon={<FileCheck2/>} />
        <StageCard number="3" title="الأرشيف الخارجي" complete={archiveVerified} subtitle={archiveAssets ? `${verifiedArchiveAssets} من ${archiveAssets} تم التحقق منها` : 'لم يُسجل أرشيف الدورة بعد'} icon={<Archive/>} />
        <StageCard number="4" title="تحرير المساحة" complete={cycleStatus === 'archived' || cycleStatus === 'locked'} subtitle={archiveVerified && reportsReady ? 'يمكن تجهيز Dry Run للصور' : 'ممنوع الحذف قبل التقارير والأرشيف'} icon={<LockKeyhole/>} />
      </section>

      {!readyForReports && <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5">
        <div className="mb-3 flex items-center gap-2 font-black text-amber-900"><AlertTriangle size={20}/> عوائق تمنع اعتماد الدورة</div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {blockers.map(item => <button key={item.label} type="button" onClick={() => navigate(item.route)} className="flex items-center justify-between rounded-2xl bg-white p-4 text-right shadow-sm">
            <span className="font-black text-slate-700">{item.label}</span><span className={`rounded-full px-3 py-1 font-black ${item.value ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{english(item.value)}</span>
          </button>)}
        </div>
      </section>}

      <section className="overflow-hidden rounded-[30px] border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div><h2 className="text-xl font-black">تقرير الدورة حسب الدليفري</h2><p className="text-xs font-bold text-slate-400">الأساس الذي سيُحوّل لاحقًا إلى Snapshot معتمد قبل الأرشفة.</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => navigate(`/admin/reconciliation?from=${selectedFrom}&to=${selectedTo}`)} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black">فتح المطابقة</button><button type="button" onClick={() => navigate('/admin/cash-flow')} className="rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white">فتح الحساب الشهري</button></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4 text-right">الدليفري</th><th className="p-3">الفرع</th><th className="p-3">×1</th><th className="p-3">×1.5</th><th className="p-3">مسلم</th><th className="p-3">فاشل</th><th className="p-3">مشاوير معتمدة</th><th className="p-3">مرفوضة</th><th className="p-3">تنتظر</th><th className="p-3">قيمة المسلّم</th></tr></thead>
            <tbody>{riderRows.map(row => <tr key={row.riderId} className="border-t text-center hover:bg-slate-50"><td className="p-4 text-right"><button type="button" onClick={() => navigate(`/admin/riders/${row.riderId}/performance`)} className="font-black text-[#008E92] hover:underline">{row.riderName}</button></td><td className="p-3 text-slate-500">{row.branchName}</td><td className="p-3 font-black">{english(row.orders1x)}</td><td className="p-3 font-black text-amber-700">{english(row.orders15x)}</td><td className="p-3 text-emerald-700">{english(row.delivered)}</td><td className="p-3 text-rose-700">{english(row.failed)}</td><td className="p-3 font-black text-emerald-700">{english(row.approvedTrips)}</td><td className="p-3 text-rose-700">{english(row.rejectedTrips)}</td><td className={row.pendingTrips ? 'p-3 font-black text-amber-700' : 'p-3'}>{english(row.pendingTrips)}</td><td className="p-3 font-black">{money(row.deliveredValue)}</td></tr>)}
            {!riderRows.length && <tr><td colSpan={10} className="p-12 text-center font-bold text-slate-400">لا توجد حركة خلال الفترة المحددة.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
        <h2 className="font-black text-slate-800">قاعدة الأمان المعتمدة</h2>
        <p className="mt-2 text-sm font-bold leading-7 text-slate-600">لن يصبح حذف صور الدورة مسموحًا إلا بعد: إنهاء كل العوائق، إنشاء واعتماد تقرير كل دليفري، تصدير نسخة الدورة، وتسجيل أرشيف تم التحقق منه. حذف الأوردرات أو المشاوير التفصيلية يظل مرحلة لاحقة مستقلة بعد نجاح استعادة نسخة تجريبية.</p>
      </section>
    </>}
  </div>
}

function Metric({ icon, label, value, hint, tone = 'teal' }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint: string; tone?: 'teal' | 'amber' | 'emerald' | 'rose' | 'sky' | 'violet' }) {
  const tones = { teal: 'bg-teal-50 text-teal-700', amber: 'bg-amber-50 text-amber-700', emerald: 'bg-emerald-50 text-emerald-700', rose: 'bg-rose-50 text-rose-700', sky: 'bg-sky-50 text-sky-700', violet: 'bg-violet-50 text-violet-700' }
  return <div className="rounded-3xl border bg-white p-4 shadow-sm"><div className={`inline-flex rounded-2xl p-2 ${tones[tone]}`}>{icon}</div><p className="mt-3 text-xs font-black text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{typeof value === 'number' ? english(value) : value}</p><p className="mt-1 text-xs font-bold text-slate-400">{hint}</p></div>
}

function StageCard({ number, title, complete, subtitle, icon }: { number: string; title: string; complete: boolean; subtitle: string; icon: React.ReactNode }) {
  return <div className={`rounded-3xl border p-4 ${complete ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}><div className="flex items-start justify-between"><div className={`rounded-2xl p-2 ${complete ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{icon}</div><span className="text-2xl font-black text-slate-300">{number}</span></div><div className="mt-3 flex items-center gap-2"><h3 className="font-black text-slate-800">{title}</h3>{complete && <CheckCircle2 size={17} className="text-emerald-600"/>}</div><p className="mt-1 text-xs font-bold text-slate-500">{subtitle}</p></div>
}
