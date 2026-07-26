import { useEffect, useMemo, useState } from 'react'
import { Database, FileStack, RefreshCw, ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getOperationalPeriod } from '../lib/helpers'

type ProgressRow = {
  period_start: string
  period_end: string
  cumulative_system_invoices: number | string | null
  contributing_batches: number | string | null
  first_upload_at: string | null
  last_upload_at: string | null
  customer_name_mismatches: number | string | null
  counted_orders: number | string | null
  system_only_invoices: number | string | null
}

type OrderTotals = {
  registered: number
  counted: number
  failed: number
  notFound: number
  duplicates: number
  pending: number
}

const n = (value: unknown) => Number(value || 0)

export default function ReconciliationCycleSummary() {
  const [params] = useSearchParams()
  const fallback = useMemo(() => getOperationalPeriod(), [])
  const from = params.get('from') || fallback.start
  const to = params.get('to') || fallback.end
  const [progress, setProgress] = useState<ProgressRow | null>(null)
  const [orders, setOrders] = useState<OrderTotals>({ registered: 0, counted: 0, failed: 0, notFound: 0, duplicates: 0, pending: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [{ data: progressData, error: progressError }, { data: orderData, error: orderError }] = await Promise.all([
        supabase
          .from('delivery_reconciliation_cycle_progress')
          .select('*')
          .eq('period_start', from)
          .eq('period_end', to)
          .maybeSingle(),
        supabase
          .from('delivery_orders')
          .select('id,status,is_countable,final_count_status,bconnect_match_status,is_duplicate_invoice,deleted_at')
          .gte('delivery_date', from)
          .lte('delivery_date', to),
      ])
      if (progressError) throw progressError
      if (orderError) throw orderError
      const active = (orderData || []).filter((row: any) => !row.deleted_at)
      setProgress((progressData || null) as ProgressRow | null)
      setOrders({
        registered: active.length,
        counted: active.filter((row: any) => row.is_countable === true || String(row.final_count_status || '').startsWith('counted')).length,
        failed: active.filter((row: any) => row.status === 'failed').length,
        notFound: active.filter((row: any) => row.bconnect_match_status === 'invoice_not_found' || String(row.final_count_status || '').includes('not_found')).length,
        duplicates: active.filter((row: any) => row.is_duplicate_invoice || String(row.final_count_status || '').includes('duplicate')).length,
        pending: active.filter((row: any) => String(row.final_count_status || '').startsWith('pending')).length,
      })
    } catch (e) {
      console.error('Failed to load cumulative reconciliation summary', e)
      setError(e instanceof Error ? e.message : 'تعذر تحميل ملخص الدورة')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [from, to])

  const systemInvoices = n(progress?.cumulative_system_invoices)
  const batches = n(progress?.contributing_batches)
  const systemOnly = n(progress?.system_only_invoices)
  const nameMismatches = n(progress?.customer_name_mismatches)

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-teal-200 bg-white shadow-sm" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l from-[#061827] to-[#008E92] p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-white/15 p-3"><Database size={24} /></span>
          <div>
            <h2 className="text-xl font-black">الملخص الموحد للدورة</h2>
            <p className="text-sm font-bold text-white/80">كل الأرقام التالية تخص نفس الفترة: {from} إلى {to}</p>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading} className="rounded-2xl bg-white/15 p-3 disabled:opacity-50" title="تحديث">
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error ? (
        <div className="m-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 font-bold text-rose-700">{error}</div>
      ) : (
        <>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <Metric label="إجمالي فواتير السيستم للدورة" value={systemInvoices} note={`${batches} دفعة رفع`} />
            <Metric label="إجمالي أوردرات الدليفري" value={orders.registered} note="كل التسجيلات النشطة" />
            <Metric label="أوردرات صحيحة محتسبة" value={orders.counted} note="تدخل في حساب المندوب" tone="good" />
            <Metric label="غير موجودة بأي ملف مرفوع" value={orders.notFound} note="لا تعني تلاعبًا تلقائيًا" tone="warn" />
            <Metric label="فواتير سيستم بلا أوردر" value={systemOnly} note="موجودة بالسيستم فقط" tone="warn" />
            <Metric label="فاشلة مستبعدة" value={orders.failed} note="لا تحتسب" tone="bad" />
            <Metric label="مكررة للمراجعة" value={orders.duplicates} note="تحتاج قرارًا إداريًا" tone="warn" />
            <Metric label="اختلاف اسم العميل" value={nameMismatches} note="الرقم مطابق وتُحتسب" tone="info" />
          </div>

          <div className="grid gap-3 border-t border-slate-100 bg-slate-50 p-4 md:grid-cols-3">
            <Info icon={<FileStack size={18} />} label="عدد الملفات/الدفعات المساهمة" value={String(batches)} />
            <Info icon={<ShieldCheck size={18} />} label="أول رفع للدورة" value={progress?.first_upload_at ? new Date(progress.first_upload_at).toLocaleString('ar-EG') : '—'} />
            <Info icon={<RefreshCw size={18} />} label="آخر تحديث للدورة" value={progress?.last_upload_at ? new Date(progress.last_upload_at).toLocaleString('ar-EG') : '—'} />
          </div>

          <p className="border-t border-teal-100 bg-teal-50 px-5 py-3 text-sm font-black text-teal-900">
            هذا هو الملخص المعتمد للدورة. أما قسم «آخر عملية رفع» فيوضح الملف الأخير فقط ولا يمثل إجمالي الدورة.
          </p>
        </>
      )}
    </section>
  )
}

function Metric({ label, value, note, tone = 'normal' }: { label: string; value: number; note: string; tone?: 'normal' | 'good' | 'warn' | 'bad' | 'info' }) {
  const classes = tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : tone === 'bad' ? 'border-rose-200 bg-rose-50 text-rose-800' : tone === 'info' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-900'
  return <div className={`rounded-2xl border p-4 text-center ${classes}`}><div className="text-3xl font-black">{value.toLocaleString('en-US')}</div><div className="mt-2 text-sm font-black">{label}</div><div className="mt-1 text-[11px] font-bold opacity-70">{note}</div></div>
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-2xl bg-white p-3"><span className="text-teal-700">{icon}</span><div><div className="text-xs font-bold text-slate-400">{label}</div><div className="font-black text-slate-800">{value}</div></div></div>
}
