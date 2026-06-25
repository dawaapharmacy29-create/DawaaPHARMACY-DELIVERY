import { useEffect, useMemo, useState } from 'react'
import { Eye, MapPin, ShieldAlert, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getOperationalPeriod } from '../lib/helpers'

type TripRow = {
  id: string
  rider_id?: string | null
  rider_name?: string | null
  branch_name?: string | null
  trip_date?: string | null
  work_date?: string | null
  registered_at?: string | null
  created_at?: string | null
  trip_type?: string | null
  from_label?: string | null
  to_label?: string | null
  reason?: string | null
  notes?: string | null
  related_invoice_number?: string | null
  has_invoice_reference?: boolean | null
  proof_image_url?: string | null
  receipt_image_url?: string | null
  image_url?: string | null
  proof_captured_at?: string | null
  proof_uploaded_at?: string | null
  status?: string | null
}

function tripDate(trip: TripRow) {
  return String(trip.work_date || trip.trip_date || trip.registered_at || trip.created_at || '').slice(0, 10) || '—'
}

function proofUrl(trip: TripRow) {
  return String(trip.proof_image_url || trip.receipt_image_url || trip.image_url || '').trim()
}

function tripRisk(trip: TripRow) {
  const risks: string[] = []
  if (!trip.has_invoice_reference && !trip.related_invoice_number) risks.push('بدون فاتورة')
  if (!proofUrl(trip)) risks.push('بدون صورة')
  if (!trip.reason || trip.reason.trim().length < 8) risks.push('سبب غير كافي')
  if (!trip.proof_captured_at && !trip.proof_uploaded_at && proofUrl(trip)) risks.push('صورة بدون توقيت')
  if (trip.status === 'pending_approval') risks.push('مستني اعتماد')
  return risks
}

export default function TripFraudWatch() {
  const navigate = useNavigate()
  const [trips, setTrips] = useState<TripRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<TripRow | null>(null)
  const period = useMemo(() => getOperationalPeriod(), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('internal_trips')
        .select('*')
        .gte('trip_date', period.start)
        .lte('trip_date', period.end)
        .order('registered_at', { ascending: false })
        .limit(80)
      if (!cancelled) {
        if (!error) setTrips((data || []) as TripRow[])
        setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [period.end, period.start])

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const risky = trips.filter(trip => tripRisk(trip).length > 0)
    const noProof = trips.filter(trip => !proofUrl(trip))
    const noInvoice = trips.filter(trip => !trip.has_invoice_reference && !trip.related_invoice_number)
    const pending = trips.filter(trip => trip.status === 'pending_approval')
    const todayTrips = trips.filter(trip => tripDate(trip) === today)
    return { risky, noProof, noInvoice, pending, todayTrips }
  }, [trips])

  const topRisk = useMemo(() => {
    return [...trips]
      .map(trip => ({ trip, risks: tripRisk(trip) }))
      .filter(item => item.risks.length > 0)
      .sort((a, b) => b.risks.length - a.risks.length)
      .slice(0, 5)
  }, [trips])

  return (
    <section className="rounded-[2rem] border border-rose-100 bg-white p-5 shadow-sm" dir="rtl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><ShieldAlert /></span>
          <div>
            <h2 className="text-lg font-black text-[#102a32]">رقابة المشاوير ومنع التلاعب</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">الدورة {period.start} → {period.end} · تفاصيل المشاوير عالية المخاطر مباشرة من الداشبورد</p>
          </div>
        </div>
        <button onClick={() => navigate('/admin/trips')} className="rounded-2xl bg-[#008E92] px-4 py-3 text-xs font-black text-white">فتح كل المشاوير</button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Metric title="مشاوير الدورة" value={trips.length} tone="slate" />
        <Metric title="مشاوير اليوم" value={stats.todayTrips.length} tone="sky" />
        <Metric title="بدون فاتورة" value={stats.noInvoice.length} tone="amber" />
        <Metric title="بدون صورة" value={stats.noProof.length} tone="rose" />
        <Metric title="مستني اعتماد" value={stats.pending.length} tone="emerald" />
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-black text-slate-700">أعلى مشاوير تحتاج مراجعة</h3>
          {loading && <span className="text-xs font-bold text-slate-400">جاري التحميل...</span>}
        </div>
        {topRisk.length === 0 ? (
          <p className="rounded-xl bg-white p-4 text-center text-sm font-bold text-slate-400">لا توجد مشاوير عالية المخاطر حاليًا</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {topRisk.map(({ trip, risks }) => (
              <article key={trip.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <b className="block truncate text-[#102a32]">{trip.rider_name || 'دليفري غير محدد'}</b>
                    <p className="mt-1 text-xs font-bold text-slate-500">{trip.from_label || '—'} ← {trip.to_label || '—'}</p>
                    <p className="mt-1 text-[11px] font-bold text-slate-400">{tripDate(trip)} · {trip.branch_name || 'فرع غير محدد'}</p>
                  </div>
                  <button onClick={() => setSelected(trip)} className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"><Eye size={14} /> عرض</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {risks.map(risk => <span key={risk} className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black text-rose-700">{risk}</span>)}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-4 sm:items-center" onMouseDown={() => setSelected(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-rose-600">تفاصيل مشوار تحت الرقابة</p>
                <h3 className="text-xl font-black text-[#102a32]">{selected.rider_name || 'دليفري غير محدد'}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-xl bg-slate-100 p-2"><X size={18} /></button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="الفرع" value={selected.branch_name || '—'} />
              <Info label="التاريخ" value={`${tripDate(selected)} · ${selected.registered_at ? new Date(selected.registered_at).toLocaleTimeString('ar-EG') : '—'}`} />
              <Info label="من" value={selected.from_label || '—'} />
              <Info label="إلى" value={selected.to_label || '—'} />
              <Info label="رقم الفاتورة" value={selected.related_invoice_number || 'بدون فاتورة'} />
              <Info label="الحالة" value={selected.status || '—'} />
              <Info label="السبب" value={selected.reason || '—'} wide />
              <Info label="الملاحظات" value={selected.notes || '—'} wide />
              <Info label="وقت الصورة" value={selected.proof_captured_at || selected.proof_uploaded_at ? new Date(selected.proof_captured_at || selected.proof_uploaded_at || '').toLocaleString('ar-EG') : 'غير مسجل'} wide />
            </div>
            <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 font-black"><MapPin size={18} /> صورة الإثبات</div>
              {proofUrl(selected) ? <img src={proofUrl(selected)} alt="إثبات المشوار" className="max-h-[480px] w-full rounded-2xl bg-white object-contain" /> : <p className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">لم يتم رفع صورة إثبات لهذا المشوار</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Metric({ title, value, tone }: { title: string; value: number; tone: 'slate' | 'sky' | 'amber' | 'rose' | 'emerald' }) {
  const cls = {
    slate: 'bg-slate-50 text-slate-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    emerald: 'bg-emerald-50 text-emerald-700'
  }[tone]
  return <div className={`rounded-2xl p-4 text-center ${cls}`}><p className="text-xs font-black opacity-80">{title}</p><b className="mt-2 block text-2xl">{value}</b></div>
}

function Info({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return <div className={`rounded-2xl bg-slate-50 p-3 ${wide ? 'md:col-span-2' : ''}`}><p className="text-[11px] font-black text-slate-400">{label}</p><div className="mt-1 text-sm font-bold text-slate-700">{value}</div></div>
}
