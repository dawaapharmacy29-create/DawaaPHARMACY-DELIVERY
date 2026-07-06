import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ClipboardCheck, FileText, Gift, RefreshCw, Search, ShieldAlert, TrendingUp, Users, Wallet, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { displayBranchName } from '../../lib/branchUtils'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'
import { customersUrl, duplicateInvoicesUrl, reconciliationUrl, riderPerformanceUrl } from '../../lib/adminDrilldown'

type ScoreRow = {
  rider_id: string | null
  rider_name: string | null
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
  duplicate_invoices?: number | string | null
  failed_orders?: number | string | null
}

type EventRow = { event_type?: string | null; amount?: number | string | null }
const num = (value: unknown) => Number(value || 0) || 0
const pct = (value: unknown) => `${num(value).toFixed(2)}%`

function StatCard({ label, value, sub, icon, tone = 'emerald', onClick }: {
  label: string
  value: string | number
  sub?: string
  icon: ReactNode
  tone?: 'emerald' | 'rose' | 'amber' | 'sky' | 'purple' | 'slate'
  onClick: () => void
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
    <button type="button" onClick={onClick} title="اضغط للتفاصيل" className={`w-full rounded-3xl border p-5 text-right shadow-sm ${tones[tone]} cursor-pointer transition hover:-translate-y-0.5 hover:shadow-lg`}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70">{icon}</div>
      <p className="text-xs font-black opacity-70">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#061827]">{value}</p>
      {sub && <p className="mt-2 text-xs font-bold opacity-75">{sub}</p>}
      <p className="mt-2 text-[11px] font-black opacity-70">اضغط للتفاصيل</p>
    </button>
  )
}

function MiniBars({ title, rows, onPick }: {
  title: string
  rows: { label: string; value: number; sub?: string; id?: string }[]
  onPick: (row: { label: string; value: number; sub?: string; id?: string }) => void
}) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-base font-black text-[#061827]">{title}</h3>
      <div className="space-y-3">
        {rows.length ? rows.map(row => (
          <button key={`${row.label}-${row.id || ''}`} type="button" onClick={() => onPick(row)} title="اضغط للتفاصيل" className="block w-full cursor-pointer rounded-2xl p-2 text-right transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-lg">
            <div className="mb-1 flex items-center justify-between gap-3 text-xs font-black text-slate-600">
              <span>{row.label}</span>
              <span>{row.value}{row.sub ? ` ${row.sub}` : ''}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
            </div>
            <p className="mt-1 text-[10px] font-bold text-slate-400">اضغط للتفاصيل</p>
          </button>
        )) : <p className="py-8 text-center text-sm font-bold text-slate-400">لا توجد بيانات كافية</p>}
      </div>
    </div>
  )
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
      if (qualityRes.status === 'fulfilled') setQuality((qualityRes.value as any).data || null)
      if (eventsRes.status === 'fulfilled') setEvents((eventsRes.value as any).data || [])
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل لوحة الإدارة العليا')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const summary = useMemo(() => {
    const totals = scoreRows.reduce((acc, row) => {
      acc.total += num(row.total_orders)
      acc.registered += num(row.registered_orders)
      acc.delivered += num(row.delivered_orders)
      acc.multiplier += num(row.multiplier_orders)
      acc.duplicate += num(row.duplicate_orders)
      acc.failed += num(row.failed_orders)
      acc.pending += num(row.pending_reconciliation_orders)
      acc.review += num(row.review_orders)
      acc.uncounted += num(row.uncounted_orders)
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

  const filteredRows = scoreRows.filter(row => {
    const q = search.trim()
    if (!q) return true
    return [row.rider_name, row.branch_name].some(value => String(value || '').includes(q))
  })

  const branchRows = Object.values(scoreRows.reduce((acc: Record<string, { label: string; value: number }>, row) => {
    const label = displayBranchName(row.branch_name)
    acc[label] ||= { label, value: 0 }
    acc[label].value += num(row.total_orders)
    return acc
  }, {})).sort((a, b) => b.value - a.value)

  const riskRows = [...scoreRows]
    .sort((a, b) => num(b.risk_rate) - num(a.risk_rate))
    .slice(0, 6)
    .map(row => ({ label: row.rider_name || 'غير محدد', value: Number(num(row.risk_rate).toFixed(2)), sub: '%', id: row.rider_id || undefined }))

  const qualityRows = [
    { label: 'بدون فرع', value: num(quality?.orders_without_branch), id: 'missing_branch' },
    { label: 'بدون دليفري', value: num(quality?.orders_without_rider), id: 'missing_rider' },
    { label: 'بدون فاتورة', value: num(quality?.orders_without_invoice), id: 'missing_invoice' },
    { label: 'أسماء عربية ضعيفة', value: num(quality?.non_canonical_branch_names), id: 'bad_names' },
    { label: 'مكرر', value: num(quality?.duplicate_invoices), id: 'duplicate' },
    { label: 'فشل', value: num(quality?.failed_orders), id: 'failed' },
  ]

  return (
    <div className="p-4 text-right" dir="rtl">
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border bg-white p-5 shadow-sm">
          <div>
            <button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-600">
              <ArrowRight size={16}/> رجوع
            </button>
            <p className="text-sm font-black text-emerald-600">غرفة التحكم التنفيذية</p>
            <h1 className="mt-1 text-3xl font-black text-[#061827]">لوحة الإدارة العليا</h1>
            <p className="mt-1 text-xs font-bold text-slate-400">الدورة: {period.start} → {period.end}</p>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-sm disabled:opacity-60">
            <RefreshCw className={loading ? 'animate-spin' : ''} size={18}/> تحديث
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="إجمالي أوردرات الدورة" value={summary.total} sub={`${scoreRows.length} دليفري`} icon={<ClipboardCheck/>} onClick={() => navigate(reconciliationUrl({ from: period.start, to: period.end }))}/>
          <StatCard label="نسبة التشغيل" value={pct(summary.operationRate)} sub={`${summary.registered} مسجل`} icon={<TrendingUp/>} tone="sky" onClick={() => navigate(reconciliationUrl({ status: 'registered', from: period.start, to: period.end }))}/>
          <StatCard label="نسبة الثقة" value={pct(summary.avgAccuracy)} sub={`متوسط الخطر ${pct(summary.avgRisk)}`} icon={<CheckCircle2/>} onClick={() => navigate(reconciliationUrl({ filter: 'matched', from: period.start, to: period.end }))}/>
          <StatCard label="مستني مطابقة" value={summary.pending} sub="Pending" icon={<FileText/>} tone="amber" onClick={() => navigate(reconciliationUrl({ review_status: 'pending', from: period.start, to: period.end }))}/>
          <StatCard label="مراجعة فنية" value={summary.review} sub="تحتاج قرار إداري" icon={<ShieldAlert/>} tone={summary.review ? 'rose' : 'slate'} onClick={() => navigate(reconciliationUrl({ review_status: 'technical_review', from: period.start, to: period.end }))}/>
          <StatCard label="صافي التسويات" value={formatMoney(summary.positives - summary.deductions)} sub={`مكافآت ${formatMoney(summary.positives)} • خصومات ${formatMoney(summary.deductions)}`} icon={<Wallet/>} tone="purple" onClick={() => navigate('/admin/cash-flow?source=delivery_adjustments')}/>
        </section>

        <button onClick={() => navigate('/penalty-incentive?quick=1')} type="button" className="w-full rounded-3xl border border-purple-200 bg-gradient-to-l from-purple-50 to-purple-100/50 p-6 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black text-purple-600">إدارة الموارد البشرية</p>
              <h3 className="mt-2 text-2xl font-black text-[#061827]">خصم / مكافأة سريع</h3>
              <p className="mt-2 text-sm font-bold text-slate-600">تسجيل خصم أو مكافأة لموظف أو دليفري وإرسالها للاعتماد</p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-purple-200">
              <Gift className="text-purple-700" size={28} />
            </div>
          </div>
        </button>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="تم التسليم" value={summary.delivered} sub={pct(summary.deliveryRate)} icon={<CheckCircle2/>} onClick={() => navigate(reconciliationUrl({ status: 'delivered', from: period.start, to: period.end }))}/>
          <StatCard label="أوردرات 1.5x" value={summary.multiplier} sub="أوردرات مضاعفة" icon={<BarChart3/>} tone="sky" onClick={() => navigate(reconciliationUrl({ multiplier: '1.5', from: period.start, to: period.end }))}/>
          <StatCard label="مكرر" value={summary.duplicate} sub="فواتير مكررة" icon={<AlertTriangle/>} tone={summary.duplicate ? 'rose' : 'slate'} onClick={() => navigate(duplicateInvoicesUrl({ status: 'pending', from: period.start, to: period.end }))}/>
          <StatCard label="فشل" value={summary.failed} sub="أوردرات فاشلة" icon={<XCircle/>} tone={summary.failed ? 'rose' : 'slate'} onClick={() => navigate(reconciliationUrl({ status: 'failed', from: period.start, to: period.end }))}/>
          <StatCard label="غير محتسب" value={summary.uncounted} sub="مستبعد من الاحتساب" icon={<Users/>} tone={summary.uncounted ? 'rose' : 'slate'} onClick={() => navigate(reconciliationUrl({ countable: false, from: period.start, to: period.end }))}/>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <MiniBars title="الأوردرات حسب الفرع" rows={branchRows} onPick={(row) => navigate(reconciliationUrl({ branch: row.label, from: period.start, to: period.end }))}/>
          <MiniBars title="أعلى الدليفري حسب مؤشر الخطر" rows={riskRows} onPick={(row) => navigate(riderPerformanceUrl(row.id))}/>
          <MiniBars title="فحص جودة البيانات" rows={qualityRows} onPick={(row) => {
            if (row.id === 'bad_names') navigate(customersUrl({ issue: 'bad_names' }))
            else navigate(reconciliationUrl({ issue: row.id, from: period.start, to: period.end }))
          }}/>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#061827]">جدول تحكم الفريق</h2>
              <p className="mt-1 text-xs font-bold text-slate-400">كل اسم دليفري يفتح تقريره التفصيلي.</p>
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="absolute right-4 top-3 text-slate-400" size={18}/>
              <input value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-2xl border bg-slate-50 py-3 pr-11 font-bold outline-none focus:border-emerald-300" placeholder="ابحث باسم الدليفري أو الفرع"/>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-500">
                <tr>
                  <th className="p-3">الدليفري</th>
                  <th className="p-3">الفرع</th>
                  <th className="p-3">الإجمالي</th>
                  <th className="p-3">تم التسليم</th>
                  <th className="p-3">1.5x</th>
                  <th className="p-3">مكرر</th>
                  <th className="p-3">فشل</th>
                  <th className="p-3">مستني مطابقة</th>
                  <th className="p-3">مراجعة</th>
                  <th className="p-3">خطر</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={`${row.rider_id}-${row.branch_name}`} className="border-t hover:bg-slate-50">
                    <td className="p-3">
                      <button type="button" onClick={() => navigate(riderPerformanceUrl(row.rider_id))} className="cursor-pointer font-black text-[#061827] underline-offset-4 hover:underline">{row.rider_name || 'غير محدد'}</button>
                    </td>
                    <td className="p-3 font-bold text-slate-500">{displayBranchName(row.branch_name)}</td>
                    <td className="p-3 font-black">{num(row.total_orders)}</td>
                    <td className="p-3 text-emerald-700 font-black">{num(row.delivered_orders)}</td>
                    <td className="p-3">{num(row.multiplier_orders)}</td>
                    <td className="p-3 text-amber-700 font-black">{num(row.duplicate_orders)}</td>
                    <td className="p-3 text-rose-700 font-black">{num(row.failed_orders)}</td>
                    <td className="p-3 text-amber-700 font-black">{num(row.pending_reconciliation_orders)}</td>
                    <td className="p-3 text-rose-700 font-black">{num(row.review_orders)}</td>
                    <td className="p-3">{pct(row.risk_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
