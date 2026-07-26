import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle2, ExternalLink, HardDrive, Image, RefreshCw, ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import CycleSelector from '../../components/CycleSelector'
import { cycleForDate } from '../../lib/deliveryCycles'
import { supabase } from '../../lib/supabase'

type Asset = {
  id: string
  source_table?: string | null
  storage_path?: string | null
  object_bytes?: number | null
  archive_path?: string | null
  archive_link?: string | null
  verification_status?: string | null
  deleted_from_storage_at?: string | null
}

function english(value: number) { return Number(value || 0).toLocaleString('en-US') }
function size(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MB`
  return `${(value / 1024).toFixed(1)} KB`
}

export default function StorageArchiveCenter() {
  const initial = useMemo(() => cycleForDate(), [])
  const [params, setParams] = useSearchParams()
  const from = params.get('from') || initial.start
  const to = params.get('to') || initial.end
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cycleId, setCycleId] = useState('')
  const [inventoryCount, setInventoryCount] = useState(0)
  const [assets, setAssets] = useState<Asset[]>([])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const cycle = await supabase.from('delivery_cycles').select('id').eq('period_start', from).eq('period_end', to).maybeSingle()
      const id = String(cycle.data?.id || '')
      setCycleId(id)

      const inventory = await supabase.rpc('get_delivery_cycle_storage_inventory', { p_period_start: from, p_period_end: to })
      if (!inventory.error) setInventoryCount((inventory.data || []).length)
      else setInventoryCount(0)

      if (id) {
        const result = await supabase.from('delivery_cycle_archive_assets').select('*').eq('cycle_id', id).order('verified_at', { ascending: false })
        if (result.error) throw result.error
        setAssets((result.data || []) as Asset[])
      } else {
        setAssets([])
      }
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل حالة الأرشيف')
    } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { void load() }, [load])

  const verified = assets.filter(a => a.verification_status === 'verified')
  const verifiedBytes = verified.reduce((sum, a) => sum + Number(a.object_bytes || 0), 0)
  const deleted = assets.filter(a => Boolean(a.deleted_from_storage_at)).length
  const orders = assets.filter(a => a.source_table === 'delivery_orders').length
  const trips = assets.filter(a => a.source_table === 'internal_trips').length
  const remaining = Math.max(0, inventoryCount - verified.length)
  const workflowUrl = `https://github.com/dawaapharmacy29-create/DawaaPHARMACY-DELIVERY/actions/workflows/archive-delivery-cycle-storage.yml`

  function applyPeriod(nextFrom: string, nextTo: string) {
    const next = new URLSearchParams(params); next.set('from', nextFrom); next.set('to', nextTo); setParams(next)
  }

  return <div className="space-y-5 text-right" dir="rtl">
    <section className="rounded-[32px] bg-gradient-to-l from-[#061827] to-[#008E92] p-6 text-white shadow-xl">
      <p className="text-sm font-black text-teal-100">مركز أرشفة صور الدليفري</p>
      <h1 className="mt-1 text-3xl font-black">نقل صور الدورة إلى Google Drive بأمان</h1>
      <p className="mt-2 max-w-3xl text-sm font-bold text-teal-50">اختَر دورة 26→25، راجع عدد الصور، شغّل الأرشفة، ثم ارجع هنا لمتابعة الملفات التي تم التحقق منها. لا يتم حذف أي صورة من Supabase في هذه المرحلة.</p>
    </section>

    <CycleSelector from={from} to={to} onApply={applyPeriod} />
    {error && <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 font-black text-rose-700">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={<Image/>} label="صور الدورة" value={english(inventoryCount)} hint="أوردرات ومشاوير" />
      <Metric icon={<Archive/>} label="تمت أرشفتها" value={english(verified.length)} hint={`${english(remaining)} متبقي`} tone="emerald" />
      <Metric icon={<HardDrive/>} label="حجم محمي" value={size(verifiedBytes)} hint="موجود على Google Drive" tone="sky" />
      <Metric icon={<Image/>} label="صور الأوردرات" value={english(orders)} hint="داخل الأرشيف" tone="amber" />
      <Metric icon={<ShieldCheck/>} label="صور المشاوير" value={english(trips)} hint={`${english(deleted)} محذوفة من Storage`} tone="violet" />
    </section>

    <section className="rounded-[30px] border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">تشغيل أرشفة هذه الدورة</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">الفترة: {from} إلى {to}. يجب أن تكون الدورة موجودة في جدول delivery_cycles.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl border px-4 py-3 font-black"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/> تحديث</button>
          <a href={workflowUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white"><ExternalLink size={17}/> فتح تشغيل الأرشفة</a>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Step number="1" title="افتح Workflow" text="اختَر Archive one delivery cycle to Google Drive." />
        <Step number="2" title="اكتب الفترة" text={`period_start = ${from} و period_end = ${to}`} />
        <Step number="3" title="راجع النتيجة" text="بعد النجاح ارجع واضغط تحديث؛ الملفات المتحققة ستظهر هنا." />
      </div>
      {!cycleId && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 font-black text-amber-800">الدورة لم تُسجل بعد في delivery_cycles. افتح مركز إغلاق الدورة أولًا ثم أنشئ/راجع الدورة قبل الأرشفة.</div>}
    </section>

    <section className="overflow-hidden rounded-[30px] border bg-white shadow-sm">
      <div className="border-b p-5"><h2 className="text-xl font-black">آخر الملفات المؤرشفة</h2><p className="text-sm font-bold text-slate-500">كل صف تم نسخه والتحقق من الحجم وتسجيله في قاعدة البيانات.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-right">المصدر</th><th className="p-3 text-right">المسار</th><th>الحجم</th><th>الحالة</th><th>الأرشيف</th></tr></thead><tbody>
        {assets.slice(0, 100).map(asset => <tr key={asset.id} className="border-t"><td className="p-3 font-black">{asset.source_table === 'delivery_orders' ? 'صورة أوردر' : 'إثبات مشوار'}</td><td className="max-w-[420px] truncate p-3 text-slate-500" title={asset.storage_path || ''}>{asset.storage_path || '—'}</td><td className="p-3 text-center">{size(Number(asset.object_bytes || 0))}</td><td className="p-3 text-center"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 font-black text-emerald-700"><CheckCircle2 size={14}/> تم التحقق</span></td><td className="p-3 text-center">{asset.archive_link ? <a href={asset.archive_link} target="_blank" rel="noreferrer" className="font-black text-[#008E92]">فتح</a> : '—'}</td></tr>)}
        {!assets.length && !loading && <tr><td colSpan={5} className="p-10 text-center font-bold text-slate-400">لم يتم تسجيل أرشفة لهذه الدورة بعد</td></tr>}
      </tbody></table></div>
    </section>
  </div>
}

function Metric({ icon, label, value, hint, tone='teal' }: { icon: React.ReactNode; label: string; value: string; hint: string; tone?: string }) {
  const tones: Record<string,string> = { teal:'text-teal-700', emerald:'text-emerald-700', sky:'text-sky-700', amber:'text-amber-700', violet:'text-violet-700' }
  return <div className="rounded-3xl border bg-white p-4 shadow-sm"><div className={`flex items-center gap-2 font-black ${tones[tone] || tones.teal}`}>{icon}{label}</div><p className="mt-3 text-3xl font-black">{value}</p><p className="mt-1 text-xs font-bold text-slate-400">{hint}</p></div>
}
function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#008E92] font-black text-white">{number}</span><b>{title}</b></div><p className="mt-2 text-sm font-bold text-slate-500">{text}</p></div>
}
