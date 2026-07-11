import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ClipboardCheck, FileText, RefreshCw, Search, ShieldAlert, TrendingUp, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getOperationalPeriod } from '../../lib/helpers'
import { aggregateCanonicalRiders, loadCanonicalDeliveryData } from '../../lib/canonicalDeliveryData'
import { riderPerformanceUrl, reconciliationUrl } from '../../lib/adminDrilldown'

const n = (v: unknown) => Number(v || 0) || 0
const pct = (v: number) => `${v.toFixed(2)}%`

function Card({ label, value, sub, icon, tone = 'emerald', onClick }: any) {
  const cls = { emerald: 'bg-emerald-50 border-emerald-100', sky: 'bg-sky-50 border-sky-100', amber: 'bg-amber-50 border-amber-100', rose: 'bg-rose-50 border-rose-100' }[tone as string]
  return <button onClick={onClick} className={`rounded-3xl border p-5 text-right shadow-sm ${cls}`}><div className="mb-3">{icon}</div><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-[#061827]">{value}</p><p className="mt-2 text-xs font-bold text-slate-500">{sub}</p></button>
}

export default function ExecutiveDashboardUnified() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await loadCanonicalDeliveryData(period.start, period.end)
      setRows(aggregateCanonicalRiders(data).filter(row => row.total_orders || row.trips))
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل لوحة الإدارة العليا')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const summary = useMemo(() => rows.reduce((a, r) => ({
    total: a.total + n(r.total_orders), registered: a.registered + n(r.registered_orders), delivered: a.delivered + n(r.delivered_orders),
    multiplier: a.multiplier + n(r.multiplier_orders), duplicate: a.duplicate + n(r.duplicate_orders), failed: a.failed + n(r.failed_orders),
    pending: a.pending + n(r.pending_reconciliation_orders), review: a.review + n(r.review_orders), uncounted: a.uncounted + n(r.uncounted_orders)
  }), { total: 0, registered: 0, delivered: 0, multiplier: 0, duplicate: 0, failed: 0, pending: 0, review: 0, uncounted: 0 }), [rows])

  const filtered = rows.filter(r => !search.trim() || [r.rider_name, r.branch_name].some(v => String(v || '').includes(search.trim())))
  const operationRate = summary.total ? summary.registered / summary.total * 100 : 0
  const deliveryRate = summary.total ? summary.delivered / summary.total * 100 : 0

  return <div className="space-y-5 p-4" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border bg-white p-5 shadow-sm"><div><button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 font-black"><ArrowRight size={16}/> رجوع</button><h1 className="text-3xl font-black">لوحة الإدارة العليا</h1><p className="text-xs font-bold text-slate-400">مصدر موحد مباشر · {period.start} → {period.end}</p></div><button onClick={load} disabled={loading} className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white"><RefreshCw className={loading ? 'animate-spin' : ''}/></button></header>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Card label="إجمالي أوردرات الدورة" value={loading ? '—' : summary.total} sub={`${rows.length} دليفري`} icon={<ClipboardCheck/>} onClick={() => navigate(reconciliationUrl({ from: period.start, to: period.end }))}/>
      <Card label="نسبة التشغيل" value={pct(operationRate)} sub={`${summary.registered} مسجل`} icon={<TrendingUp/>} tone="sky"/>
      <Card label="تم التسليم" value={summary.delivered} sub={pct(deliveryRate)} icon={<CheckCircle2/>}/>
      <Card label="مستني مطابقة" value={summary.pending} sub="من كامل الدورة" icon={<FileText/>} tone="amber"/>
      <Card label="مراجعة فنية" value={summary.review} sub="تحتاج قرار" icon={<ShieldAlert/>} tone="rose"/>
    </section>

    <section className="grid gap-4 md:grid-cols-4"><Card label="1.5x" value={summary.multiplier} sub="أوردرات مضاعفة" icon={<TrendingUp/>} tone="sky"/><Card label="مكرر" value={summary.duplicate} sub="فواتير مكررة" icon={<ShieldAlert/>} tone="amber"/><Card label="فشل" value={summary.failed} sub="أوردرات فاشلة" icon={<XCircle/>} tone="rose"/><Card label="غير محتسب" value={summary.uncounted} sub="مستبعد" icon={<FileText/>} tone="rose"/></section>

    <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">جدول تحكم الفريق</h2><p className="text-xs font-bold text-slate-400">نفس الأرقام المعروضة في تقرير الأداء</p></div><div className="relative"><Search className="absolute right-3 top-3 text-slate-400" size={18}/><input value={search} onChange={e => setSearch(e.target.value)} className="rounded-2xl border bg-slate-50 py-3 pr-10 pl-3" placeholder="ابحث باسم الدليفري أو الفرع"/></div></div><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-slate-50"><tr><th className="p-3">الدليفري</th><th>الفرع</th><th>الإجمالي</th><th>تم</th><th>1.5x</th><th>مكرر</th><th>فشل</th><th>مستني</th><th>مراجعة</th><th>خطر</th></tr></thead><tbody>{filtered.map(r => <tr key={r.rider_id} className="border-t"><td className="p-3"><button onClick={() => navigate(riderPerformanceUrl(r.rider_id))} className="font-black text-teal-700">{r.rider_name}</button></td><td>{r.branch_name}</td><td className="font-black">{r.total_orders}</td><td className="font-black text-emerald-700">{r.delivered_orders}</td><td>{r.multiplier_orders}</td><td>{r.duplicate_orders}</td><td>{r.failed_orders}</td><td>{r.pending_reconciliation_orders}</td><td>{r.review_orders}</td><td>{pct(n(r.risk_rate))}</td></tr>)}</tbody></table></div></section>
  </div>
}
