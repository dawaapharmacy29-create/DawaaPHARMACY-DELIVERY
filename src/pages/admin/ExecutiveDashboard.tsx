import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { displayBranchName } from '../../lib/branchUtils'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'

type ScoreRow = {
  rider_id: string | null
  rider_name: string | null
  branch_id: string | null
  branch_name: string | null
  total_orders: number | string | null
  registered_orders: number | string | null
  delivered_orders: number | string | null
  multiplier_orders: number | string | null
  duplicate_orders: number | string | null
  failed_orders: number | string | null
  pending_reconciliation_orders: number | string | null
  review_orders: number | string | null
  uncounted_orders: number | string | null
  risk_rate: number | string | null
  accuracy_score: number | string | null
  operation_rate: number | string | null
  delivery_rate: number | string | null
}

type QualityRow = {
  orders_without_branch?: number | string | null
  orders_without_rider?: number | string | null
  orders_without_invoice?: number | string | null
  non_canonical_branch_names?: number | string | null
  pending_reconciliation_orders?: number | string | null
  real_review_orders?: number | string | null
  duplicate_invoices?: number | string | null
  failed_orders?: number | string | null
}

type EventRow = { event_type?: string | null; amount?: number | string | null }

const num = (value: unknown) => Number(value || 0) || 0
const pct = (value: unknown) => `${num(value).toFixed(2)}%`

function scoreTone(value: number, reverse = false) {
  if (reverse) {
    if (value >= 20) return 'text-rose-700 bg-rose-50 border-rose-100'
    if (value >= 10) return 'text-amber-700 bg-amber-50 border-amber-100'
    return 'text-emerald-700 bg-emerald-50 border-emerald-100'
  }
  if (value >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-100'
  if (value >= 75) return 'text-amber-700 bg-amber-50 border-amber-100'
  return 'text-rose-700 bg-rose-50 border-rose-100'
}

function StatCard({ label, value, sub, icon, tone = 'emerald' }: {
  label: string
  value: string | number
  sub?: string
  icon: ReactNode
  tone?: 'emerald' | 'rose' | 'amber' | 'sky' | 'purple' | 'slate'
}) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    slate: 'bg-white text-slate-700 border-slate-100',
  }
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${tones[tone]}`}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70">{icon}</div>
      <p className="text-xs font-black opacity-70">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#061827]">{value}</p>
      {sub && <p className="mt-2 text-xs font-bold opacity-75">{sub}</p>}
    </div>
  )
}

function MiniBars({ title, rows }: { title: string; rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-base font-black text-[#061827]">{title}</h3>
      <div className="space-y-3">
        {rows.length ? rows.map(r => (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs font-black text-slate-600">
              <span>{r.label}</span>
              <span>{r.value}{r.sub ? ` ${r.sub}` : ''}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
            </div>
          </div>
        )) : <p className="py-8 text-center text-sm font-bold text-slate-400">لا توجد بيانات كافية</p>}
      </div>
    </div>
  )
}

function Pill({ value, reverse = false }: { value: number; reverse?: boolean }) {
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${scoreTone(value, reverse)}`}>{value.toFixed(2)}%</span>
}

export default function ExecutiveDashboard() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [scoreRows, setScoreRows] = useState<ScoreRow[]>([])
  const [quality, setQuality] = useState<QualityRow | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])

  async function load() {
    setLoading(true)
    try {
      const [scoreRes, qualityRes, eventsRes] = await Promise.allSettled([
        supabase.from('delivery_rider_cycle_scorecard').select('*').order('total_orders', { ascending: false }),
        supabase.from('delivery_data_quality_dashboard').select('*').maybeSingle(),
        supabase.from('rider_compensation_events').select('event_type, amount').gte('event_date', period.start).lte('event_date', period.end),
      ])

      if (scoreRes.status === 'fulfilled') {
        const { data, error } = scoreRes.value as any
        if (error) throw error
        setScoreRows(data || [])
      }

      if (qualityRes.status === 'fulfilled') {
        const { data } = qualityRes.value as any
        setQuality(data || null)
      }

      if (eventsRes.status === 'fulfilled') {
        const { data } = eventsRes.value as any
        setEvents(data || [])
      } else {
        setEvents([])
      }
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل غرفة التحكم التنفيذية')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const summary = useMemo(() => {
    const totals = scoreRows.reduce((acc, r) => {
      acc.total += num(r.total_orders)
      acc.registered += num(r.registered_orders)
      acc.delivered += num(r.delivered_orders)
      acc.multiplier += num(r.multiplier_orders)
      acc.duplicate += num(r.duplicate_orders)
      acc.failed += num(r.failed_orders)
      acc.pending += num(r.pending_reconciliation_orders)
      acc.review += num(r.review_orders)
      acc.uncounted += num(r.uncounted_orders)
      return acc
    }, { total: 0, registered: 0, delivered: 0, multiplier: 0, duplicate: 0, failed: 0, pending: 0, review: 0, uncounted: 0 })

    const positives = events.filter(e => e.event_type !== 'deduction').reduce((sum, e) => sum + Math.abs(num(e.amount)), 0)
    const deductions = events.filter(e => e.event_type === 'deduction').reduce((sum, e) => sum + Math.abs(num(e.amount)), 0)

    return {
      ...totals,
      operationRate: totals.total ? (totals.registered / totals.total) * 100 : 0,
      deliveryRate: totals.total ? (totals.delivered / totals.total) * 100 : 0,
      avgAccuracy: scoreRows.length ? scoreRows.reduce((s, r) => s + num(r.accuracy_score), 0) / scoreRows.length : 0,
      avgRisk: scoreRows.length ? scoreRows.reduce((s, r) => s + num(r.risk_rate), 0) / scoreRows.length : 0,
      positives,
      deductions,
    }
  }, [scoreRows, events])

  const filteredRows = scoreRows.filter(r => {
    const q = search.trim()
    if (!q) return true
    return [r.rider_name, r.branch_name].some(v => String(v || '').includes(q))
  })

  const branchRows = Object.values(scoreRows.reduce((acc: Record<string, { label: string; value: number }>, r) => {
    const label = displayBranchName(r.branch_name)
    acc[label] ||= { label, value: 0 }
    acc[label].value += num(r.total_orders)
    return acc
  }, {})).sort((a, b) => b.value - a.value)

  const riskRows = [...scoreRows]
    .sort((a, b) => num(b.risk_rate) - num(a.risk_rate))
    .slice(0, 6)
    .map(r => ({ label: r.rider_name || 'غير محدد', value: Number(num(r.risk_rate).toFixed(2)), sub: '%' }))

  const qualityRows = [
    { label: 'بدون فرع', value: num(quality?.orders_without_branch) },
    { label: 'بدون دليفري', value: num(quality?.orders_without_rider) },
    { label: 'بدون فاتورة', value: num(quality?.orders_without_invoice) },
    { label: 'أسماء فروع قديمة', value: num(quality?.non_canonical_branch_names) },
    { label: 'مكررة', value: num(quality?.duplicate_invoices) },
    { label: 'فاشلة', value: num(quality?.failed_orders) },
  ]

  return (
    <div className="min-h-screen bg-[#F3F7F8] p-4 text-right" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border bg-white p-5 shadow-sm">
          <div>
            <button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-600">
              <ArrowRight size={16}/> رجوع
            </button>
            <p className="text-sm font-black text-emerald-600">غرفة التحكم التنفيذية V4</p>
            <h1 className="mt-1 text-3xl font-black text-[#061827]">لوحة قيادة الدليفري والمطابقة والمخاطر</h1>
            <p className="mt-1 text-xs font-bold text-slate-400">الدورة: {period.start} → {period.end} • المصدر الرسمي: delivery_rider_cycle_scorecard</p>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-sm disabled:opacity-60">
            <RefreshCw className={loading ? 'animate-spin' : ''} size={18}/> تحديث
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="إجمالي أوردرات الدورة" value={summary.total} sub={`${scoreRows.length} دليفري`} icon={<ClipboardCheck/>}/>
          <StatCard label="نسبة التشغيل" value={pct(summary.operationRate)} sub={`${summary.registered} مسجل`} icon={<TrendingUp/>} tone="sky"/>
          <StatCard label="نسبة الدقة" value={pct(summary.avgAccuracy)} sub={`متوسط الخطر ${pct(summary.avgRisk)}`} icon={<CheckCircle2/>} tone="emerald"/>
          <StatCard label="مستني مطابقة" value={summary.pending} sub="Pending عادي" icon={<FileText/>} tone="amber"/>
          <StatCard label="مراجعة فعلية" value={summary.review} sub="تحتاج قرار إداري" icon={<ShieldAlert/>} tone={summary.review ? 'rose' : 'slate'}/>
          <StatCard label="صافي التسويات" value={formatMoney(summary.positives - summary.deductions)} sub={`مكافآت ${formatMoney(summary.positives)} • خصومات ${formatMoney(summary.deductions)}`} icon={<Wallet/>} tone="purple"/>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="تم التسليم" value={summary.delivered} sub={pct(summary.deliveryRate)} icon={<CheckCircle2/>} tone="emerald"/>
          <StatCard label="أوردرات ×1.5" value={summary.multiplier} sub="أماكن بعيدة أو تكرار زيارة" icon={<BarChart3/>} tone="sky"/>
          <StatCard label="مكرر" value={summary.duplicate} sub="فاتورة مكررة" icon={<AlertTriangle/>} tone={summary.duplicate ? 'rose' : 'slate'}/>
          <StatCard label="فاشل" value={summary.failed} sub="لا يحتسب تلقائيًا" icon={<XCircle/>} tone={summary.failed ? 'rose' : 'slate'}/>
          <StatCard label="غير محتسب" value={summary.uncounted} sub="فاشل أو مستبعد يدويًا" icon={<Users/>} tone={summary.uncounted ? 'rose' : 'slate'}/>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <MiniBars title="الأوردرات حسب الفرع" rows={branchRows}/>
          <MiniBars title="أعلى الدليفري حسب مؤشر الخطر" rows={riskRows}/>
          <MiniBars title="فحص جودة البيانات" rows={qualityRows}/>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#061827]">جدول تحكم الفريق</h2>
              <p className="mt-1 text-xs font-bold text-slate-400">التشغيل هو المؤشر الأساسي، والتسليم مؤشر مساعد حسب حالة الأوردر في النظام.</p>
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="absolute right-4 top-3 text-slate-400" size={18}/>
              <input value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-2xl border bg-slate-50 py-3 pr-11 font-bold outline-none focus:border-emerald-300" placeholder="ابحث باسم الدليفري أو الفرع"/>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-500">
                <tr>
                  <th className="p-3">الدليفري</th>
                  <th className="p-3">الفرع</th>
                  <th className="p-3">الإجمالي</th>
                  <th className="p-3">مسجل</th>
                  <th className="p-3">تم التسليم</th>
                  <th className="p-3">×1.5</th>
                  <th className="p-3">مكرر</th>
                  <th className="p-3">فاشل</th>
                  <th className="p-3">مستني مطابقة</th>
                  <th className="p-3">مراجعة فعلية</th>
                  <th className="p-3">غير محتسب</th>
                  <th className="p-3">التشغيل</th>
                  <th className="p-3">التسليم</th>
                  <th className="p-3">الدقة</th>
                  <th className="p-3">الخطر</th>
                  <th className="p-3">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <tr key={`${r.rider_id}-${r.branch_id}`} className="border-t hover:bg-slate-50">
                    <td className="p-3 font-black text-[#061827]">{r.rider_name || 'غير محدد'}</td>
                    <td className="p-3 font-bold text-slate-500">{displayBranchName(r.branch_name)}</td>
                    <td className="p-3 font-black">{num(r.total_orders)}</td>
                    <td className="p-3">{num(r.registered_orders)}</td>
                    <td className="p-3 text-emerald-700 font-black">{num(r.delivered_orders)}</td>
                    <td className="p-3">{num(r.multiplier_orders)}</td>
                    <td className="p-3 text-amber-700 font-black">{num(r.duplicate_orders)}</td>
                    <td className="p-3 text-rose-700 font-black">{num(r.failed_orders)}</td>
                    <td className="p-3 text-amber-700 font-black">{num(r.pending_reconciliation_orders)}</td>
                    <td className="p-3 text-rose-700 font-black">{num(r.review_orders)}</td>
                    <td className="p-3">{num(r.uncounted_orders)}</td>
                    <td className="p-3"><Pill value={num(r.operation_rate)}/></td>
                    <td className="p-3"><Pill value={num(r.delivery_rate)}/></td>
                    <td className="p-3"><Pill value={num(r.accuracy_score)}/></td>
                    <td className="p-3"><Pill value={num(r.risk_rate)} reverse/></td>
                    <td className="p-3"><button onClick={() => r.rider_id && navigate(`/admin/riders/${r.rider_id}/performance`)} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">فتح التقرير</button></td>
                  </tr>
                ))}
                {!filteredRows.length && <tr><td colSpan={16} className="p-10 text-center font-bold text-slate-400">لا توجد بيانات مطابقة للبحث</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="mb-3 font-black text-[#061827]">قرارات اليوم المقترحة</h3><ul className="space-y-2 text-sm font-bold text-slate-600"><li>راجع أي أوردر مكرر قبل احتسابه.</li><li>مستني مطابقة ليس خطأ، لكنه يحتاج رفع ملف السيستم.</li><li>أي مراجعة فعلية يجب اعتمادها أو رفضها قبل قفل الدورة.</li></ul></div>
          <div className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="mb-3 font-black text-[#061827]">قواعد المؤشرات</h3><ul className="space-y-2 text-sm font-bold text-slate-600"><li>التشغيل = registered / total.</li><li>التسليم = delivered / total.</li><li>الدقة = 100 - متوسط خطر الأوردرات.</li></ul></div>
          <div className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="mb-3 font-black text-[#061827]">قبل قفل الشهر</h3><ul className="space-y-2 text-sm font-bold text-slate-600"><li>اعتمد المكرر الصحيح أو ارفضه.</li><li>راجع الفاشل وغير المحتسب.</li><li>صدّر PDF لكل دليفري من صفحة التقرير.</li></ul></div>
        </section>
      </div>
    </div>
  )
}
