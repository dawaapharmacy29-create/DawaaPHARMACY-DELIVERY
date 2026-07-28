import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Printer, RefreshCw, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'

type Row = Record<string, any>
type BonusType = 'monthly' | 'quarterly'
type AdjustmentType = 'penalty' | 'reward'

type Criterion = {
  key: string
  label: string
  description: string
  weight: number
  score: number
}

const DEFAULT_CRITERIA: Criterion[] = [
  { key: 'discipline', label: 'الالتزام والانضباط', description: 'الحضور، المواعيد، الزي، وتنفيذ التعليمات', weight: 200, score: 5 },
  { key: 'speed', label: 'سرعة التسليم', description: 'متوسط زمن التوصيل وتقليل التأخير', weight: 200, score: 5 },
  { key: 'service', label: 'حسن المعاملة', description: 'التعامل مع العملاء والصيدلية باحترام', weight: 200, score: 5 },
  { key: 'accuracy', label: 'دقة الأوردرات', description: 'تقليل الأخطاء والفواتير المكررة والمرفوضة', weight: 200, score: 5 },
  { key: 'custody', label: 'العهدة والتواصل', description: 'المحافظة على النقدية والعهدة والرد والمتابعة', weight: 200, score: 5 },
]

function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function cycleRange(base = new Date(), offset = 0) {
  const anchor = new Date(base.getFullYear(), base.getMonth() + offset, base.getDate())
  const start = anchor.getDate() >= 26
    ? new Date(anchor.getFullYear(), anchor.getMonth(), 26)
    : new Date(anchor.getFullYear(), anchor.getMonth() - 1, 26)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25)
  return { start: iso(start), end: iso(end) }
}

async function fetchAllPages(buildQuery: () => any, pageSize = 1000) {
  const rows: Row[] = []
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await buildQuery().range(start, start + pageSize - 1)
    if (error) throw error
    const page = (data || []) as Row[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

function money(value: number) {
  return Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })
}

function rowDate(row: Row) {
  return String(row.work_date || row.delivery_date || row.registered_at || row.created_at || '').slice(0, 10)
}

function status(row: Row) {
  return String(row.status || '').toLowerCase()
}

export default function RiderCompensationCenter() {
  const navigate = useNavigate()
  const current = cycleRange()
  const previous = cycleRange(new Date(), -1)
  const [riders, setRiders] = useState<Row[]>([])
  const [riderId, setRiderId] = useState('')
  const [from, setFrom] = useState(current.start)
  const [to, setTo] = useState(current.end)
  const [orders, setOrders] = useState<Row[]>([])
  const [trips, setTrips] = useState<Row[]>([])
  const [adjustments, setAdjustments] = useState<Row[]>([])
  const [assessments, setAssessments] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [orderRate, setOrderRate] = useState('0')
  const [tripRate, setTripRate] = useState('0')
  const [monthlyBonusBase, setMonthlyBonusBase] = useState('1000')
  const [quarterlyBonusBase, setQuarterlyBonusBase] = useState('1000')
  const [bonusType, setBonusType] = useState<BonusType>('monthly')
  const [criteria, setCriteria] = useState<Criterion[]>(DEFAULT_CRITERIA)
  const [assessmentNote, setAssessmentNote] = useState('')
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('penalty')
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [adjustmentCycle, setAdjustmentCycle] = useState<'current' | 'previous' | 'custom'>('current')
  const [adjustmentFrom, setAdjustmentFrom] = useState(current.start)
  const [adjustmentTo, setAdjustmentTo] = useState(current.end)

  const rider = useMemo(() => riders.find(item => String(item.id) === riderId) || null, [riders, riderId])

  async function loadRiders() {
    const { data, error } = await supabase.from('riders').select('*').order('name', { ascending: true })
    if (error) return toast.error(`تعذر تحميل المناديب: ${error.message}`)
    const rows = (data || []) as Row[]
    setRiders(rows)
    if (!riderId && rows[0]?.id) setRiderId(String(rows[0].id))
  }

  async function loadReport() {
    if (!riderId) return
    setLoading(true)
    try {
      const [ordersRows, tripsRows, adjustmentRows, assessmentRows] = await Promise.all([
        fetchAllPages(() => supabase.from('delivery_orders').select('*').eq('rider_id', riderId).gte('work_date', from).lte('work_date', to).order('id', { ascending: true })),
        fetchAllPages(() => supabase.from('internal_trips').select('*').eq('rider_id', riderId).gte('work_date', from).lte('work_date', to).order('id', { ascending: true })),
        fetchAllPages(() => supabase.from('rider_adjustments').select('*').eq('rider_id', riderId).gte('cycle_start', from).lte('cycle_end', to).order('id', { ascending: true })),
        fetchAllPages(() => supabase.from('rider_bonus_assessments').select('*').eq('rider_id', riderId).order('created_at', { ascending: false })),
      ])
      setOrders(ordersRows)
      setTrips(tripsRows)
      setAdjustments(adjustmentRows)
      setAssessments(assessmentRows)
      setOrderRate(String(rider?.order_rate ?? 0))
      setTripRate(String(rider?.trip_rate ?? 0))
      const existing = assessmentRows.find(row => row.cycle_start === from && row.cycle_end === to && row.bonus_type === bonusType)
      if (existing?.criteria) setCriteria(existing.criteria as Criterion[])
      if (existing?.base_amount) bonusType === 'monthly' ? setMonthlyBonusBase(String(existing.base_amount)) : setQuarterlyBonusBase(String(existing.base_amount))
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل التقرير الكامل')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadRiders() }, [])
  useEffect(() => { void loadReport() }, [riderId, from, to])

  useEffect(() => {
    if (adjustmentCycle === 'current') {
      setAdjustmentFrom(from); setAdjustmentTo(to)
    } else if (adjustmentCycle === 'previous') {
      setAdjustmentFrom(previous.start); setAdjustmentTo(previous.end)
    }
  }, [adjustmentCycle, from, to])

  const bonusBase = Number(bonusType === 'monthly' ? monthlyBonusBase : quarterlyBonusBase) || 0
  const criteriaWeightTotal = criteria.reduce((sum, item) => sum + Number(item.weight || 0), 0)
  const bonusEarned = criteria.reduce((sum, item) => sum + (Number(item.weight || 0) * Math.max(0, Math.min(5, Number(item.score || 0))) / 5), 0)
  const normalizedBonusEarned = criteriaWeightTotal > 0 ? bonusEarned * (bonusBase / criteriaWeightTotal) : 0

  const summary = useMemo(() => {
    const countedOrders = orders.filter(order => !['failed', 'cancelled', 'canceled'].includes(status(order)) && (order.is_countable === true || String(order.final_count_status || '').startsWith('counted')))
    const normal = countedOrders.filter(order => Number(order.order_multiplier ?? 1) < 1.5)
    const multiplier = countedOrders.filter(order => Number(order.order_multiplier ?? 1) >= 1.5)
    const approvedTrips = trips.filter(trip => ['approved', 'completed'].includes(status(trip)))
    const orderValue = normal.reduce((sum, order) => sum + Number(order.order_earning ?? orderRate), 0)
      + multiplier.reduce((sum, order) => sum + Number(order.order_earning ?? Number(orderRate) * Number(order.order_multiplier ?? 1.5)), 0)
    const tripValue = approvedTrips.reduce((sum, trip) => sum + Number(trip.trip_earning ?? tripRate), 0)
    const rewards = adjustments.filter(item => item.adjustment_type === 'reward' && String(item.status || '').toLowerCase() === 'approved').reduce((sum, item) => sum + Math.abs(Number(item.final_amount ?? item.amount ?? 0)), 0)
    const penalties = adjustments.filter(item => item.adjustment_type === 'penalty' && String(item.status || '').toLowerCase() === 'approved').reduce((sum, item) => sum + Math.abs(Number(item.final_amount ?? item.amount ?? 0)), 0)
    return {
      totalOrders: orders.length,
      countedOrders: countedOrders.length,
      normalOrders: normal.length,
      multiplierOrders: multiplier.length,
      approvedTrips: approvedTrips.length,
      orderValue,
      tripValue,
      rewards,
      penalties,
      net: orderValue + tripValue + normalizedBonusEarned + rewards - penalties,
    }
  }, [orders, trips, adjustments, orderRate, tripRate, normalizedBonusEarned])

  const lastQuarterly = assessments.find(row => row.bonus_type === 'quarterly' && row.status === 'approved')

  function setCycle(kind: 'current' | 'previous') {
    const range = kind === 'current' ? current : previous
    setFrom(range.start); setTo(range.end)
  }

  function updateCriterion(index: number, field: 'score' | 'weight', value: string) {
    setCriteria(currentRows => currentRows.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: Number(value) || 0 } : item))
  }

  async function saveAssessment() {
    if (!rider) return toast.error('اختار المندوب أولًا')
    setSaving(true)
    try {
      const payload = {
        rider_id: rider.id,
        rider_name: rider.name || rider.username,
        branch_name: rider.branch_name || null,
        cycle_start: from,
        cycle_end: to,
        bonus_type: bonusType,
        base_amount: bonusBase,
        criteria,
        earned_amount: Math.round(normalizedBonusEarned * 100) / 100,
        notes: assessmentNote.trim() || null,
        status: 'approved',
        approved_by_name: 'د/ معاذ',
        approved_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('rider_bonus_assessments').upsert(payload, { onConflict: 'rider_id,cycle_start,cycle_end,bonus_type' })
      if (error) throw error
      toast.success(`تم حفظ تقييم الحافز: ${money(normalizedBonusEarned)} ج.م`)
      await loadReport()
    } catch (error: any) {
      toast.error(`تعذر حفظ تقييم الحافز: ${error?.message || ''}`)
    } finally {
      setSaving(false)
    }
  }

  async function saveAdjustment() {
    if (!rider) return toast.error('اختار المندوب أولًا')
    const amount = Number(adjustmentAmount)
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('اكتب قيمة صحيحة')
    if (adjustmentReason.trim().length < 5) return toast.error('اكتب سبب واضح')
    setSaving(true)
    try {
      const payload = {
        rider_id: rider.id,
        rider_name: rider.name || rider.username,
        branch_name: rider.branch_name || null,
        cycle_start: adjustmentFrom,
        cycle_end: adjustmentTo,
        adjustment_type: adjustmentType,
        amount,
        multiplier: 1,
        reason: adjustmentReason.trim(),
        admin_note: adjustmentCycle === 'previous' ? 'تطبيق استثنائي على الدورة السابقة' : 'تسجيل يدوي من مركز مستحقات الدليفري',
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by_name: 'د/ معاذ',
      }
      const { error } = await supabase.from('rider_adjustments').insert(payload)
      if (error) throw error
      toast.success(adjustmentType === 'penalty' ? 'تم تسجيل الخصم' : 'تم تسجيل المكافأة')
      setAdjustmentAmount(''); setAdjustmentReason('')
      await loadReport()
    } catch (error: any) {
      toast.error(`تعذر التسجيل: ${error?.message || ''}`)
    } finally {
      setSaving(false)
    }
  }

  function printPdf() {
    document.title = `تقرير مستحقات ${rider?.name || rider?.username || 'دليفري'} ${from} - ${to}`
    window.print()
  }

  return (
    <div className="space-y-5 text-right" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border bg-white p-4 shadow-sm print:hidden">
        <div>
          <button onClick={() => navigate('/admin/riders')} className="mb-2 inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700"><ArrowRight size={16}/> رجوع</button>
          <h1 className="text-3xl font-black text-[#061827]">تقرير ومستحقات الدليفري</h1>
          <p className="mt-1 text-sm font-bold text-slate-500">الأوردرات والمشاوير والحوافز والخصومات في تقرير واحد قابل للحفظ PDF.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadReport} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl border px-4 py-3 font-black text-slate-700"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/> تحديث</button>
          <button onClick={printPdf} className="inline-flex items-center gap-2 rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white"><Printer size={18}/> حفظ التقرير PDF</button>
        </div>
      </header>

      <section className="rounded-3xl border bg-white p-4 shadow-sm print:hidden">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-xs font-black text-slate-500 md:col-span-2">المندوب
            <select value={riderId} onChange={event => setRiderId(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black">
              {riders.map(item => <option key={item.id} value={item.id}>{item.name || item.username} — {item.branch_name || 'بدون فرع'}</option>)}
            </select>
          </label>
          <label className="text-xs font-black text-slate-500">من<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black"/></label>
          <label className="text-xs font-black text-slate-500">إلى<input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black"/></label>
          <div className="flex items-end gap-2"><button onClick={() => setCycle('current')} className="rounded-2xl bg-[#EAF8F8] px-3 py-3 text-xs font-black text-[#008E92]">الحالية</button><button onClick={() => setCycle('previous')} className="rounded-2xl bg-slate-100 px-3 py-3 text-xs font-black text-slate-700">السابقة</button></div>
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-2xl font-black text-[#061827]">{rider?.name || rider?.username || 'اختر مندوبًا'}</h2><p className="text-sm font-bold text-slate-500">{rider?.branch_name || 'بدون فرع'} · الفترة {from} إلى {to}</p></div>
          <div className="text-left"><p className="text-xs font-black text-slate-500">آخر حافز ربع سنوي</p><p className="font-black text-[#008E92]">{lastQuarterly?.approved_at ? new Date(lastQuarterly.approved_at).toLocaleDateString('ar-EG') : 'لم يُسجل بعد'}</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['الأوردرات المحتسبة', summary.countedOrders], ['المشاوير المعتمدة', summary.approvedTrips], ['قيمة الأوردرات', `${money(summary.orderValue)} ج`], ['قيمة المشاوير', `${money(summary.tripValue)} ج`], ['الصافي النهائي', `${money(summary.net)} ج`],
          ].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-[#061827]">{value}</p></div>)}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 print:hidden">
        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-black text-[#061827]">أسعار الاحتساب</h2>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs font-black text-slate-500">سعر الأوردر<input type="number" value={orderRate} onChange={event => setOrderRate(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3"/></label><label className="text-xs font-black text-slate-500">سعر المشوار<input type="number" value={tripRate} onChange={event => setTripRate(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3"/></label></div>
        </div>
        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-black text-[#061827]">خصم أو مكافأة استثنائية</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={adjustmentType} onChange={event => setAdjustmentType(event.target.value as AdjustmentType)} className="rounded-2xl border bg-slate-50 px-3 py-3 font-black"><option value="penalty">خصم</option><option value="reward">مكافأة</option></select>
            <input type="number" value={adjustmentAmount} onChange={event => setAdjustmentAmount(event.target.value)} placeholder="القيمة" className="rounded-2xl border bg-slate-50 px-3 py-3 font-black"/>
            <select value={adjustmentCycle} onChange={event => setAdjustmentCycle(event.target.value as any)} className="rounded-2xl border bg-slate-50 px-3 py-3 font-black"><option value="current">الدورة الحالية</option><option value="previous">الدورة السابقة استثنائيًا</option><option value="custom">فترة مخصصة</option></select>
            <input value={adjustmentReason} onChange={event => setAdjustmentReason(event.target.value)} placeholder="سبب واضح" className="rounded-2xl border bg-slate-50 px-3 py-3 font-black"/>
            {adjustmentCycle === 'custom' && <><input type="date" value={adjustmentFrom} onChange={event => setAdjustmentFrom(event.target.value)} className="rounded-2xl border bg-slate-50 px-3 py-3"/><input type="date" value={adjustmentTo} onChange={event => setAdjustmentTo(event.target.value)} className="rounded-2xl border bg-slate-50 px-3 py-3"/></>}
          </div>
          <button onClick={saveAdjustment} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-black text-white"><Save size={16}/> تسجيل الحركة</button>
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-black text-[#061827]">تقييم الحافز</h2><p className="text-sm font-bold text-slate-500">كل بند درجته من 5، وقيمة البند تُحتسب بنسبة الدرجة.</p></div>
          <div className="flex gap-2 print:hidden"><button onClick={() => setBonusType('monthly')} className={`rounded-2xl px-4 py-2 font-black ${bonusType === 'monthly' ? 'bg-[#008E92] text-white' : 'bg-slate-100 text-slate-700'}`}>شهري</button><button onClick={() => setBonusType('quarterly')} className={`rounded-2xl px-4 py-2 font-black ${bonusType === 'quarterly' ? 'bg-[#008E92] text-white' : 'bg-slate-100 text-slate-700'}`}>كل 3 شهور</button></div>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-2 print:hidden"><label className="text-xs font-black text-slate-500">قيمة الحافز الأساسية<input type="number" value={bonusType === 'monthly' ? monthlyBonusBase : quarterlyBonusBase} onChange={event => bonusType === 'monthly' ? setMonthlyBonusBase(event.target.value) : setQuarterlyBonusBase(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3"/></label><label className="text-xs font-black text-slate-500">ملاحظات التقييم<input value={assessmentNote} onChange={event => setAssessmentNote(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3"/></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-sm"><thead><tr className="bg-[#061827] text-white"><th className="p-3">البند</th><th className="p-3">الوصف</th><th className="p-3">قيمة البند</th><th className="p-3">الدرجة /5</th><th className="p-3">المستحق</th></tr></thead><tbody>{criteria.map((item, index) => <tr key={item.key} className="border-b"><td className="p-3 font-black">{item.label}</td><td className="p-3 text-slate-500">{item.description}</td><td className="p-3"><input type="number" value={item.weight} onChange={event => updateCriterion(index, 'weight', event.target.value)} className="w-24 rounded-xl border px-2 py-2 print:border-0"/></td><td className="p-3"><input type="number" min="0" max="5" step="0.5" value={item.score} onChange={event => updateCriterion(index, 'score', event.target.value)} className="w-20 rounded-xl border px-2 py-2 print:border-0"/></td><td className="p-3 font-black text-[#008E92]">{money((item.weight * item.score / 5) * (criteriaWeightTotal ? bonusBase / criteriaWeightTotal : 0))} ج</td></tr>)}</tbody></table></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#EAF8F8] p-4"><div><p className="text-sm font-black text-slate-500">الحافز المستحق</p><p className="text-3xl font-black text-[#008E92]">{money(normalizedBonusEarned)} ج.م</p></div><button onClick={saveAssessment} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white print:hidden"><Save size={17}/> حفظ واعتماد التقييم</button></div>
      </section>

      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xl font-black text-[#061827]">ملخص الخصومات والمكافآت</h2>
        <div className="grid gap-3 md:grid-cols-4"><div className="rounded-2xl bg-rose-50 p-4"><p className="text-xs font-black text-rose-600">الخصومات</p><p className="text-2xl font-black text-rose-700">{money(summary.penalties)} ج</p></div><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-black text-emerald-600">المكافآت</p><p className="text-2xl font-black text-emerald-700">{money(summary.rewards)} ج</p></div><div className="rounded-2xl bg-sky-50 p-4"><p className="text-xs font-black text-sky-600">الحافز</p><p className="text-2xl font-black text-sky-700">{money(normalizedBonusEarned)} ج</p></div><div className="rounded-2xl bg-slate-900 p-4 text-white"><p className="text-xs font-black text-slate-300">صافي المستحق</p><p className="text-2xl font-black">{money(summary.net)} ج</p></div></div>
        <div className="mt-4 space-y-2">{adjustments.length === 0 ? <p className="text-sm font-bold text-slate-400">لا توجد حركات مسجلة في هذه الدورة.</p> : adjustments.map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-2xl border p-3 text-sm"><span className="font-black">{item.adjustment_type === 'penalty' ? 'خصم' : 'مكافأة'} — {item.reason}</span><span className={item.adjustment_type === 'penalty' ? 'font-black text-rose-700' : 'font-black text-emerald-700'}>{money(Math.abs(Number(item.final_amount ?? item.amount ?? 0)))} ج</span><span className="text-slate-400">{item.cycle_start} → {item.cycle_end}</span></div>)}</div>
      </section>
    </div>
  )
}
