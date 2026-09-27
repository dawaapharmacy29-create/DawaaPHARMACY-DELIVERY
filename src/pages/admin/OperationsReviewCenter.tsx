import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CopyCheck, FileQuestion, GitCompareArrows, LockKeyhole, Route, ShieldCheck } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import OperationsAdminTabs from '../../components/OperationsAdminTabs'
import CycleSelector from '../../components/CycleSelector'
import { getOperationalPeriod } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'

type Counts = {
  pendingOrders: number
  notFound: number
  duplicatePending: number
  duplicateExcluded: number
  failed: number
  pendingTrips: number
  tripsWithoutInvoice: number
}

function QueueCard({ title, text, value, to, icon, tone = 'amber' }: { title: string; text: string; value: number | string; to: string; icon: JSX.Element; tone?: 'amber'|'rose'|'teal'|'slate' }) {
  const navigate = useNavigate()
  const tones = {
    amber: 'border-amber-100 bg-amber-50 text-amber-900',
    rose: 'border-rose-100 bg-rose-50 text-rose-900',
    teal: 'border-teal-100 bg-teal-50 text-teal-900',
    slate: 'border-slate-200 bg-white text-slate-900',
  }
  return <button type="button" onClick={() => navigate(to)} className={`rounded-[1.6rem] border p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[tone]}`}>
    <div className="flex items-center justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 shadow-sm">{icon}</span><span className="text-3xl font-black">{value}</span></div>
    <h2 className="mt-3 font-black">{title}</h2><p className="mt-1 text-xs font-bold leading-5 opacity-70">{text}</p>
  </button>
}

export default function OperationsReviewCenter() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const period = useMemo(() => getOperationalPeriod(), [])
  const selectedFrom = searchParams.get('from') || selectedFrom
  const selectedTo = searchParams.get('to') || selectedTo
  const [counts,setCounts] = useState<Counts>({pendingOrders:0,notFound:0,duplicatePending:0,duplicateExcluded:0,failed:0,pendingTrips:0,tripsWithoutInvoice:0})
  const [loading,setLoading] = useState(true)

  useEffect(() => {
    let alive=true
    async function load(){
      setLoading(true)
      try{
        const [ordersRes,tripsRes] = await Promise.allSettled([
          supabase.from('delivery_orders').select('final_count_status,status,is_countable,is_duplicate_invoice,deleted_at').gte('delivery_date',selectedFrom).lte('delivery_date',selectedTo).is('deleted_at',null),
          supabase.from('internal_trips').select('status,review_status,has_invoice_reference,related_invoice_number,duplicate_of').gte('trip_date',selectedFrom).lte('trip_date',selectedTo),
        ])
        if(!alive)return
        const orders = ordersRes.status==='fulfilled' ? (ordersRes.value.data||[]) as any[] : []
        const trips = tripsRes.status==='fulfilled' ? (tripsRes.value.data||[]) as any[] : []
        const status=(row:any)=>String(row.final_count_status||'')
        setCounts({
          pendingOrders: orders.filter(row => status(row).startsWith('pending')).length,
          notFound: orders.filter(row => status(row)==='excluded_invoice_not_found').length,
          duplicatePending: orders.filter(row => status(row)==='pending_duplicate_review').length,
          duplicateExcluded: orders.filter(row => status(row)==='excluded_duplicate_already_counted').length,
          failed: orders.filter(row => status(row)==='excluded_failed' || String(row.status||'')==='failed').length,
          pendingTrips: trips.filter(row => ['pending','pending_approval',''].includes(String(row.review_status||row.status||''))).length,
          tripsWithoutInvoice: trips.filter(row => !row.duplicate_of && row.has_invoice_reference===false && !String(row.related_invoice_number||'').trim()).length,
        })
      } finally { if(alive)setLoading(false) }
    }
    void load()
    return()=>{alive=false}
  },[selectedFrom,selectedTo])

  function applyCycle(from: string, to: string) {
    const next = new URLSearchParams(searchParams)
    next.set('from', from)
    next.set('to', to)
    setSearchParams(next, { replace: true })
  }

  const withCycle = (path: string) => {
    const separator = path.includes('?') ? '&' : '?'
    return `${path}${separator}from=${encodeURIComponent(selectedFrom)}&to=${encodeURIComponent(selectedTo)}`
  }

  const decisionTotal = counts.pendingOrders + counts.pendingTrips
  return <div className="space-y-5" dir="rtl">
    <OperationsAdminTabs />
    <CycleSelector from={selectedFrom} to={selectedTo} onApply={applyCycle} />
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black text-[#008E92]">التشغيل والمراجعة</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-black text-[#061827]">مركز مراجعة الدورة</h1><p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-500">صفحة واحدة تحدد ما يحتاج قرارًا قبل الإغلاق. لا تغيّر أي أوردر أو مشوار بنفسها؛ هي فقط توجهك لصفحة القرار المناسبة.</p></div>
        <div className={`rounded-2xl px-5 py-3 text-center ${decisionTotal ? 'bg-amber-50 text-amber-900':'bg-emerald-50 text-emerald-900'}`}><p className="text-3xl font-black">{loading?'—':decisionTotal}</p><p className="text-[11px] font-black">قرارات معلقة</p></div>
      </div>
      <p className="mt-3 text-xs font-bold text-slate-400">الدورة {selectedFrom} → {selectedTo}</p>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <QueueCard title="مطابقة تحتاج قرار" text="الحالات المعلقة داخل مطابقة الأوردرات." value={loading?'—':counts.pendingOrders} to={withCycle('/admin/reconciliation?filter=pending')} icon={<GitCompareArrows size={19}/>} />
      <QueueCard title="مكرر يحتاج قرار" text="المكرر الذي لم يُعتمد أو يُرفض بعد." value={loading?'—':counts.duplicatePending} to={withCycle('/admin/reconciliation?filter=duplicate&review_status=pending')} icon={<CopyCheck size={19}/>} tone="amber" />
      <QueueCard title="مشاوير تنتظر" text="مشاوير لم يصدر عليها قرار نهائي." value={loading?'—':counts.pendingTrips} to={withCycle('/admin/trips')} icon={<Route size={19}/>} tone="amber" />
      <QueueCard title="غير موجود في المبيعات" text="أوردرات تحتاج إثبات أو استبعاد إداري." value={loading?'—':counts.notFound} to={withCycle('/admin/reconciliation?filter=not_found')} icon={<FileQuestion size={19}/>} tone="rose" />
    </section>

    <section className="grid gap-3 md:grid-cols-3">
      <QueueCard title="فاشل ومستبعد" text="للمراجعة لو الملاحظة تشير لمندوب آخر أو إعادة توصيل." value={loading?'—':counts.failed} to={withCycle('/admin/reconciliation?filter=failed')} icon={<AlertTriangle size={19}/>} tone="slate" />
      <QueueCard title="مكرر مستبعد" text="مراجعة نهائية للحالات المستبعدة بالفعل." value={loading?'—':counts.duplicateExcluded} to={withCycle('/admin/reconciliation?filter=duplicate&countable=false')} icon={<ShieldCheck size={19}/>} tone="slate" />
      <QueueCard title="مشاوير بدون فاتورة" text="مسار مراجعة مستقل للمشاوير التي بلا مرجع فاتورة." value={loading?'—':counts.tripsWithoutInvoice} to={withCycle('/admin/trips-without-invoice')} icon={<FileQuestion size={19}/>} tone="slate" />
    </section>

    <section className="rounded-[1.8rem] border border-teal-100 bg-teal-50 p-5">
      <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 text-teal-700"/><div><h2 className="font-black text-teal-900">ترتيب العمل المقترح داخل الصفحة</h2><p className="mt-1 text-sm font-bold leading-7 text-teal-800">ابدأ بالمعلق والمكرر، ثم غير الموجود، ثم المشاوير، وبعد إنهاء القرارات افتح إغلاق الدورة للتأكد من الجاهزية المالية والأرشيف.</p></div></div>
      <button type="button" onClick={()=>navigate(withCycle('/admin/cycle-closing'))} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#008E92] px-4 py-2.5 text-xs font-black text-white"><LockKeyhole size={16}/> فتح إغلاق الدورة</button>
    </section>
  </div>
}
