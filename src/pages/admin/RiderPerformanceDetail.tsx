import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calculator, CalendarDays, Download, FileText, Gift, Save, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'
import { displayBranchName } from '../../lib/branchUtils'

type RiderProfile = {
  id?: string
  rider_id: string
  branch_id?: string | null
  cycle_start: string
  cycle_end: string
  hourly_rate: number
  base_salary: number
  monthly_bonus: number
  quarterly_bonus: number
  order_1x_rate: number
  order_1_5x_rate: number
  internal_trip_rate: number
  failed_order_rate: number
  count_failed_orders: boolean
  attendance_commitment_rate: number
  notes?: string | null
}

type CompEvent = {
  id: string
  rider_id: string
  branch_id?: string | null
  cycle_start: string
  event_date: string
  event_type: 'bonus' | 'deduction' | 'manual_adjustment' | 'monthly_bonus' | 'quarterly_bonus'
  title: string
  amount: number
  reason?: string | null
  created_at?: string
}

const defaultProfile = (riderId: string, branchId: string | null, period = getOperationalPeriod()): RiderProfile => ({
  rider_id: riderId,
  branch_id: branchId,
  cycle_start: period.start,
  cycle_end: period.end,
  hourly_rate: 0,
  base_salary: 0,
  monthly_bonus: 0,
  quarterly_bonus: 0,
  order_1x_rate: 0,
  order_1_5x_rate: 0,
  internal_trip_rate: 0,
  failed_order_rate: 0,
  count_failed_orders: false,
  attendance_commitment_rate: 100,
  notes: ''
})

function num(v: any) { return Number(v || 0) || 0 }
function isDeleted(row: any) { return Boolean(row?.deleted_at) }
function isDelivered(order: any) {
  return ['delivered', 'تم التسليم'].includes(String(order?.status || '').toLowerCase()) || Boolean(order?.delivered_at)
}
function isFailed(order: any) {
  const status = String(order?.status || '').toLowerCase()
  return status.includes('fail') || status === 'failed' || Boolean(order?.failed_at) || Boolean(order?.failed_reason)
}
function isDuplicate(order: any) { return Boolean(order?.is_duplicate_invoice || order?.duplicate_warning) }
function isMultiplier(order: any) { return Number(order?.order_multiplier ?? (order?.is_multiplier_order ? 1.5 : 1)) >= 1.5 }
function isUncounted(order: any) {
  const s = String(order?.count_status || order?.reconciliation_status || order?.review_status || '').toLowerCase()
  return Boolean(order?.not_countable || order?.excluded_from_incentive || order?.is_countable === false) || ['rejected', 'not_countable', 'excluded', 'invoice_not_found'].includes(s)
}
function isReview(order: any) {
  const s = String(order?.review_status || order?.status || '').toLowerCase()
  return Boolean(order?.needs_review) || ['pending', 'needs_review', 'registered'].includes(s)
}
function eventTone(t: string) {
  if (t === 'deduction') return 'bg-rose-50 text-rose-700 border-rose-100'
  if (t === 'monthly_bonus' || t === 'quarterly_bonus') return 'bg-purple-50 text-purple-700 border-purple-100'
  return 'bg-emerald-50 text-emerald-700 border-emerald-100'
}
function eventLabel(t: string) {
  return ({ bonus: 'مكافأة', deduction: 'خصم', manual_adjustment: 'تسوية يدوية', monthly_bonus: 'حافز شهري', quarterly_bonus: 'حافز ربع سنوي' } as any)[t] || t
}

function Stat({ label, value, sub, tone = 'slate' }: { label: string; value: string | number; sub?: string; tone?: 'green' | 'red' | 'blue' | 'orange' | 'slate' | 'purple' }) {
  const cls = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    red: 'bg-rose-50 text-rose-700 border-rose-100',
    blue: 'bg-sky-50 text-sky-700 border-sky-100',
    orange: 'bg-amber-50 text-amber-700 border-amber-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    slate: 'bg-white text-[#061827] border-slate-100'
  }[tone]
  return <div className={`rounded-3xl border p-4 text-right shadow-sm ${cls}`}><p className="text-xs font-black opacity-70">{label}</p><p className="mt-2 text-2xl font-black">{value}</p>{sub && <p className="mt-1 text-xs font-bold opacity-70">{sub}</p>}</div>
}

export default function RiderPerformanceDetail() {
  const { riderId } = useParams()
  const navigate = useNavigate()
  const period = getOperationalPeriod()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rider, setRider] = useState<any>(null)
  const [branch, setBranch] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [attendance, setAttendance] = useState<any[]>([])
  const [profile, setProfile] = useState<RiderProfile>(() => defaultProfile(riderId || '', null, period))
  const [events, setEvents] = useState<CompEvent[]>([])
  const [eventForm, setEventForm] = useState({ event_type: 'bonus', title: '', amount: '', reason: '' })
  const [tablesReady, setTablesReady] = useState(true)

  useEffect(() => { void load() }, [riderId])

  async function load() {
    if (!riderId) return
    setLoading(true)
    try {
      const { data: r } = await supabase.from('riders').select('*').eq('id', riderId).maybeSingle()
      setRider(r)
      if ((r as any)?.branch_id) {
        const { data: b } = await supabase.from('delivery_branches').select('*').eq('id', (r as any).branch_id).maybeSingle()
        setBranch(b)
      }

      const [ordersRes, tripsRes, attendanceRes] = await Promise.allSettled([
        supabase.from('delivery_orders').select('*').eq('rider_id', riderId).gte('work_date', period.start).lte('work_date', period.end).order('work_date', { ascending: false }),
        supabase.from('internal_trips').select('*').eq('rider_id', riderId).gte('work_date', period.start).lte('work_date', period.end).order('work_date', { ascending: false }),
        supabase.from('delivery_attendance').select('*').eq('rider_id', riderId).gte('shift_date', period.start).lte('shift_date', period.end).order('shift_date', { ascending: false })
      ])
      setOrders(ordersRes.status === 'fulfilled' ? ((ordersRes.value as any).data || []) : [])
      setTrips(tripsRes.status === 'fulfilled' ? ((tripsRes.value as any).data || []) : [])
      setAttendance(attendanceRes.status === 'fulfilled' ? ((attendanceRes.value as any).data || []) : [])

      const { data: prof, error: profErr } = await supabase
        .from('rider_compensation_profiles')
        .select('*')
        .eq('rider_id', riderId)
        .eq('cycle_start', period.start)
        .eq('cycle_end', period.end)
        .maybeSingle()
      if (profErr && !String(profErr.message).includes('does not exist')) throw profErr
      const fallback = defaultProfile(riderId, (r as any)?.branch_id || null, period)
      setProfile({ ...fallback, ...(prof || {}), branch_id: (prof as any)?.branch_id || (r as any)?.branch_id || null })

      const { data: ev, error: evErr } = await supabase
        .from('rider_compensation_events')
        .select('*')
        .eq('rider_id', riderId)
        .eq('cycle_start', period.start)
        .order('event_date', { ascending: false })
      if (evErr && !String(evErr.message).includes('does not exist')) throw evErr
      setEvents((ev || []) as any)
      setTablesReady(true)
    } catch (e: any) {
      if (String(e?.message || '').includes('does not exist')) {
        setTablesReady(false)
        toast.error('جداول الحوافز غير موجودة. شغّل ملف SQL الجديد أولًا.')
      } else {
        toast.error(e?.message || 'فشل تحميل تفاصيل الدليفري')
      }
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => {
    const clean = orders.filter(o => !isDeleted(o))
    const delivered = clean.filter(isDelivered)
    const failed = clean.filter(isFailed)
    const multiplier = clean.filter(isMultiplier)
    const oneX = clean.filter(o => !isMultiplier(o) && !isFailed(o))
    const duplicate = clean.filter(isDuplicate)
    const review = clean.filter(isReview)
    const uncounted = clean.filter(isUncounted)
    const countableOneX = oneX.filter(o => !isUncounted(o)).length
    const countableMultiplier = multiplier.filter(o => !isUncounted(o)).length
    const countableFailed = profile.count_failed_orders ? failed.length : 0
    const approvedTrips = trips.filter((t: any) => ['approved','countable','تم الاعتماد'].includes(String(t.status || t.review_status || '').toLowerCase()))
    const workedHours = attendance.reduce((s, a: any) => s + num(a.worked_hours || a.hours || (num(a.total_minutes || a.duration_minutes) / 60)), 0)

    const orderPay = countableOneX * num(profile.order_1x_rate) + countableMultiplier * num(profile.order_1_5x_rate) + countableFailed * num(profile.failed_order_rate)
    const tripsPay = approvedTrips.length * num(profile.internal_trip_rate)
    const hoursPay = workedHours * num(profile.hourly_rate)
    const positiveEvents = events.filter(e => e.event_type !== 'deduction').reduce((s, e) => s + Math.abs(num(e.amount)), 0)
    const deductions = events.filter(e => e.event_type === 'deduction').reduce((s, e) => s + Math.abs(num(e.amount)), 0)
    const fixed = num(profile.base_salary) + num(profile.monthly_bonus) + num(profile.quarterly_bonus)
    const gross = fixed + orderPay + tripsPay + hoursPay + positiveEvents
    const net = gross - deductions
    return { clean, delivered, failed, multiplier, oneX, duplicate, review, uncounted, countableOneX, countableMultiplier, approvedTrips, workedHours, orderPay, tripsPay, hoursPay, positiveEvents, deductions, fixed, gross, net }
  }, [orders, trips, attendance, profile, events])

  async function saveProfile() {
    if (!riderId) return
    setSaving(true)
    try {
      const payload = { ...profile, rider_id: riderId, branch_id: profile.branch_id || rider?.branch_id || null, cycle_start: period.start, cycle_end: period.end }
      const { error } = await supabase.from('rider_compensation_profiles').upsert(payload, { onConflict: 'rider_id,cycle_start,cycle_end' })
      if (error) throw error
      toast.success('تم حفظ قواعد حساب الدليفري')
      await load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل حفظ القواعد. تأكد من تشغيل SQL الجديد.')
    } finally { setSaving(false) }
  }

  async function addEvent() {
    if (!riderId || !eventForm.title || !eventForm.amount) return toast.error('اكتب اسم البند والقيمة')
    try {
      const amount = Math.abs(Number(eventForm.amount) || 0)
      const payload = { rider_id: riderId, branch_id: profile.branch_id || rider?.branch_id || null, cycle_start: period.start, event_date: new Date().toISOString().slice(0,10), event_type: eventForm.event_type, title: eventForm.title, amount, reason: eventForm.reason || null }
      const { error } = await supabase.from('rider_compensation_events').insert(payload)
      if (error) throw error
      setEventForm({ event_type: 'bonus', title: '', amount: '', reason: '' })
      toast.success('تم إضافة البند')
      await load()
    } catch (e: any) { toast.error(e?.message || 'فشل إضافة البند') }
  }

  function exportPdf() {
    document.body.classList.add('printing-rider-report')
    setTimeout(() => window.print(), 100)
  }

  return (
    <div className="min-h-screen bg-[#F3F7F8] print:bg-white" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 shadow-sm print:static print:shadow-none">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <button onClick={() => navigate('/admin/performance')} className="no-print flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"><ArrowLeft size={16}/> رجوع</button>
          <div className="text-center"><p className="text-lg font-black text-[#061827]">تقرير دليفري تفصيلي</p><p className="text-xs font-bold text-slate-400">الدورة الحالية: {period.start} → {period.end}</p></div>
          <button onClick={exportPdf} className="no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm"><Download size={16}/> PDF</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4 print:p-0">
        {!tablesReady && <div className="no-print rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">شغّل ملف SQL الجديد الخاص بجداول الحوافز قبل استخدام الحفظ والإضافة.</div>}
        {loading ? <div className="rounded-3xl bg-white p-8 text-center font-black text-slate-500">جاري تحميل التفاصيل...</div> : <>
          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3"><img src="/logo.png" className="h-16 w-16 rounded-3xl border object-contain p-1"/><div><h1 className="text-2xl font-black text-[#061827]">{rider?.name || rider?.username || 'دليفري'}</h1><p className="font-bold text-slate-500">{displayBranchName(branch?.name || rider?.branch_name)} · {rider?.status || 'active'}</p></div></div>
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-center text-emerald-700"><p className="text-xs font-black">الصافي النهائي</p><p className="text-3xl font-black">{formatMoney(stats.net)}</p></div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="أوردرات ×1" value={stats.countableOneX} tone="blue" />
            <Stat label="أوردرات ×1.5" value={stats.countableMultiplier} tone="orange" />
            <Stat label="المشاوير المعتمدة" value={stats.approvedTrips.length} tone="purple" />
            <Stat label="الفاشلة" value={stats.failed.length} tone="red" />
            <Stat label="المكررة" value={stats.duplicate.length} tone="red" />
            <Stat label="غير محتسبة" value={stats.uncounted.length} tone="slate" />
            <Stat label="تحت المراجعة" value={stats.review.length} tone="orange" />
            <Stat label="تم التسليم" value={stats.delivered.length} tone="green" />
            <Stat label="إجمالي الأوردرات" value={stats.clean.length} tone="blue" />
            <Stat label="ساعات العمل" value={stats.workedHours.toFixed(1)} tone="slate" />
            <Stat label="إجمالي المكافآت" value={formatMoney(stats.positiveEvents)} tone="green" />
            <Stat label="إجمالي الخصومات" value={formatMoney(stats.deductions)} tone="red" />
          </section>

          <section className="grid gap-4 lg:grid-cols-3 print:block">
            <div className="no-print rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-1">
              <div className="mb-4 flex items-center gap-2 font-black text-[#061827]"><Calculator size={18}/> قواعد حساب هذا الشهر</div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['hourly_rate','سعر الساعة'], ['base_salary','الأساسي'], ['monthly_bonus','الحافز الشهري'], ['quarterly_bonus','الحافز الربع سنوي'], ['order_1x_rate','قيمة ×1'], ['order_1_5x_rate','قيمة ×1.5'], ['internal_trip_rate','قيمة المشوار'], ['failed_order_rate','قيمة الفاشل']
                ].map(([key,label]) => <label key={key} className="text-xs font-black text-slate-500">{label}<input type="number" step="0.01" value={(profile as any)[key] ?? 0} onChange={e => setProfile(p => ({...p, [key]: Number(e.target.value)}))} className="mt-1 w-full rounded-2xl border px-3 py-2 font-bold text-slate-700 outline-none focus:border-emerald-400"/></label>)}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={profile.count_failed_orders} onChange={e => setProfile(p => ({...p, count_failed_orders: e.target.checked}))}/> احتساب الأوردر الفاشل</label>
              <textarea value={profile.notes || ''} onChange={e => setProfile(p => ({...p, notes: e.target.value}))} placeholder="ملاحظات خاصة بالدليفري أو الدورة" className="mt-3 h-20 w-full rounded-2xl border p-3 text-sm outline-none focus:border-emerald-400" />
              <button disabled={saving} onClick={saveProfile} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#008E92] px-4 py-3 font-black text-white"><Save size={16}/> حفظ القواعد</button>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
              <div className="mb-4 flex items-center gap-2 font-black text-[#061827]"><Wallet size={18}/> الملخص المالي</div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="الأساسي والثابت" value={formatMoney(stats.fixed)} />
                <Stat label="حافز الأوردرات" value={formatMoney(stats.orderPay)} tone="green" />
                <Stat label="حافز المشاوير" value={formatMoney(stats.tripsPay)} tone="purple" />
                <Stat label="قيمة الساعات" value={formatMoney(stats.hoursPay)} tone="blue" />
                <Stat label="مكافآت يدوية" value={formatMoney(stats.positiveEvents)} tone="green" />
                <Stat label="خصومات" value={formatMoney(stats.deductions)} tone="red" />
                <Stat label="الإجمالي قبل الخصم" value={formatMoney(stats.gross)} tone="orange" />
                <Stat label="الصافي" value={formatMoney(stats.net)} tone="green" />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2 print:block">
            <div className="no-print rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 font-black text-[#061827]"><Gift size={18}/> إضافة مكافأة أو خصم</div>
              <div className="grid gap-3 md:grid-cols-4">
                <select value={eventForm.event_type} onChange={e => setEventForm(f => ({...f, event_type: e.target.value}))} className="rounded-2xl border px-3 py-2 font-bold"><option value="bonus">مكافأة</option><option value="deduction">خصم</option><option value="manual_adjustment">تسوية</option><option value="monthly_bonus">حافز شهري</option><option value="quarterly_bonus">حافز ربع سنوي</option></select>
                <input value={eventForm.title} onChange={e => setEventForm(f => ({...f, title: e.target.value}))} placeholder="اسم البند" className="rounded-2xl border px-3 py-2 font-bold" />
                <input type="number" value={eventForm.amount} onChange={e => setEventForm(f => ({...f, amount: e.target.value}))} placeholder="القيمة" className="rounded-2xl border px-3 py-2 font-bold" />
                <button onClick={addEvent} className="rounded-2xl bg-emerald-600 px-4 py-2 font-black text-white">إضافة</button>
              </div>
              <input value={eventForm.reason} onChange={e => setEventForm(f => ({...f, reason: e.target.value}))} placeholder="السبب / الملاحظة" className="mt-3 w-full rounded-2xl border px-3 py-2 font-bold" />
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 font-black text-[#061827]"><CalendarDays size={18}/> سجل الحوافز والخصومات</div>
              <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">التاريخ</th><th className="p-3">النوع</th><th className="p-3">البند</th><th className="p-3">القيمة</th><th className="p-3">السبب</th></tr></thead><tbody>{events.length ? events.map(e => <tr key={e.id} className="border-t"><td className="p-3 font-bold">{e.event_date}</td><td className="p-3"><span className={`rounded-full border px-3 py-1 text-xs font-black ${eventTone(e.event_type)}`}>{eventLabel(e.event_type)}</span></td><td className="p-3 font-black">{e.title}</td><td className={`p-3 font-black ${e.event_type === 'deduction' ? 'text-rose-700' : 'text-emerald-700'}`}>{e.event_type === 'deduction' ? '-' : '+'}{formatMoney(Math.abs(num(e.amount)))}</td><td className="p-3 text-slate-500">{e.reason || '—'}</td></tr>) : <tr><td colSpan={5} className="p-6 text-center font-bold text-slate-400">لا توجد بنود مسجلة</td></tr>}</tbody></table></div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 font-black text-[#061827]"><FileText size={18}/> آخر أوردرات الدورة</div>
            <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">التاريخ</th><th className="p-3">الفاتورة</th><th className="p-3">العميل</th><th className="p-3">الحالة</th><th className="p-3">×</th><th className="p-3">القيمة</th><th className="p-3">مراجعة</th></tr></thead><tbody>{orders.slice(0,80).map((o:any) => <tr key={o.id} className="border-t"><td className="p-3">{(o.delivery_date || o.created_at || '').slice(0,10)}</td><td className="p-3 font-black">{o.invoice_number || o.invoice_no || o.order_no || '—'}</td><td className="p-3">{o.customer_name || o.customer_name_snapshot || '—'}</td><td className="p-3">{o.status || '—'}</td><td className="p-3 font-black">{isMultiplier(o) ? '1.5' : '1'}</td><td className="p-3">{formatMoney(num(o.invoice_amount || o.amount || o.total_amount))}</td><td className="p-3">{o.review_status || o.reconciliation_status || '—'}</td></tr>)}</tbody></table></div>
          </section>

          <div className="hidden print:block mt-8 grid-cols-2 gap-8 text-center font-bold"><div className="border-t pt-3">توقيع المدير</div><div className="border-t pt-3">توقيع الدليفري</div></div>
        </>}
      </main>
      <style>{`@media print {.no-print{display:none!important} .print\\:block{display:block!important} body{background:white!important} main{max-width:none!important} table{font-size:11px} }`}</style>
    </div>
  )
}
