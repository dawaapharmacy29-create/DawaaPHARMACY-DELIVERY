import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bell, Printer, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'

type Row = Record<string, any>
type AdjustmentType = 'reward' | 'penalty'

function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function currentCycleRange() {
  const now = new Date()
  const start = now.getDate() >= 26 ? new Date(now.getFullYear(), now.getMonth(), 26) : new Date(now.getFullYear(), now.getMonth() - 1, 26)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25)
  return { start: iso(start), end: iso(end) }
}

function money(value: number) {
  return Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })
}

function statusOf(row: Row) {
  return String(row.status || '').toLowerCase()
}

function orderMultiplier(order: Row) {
  return Number(order.order_multiplier ?? 1) || 1
}

function rowDate(row: Row, fallbackKey: string) {
  return String(row.work_date || row[fallbackKey] || row.registered_at || row.created_at || '').slice(0, 10)
}

export default function RiderMonthlyReports() {
  const navigate = useNavigate()
  const cycle = currentCycleRange()
  const [riders, setRiders] = useState<Row[]>([])
  const [riderId, setRiderId] = useState('')
  const [from, setFrom] = useState(cycle.start)
  const [to, setTo] = useState(cycle.end)
  const [orders, setOrders] = useState<Row[]>([])
  const [trips, setTrips] = useState<Row[]>([])
  const [adjustments, setAdjustments] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('penalty')
  const [amount, setAmount] = useState('')
  const [multiplier, setMultiplier] = useState('1')
  const [reason, setReason] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [sourceRole, setSourceRole] = useState('customer')
  const [adminNote, setAdminNote] = useState('')

  const rider = useMemo(() => riders.find(r => String(r.id) === riderId) || null, [riders, riderId])

  async function loadRiders() {
    const { data, error } = await supabase
      .from('riders')
      .select('id,name,username,branch_name,branch_id,order_rate,trip_rate,status')
      .order('name', { ascending: true })
    if (error) {
      toast.error(`تعذر تحميل المناديب: ${error.message}`)
      return
    }
    const rows = (data || []) as Row[]
    setRiders(rows)
    if (!riderId && rows[0]?.id) setRiderId(String(rows[0].id))
  }

  async function loadReport() {
    if (!riderId) return
    setLoading(true)
    const [ordersRes, tripsRes, adjustmentsRes] = await Promise.allSettled([
      supabase.from('delivery_orders').select('*').eq('rider_id', riderId).gte('work_date', from).lte('work_date', to).order('work_date', { ascending: false }),
      supabase.from('internal_trips').select('*').eq('rider_id', riderId).gte('work_date', from).lte('work_date', to).order('work_date', { ascending: false }),
      supabase.from('rider_adjustments').select('*').eq('rider_id', riderId).gte('cycle_start', from).lte('cycle_end', to).order('created_at', { ascending: false }),
    ])
    setOrders(ordersRes.status === 'fulfilled' && !ordersRes.value.error ? ((ordersRes.value.data || []) as Row[]) : [])
    setTrips(tripsRes.status === 'fulfilled' && !tripsRes.value.error ? ((tripsRes.value.data || []) as Row[]) : [])
    setAdjustments(adjustmentsRes.status === 'fulfilled' && !adjustmentsRes.value.error ? ((adjustmentsRes.value.data || []) as Row[]) : [])
    if (adjustmentsRes.status === 'fulfilled' && adjustmentsRes.value.error) toast.warning('شغل Migration 0072 لتفعيل جدول الحركات')
    setLoading(false)
  }

  useEffect(() => { void loadRiders() }, [])
  useEffect(() => { void loadReport() }, [riderId, from, to])

  const summary = useMemo(() => {
    const validOrders = orders.filter(o => !['failed', 'cancelled', 'canceled'].includes(statusOf(o)))
    const normalOrders = validOrders.filter(o => orderMultiplier(o) < 1.5)
    const multiplierOrders = validOrders.filter(o => orderMultiplier(o) >= 1.5)
    const failedOrders = orders.filter(o => statusOf(o) === 'failed')
    const approvedTrips = trips.filter(t => ['approved', 'completed'].includes(statusOf(t)))
    const pendingTrips = trips.filter(t => statusOf(t) === 'pending_approval')
    const orderRate = Number(rider?.order_rate || 0)
    const tripRate = Number(rider?.trip_rate || 0)
    const normalOrdersValue = normalOrders.reduce((sum, o) => sum + Number(o.order_earning ?? orderRate), 0)
    const multiplierOrdersValue = multiplierOrders.reduce((sum, o) => sum + Number(o.order_earning ?? orderRate * orderMultiplier(o)), 0)
    const tripsValue = approvedTrips.reduce((sum, t) => sum + Number(t.trip_earning ?? tripRate), 0)
    const rewardsTotal = adjustments.filter(a => a.adjustment_type === 'reward' && String(a.status || '').toLowerCase() === 'approved').reduce((sum, a) => sum + Math.abs(Number(a.final_amount ?? a.amount ?? 0)), 0)
    const penaltiesTotal = adjustments.filter(a => a.adjustment_type === 'penalty' && String(a.status || '').toLowerCase() === 'approved').reduce((sum, a) => sum + Math.abs(Number(a.final_amount ?? a.amount ?? 0)), 0)
    const gross = normalOrdersValue + multiplierOrdersValue + tripsValue + rewardsTotal
    return {
      normalOrdersCount: normalOrders.length,
      multiplierOrdersCount: multiplierOrders.length,
      failedOrdersCount: failedOrders.length,
      tripsCount: trips.length,
      approvedTripsCount: approvedTrips.length,
      pendingTripsCount: pendingTrips.length,
      normalOrdersValue,
      multiplierOrdersValue,
      tripsValue,
      rewardsTotal,
      penaltiesTotal,
      gross,
      net: gross - penaltiesTotal,
    }
  }, [orders, trips, adjustments, rider])

  async function saveAdjustment() {
    if (!rider) return toast.error('اختار الدليفري أولاً')
    const value = Number(amount)
    const mult = Number(multiplier || 1)
    if (!Number.isFinite(value) || value <= 0) return toast.error('اكتب قيمة صحيحة')
    if (!Number.isFinite(mult) || mult <= 0) return toast.error('اكتب معامل صحيح')
    if (reason.trim().length < 5) return toast.error('اكتب سبب واضح')
    setSaving(true)
    const payload = {
      rider_id: rider.id,
      rider_name: rider.name || rider.username || null,
      branch_name: rider.branch_name || null,
      cycle_start: from,
      cycle_end: to,
      adjustment_type: adjustmentType,
      amount: value,
      multiplier: mult,
      reason: reason.trim(),
      source_person_name: sourceName.trim() || null,
      source_person_role: sourceRole || null,
      admin_note: adminNote.trim() || null,
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('rider_adjustments').insert(payload).select('*').single()
    if (error) {
      setSaving(false)
      toast.error(`تعذر الحفظ: ${error.message}`)
      return
    }
    const finalAmount = Number((data as any)?.final_amount ?? (adjustmentType === 'penalty' ? -Math.abs(value) * mult : Math.abs(value) * mult))
    const title = adjustmentType === 'reward' ? 'تم تسجيل مكافأة' : 'تم تسجيل خصم'
    const body = `${adjustmentType === 'reward' ? 'مكافأة' : 'خصم'} بقيمة ${money(Math.abs(finalAmount))} ج.م. السبب: ${reason.trim()}. سيتم مراجعة واعتماد التفاصيل من الإدارة.`
    try {
      await supabase.from('rider_notifications').insert({ rider_id: riderId, title, message: body, body, created_at: new Date().toISOString() })
    } catch {}
    toast.success('تم الحفظ وإرسال تنبيه للدليفري')
    setAmount('')
    setMultiplier('1')
    setReason('')
    setSourceName('')
    setAdminNote('')
    setSaving(false)
    await loadReport()
  }

  function printPdf() {
    document.title = `تقرير ${rider?.name || rider?.username || 'دليفري'} ${from} - ${to}`
    window.print()
  }

  return (
    <div className="space-y-5 text-right" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white bg-white p-4 shadow-sm print:hidden">
        <div>
          <button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-600"><ArrowRight size={16}/> رجوع</button>
          <h1 className="text-3xl font-black text-[#061827]">تقارير وحوافز الدليفري</h1>
          <p className="mt-1 text-sm font-bold text-slate-500">تسجيل خصم أو مكافأة مع تنبيه فوري، وتجهيز تقرير شهري للحفظ PDF.</p>
        </div>
        <button onClick={printPdf} className="inline-flex items-center gap-2 rounded-3xl bg-[#008E92] px-5 py-3 font-black text-white"><Printer size={18}/> طباعة / حفظ PDF</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] print:hidden">
        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-black text-[#061827]">اختيار التقرير</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-xs font-black text-slate-500 md:col-span-2">الدليفري
              <select value={riderId} onChange={event => setRiderId(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black outline-none focus:border-[#008E92]">
                {riders.map(r => <option key={r.id} value={r.id}>{r.name || r.username} — {r.branch_name || 'بدون فرع'}</option>)}
              </select>
            </label>
            <label className="text-xs font-black text-slate-500">من
              <input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black outline-none focus:border-[#008E92]" />
            </label>
            <label className="text-xs font-black text-slate-500">إلى
              <input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black outline-none focus:border-[#008E92]" />
            </label>
          </div>
          <button onClick={loadReport} disabled={loading} className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 font-black text-slate-700"><RefreshCw size={16}/> {loading ? 'جاري التحديث...' : 'تحديث التقرير'}</button>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-black text-[#061827]">تسجيل خصم / مكافأة</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <select value={adjustmentType} onChange={event => setAdjustmentType(event.target.value as AdjustmentType)} className="rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black"><option value="penalty">خصم</option><option value="reward">مكافأة</option></select>
            <input value={amount} onChange={event => setAmount(event.target.value)} type="number" min="0" placeholder="القيمة" className="rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black" />
            <select value={multiplier} onChange={event => setMultiplier(event.target.value)} className="rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black"><option value="1">×1</option><option value="2">×2</option><option value="3">×3</option></select>
            <select value={sourceRole} onChange={event => setSourceRole(event.target.value)} className="rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black"><option value="customer">عميل</option><option value="doctor">دكتور</option><option value="admin">الإدارة</option><option value="other">أخرى</option></select>
            <input value={sourceName} onChange={event => setSourceName(event.target.value)} placeholder="اسم العميل/الدكتور" className="rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black md:col-span-2" />
            <input value={reason} onChange={event => setReason(event.target.value)} placeholder="السبب" className="rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black md:col-span-2" />
            <textarea value={adminNote} onChange={event => setAdminNote(event.target.value)} placeholder="ملاحظة الإدارة" className="min-h-[70px] rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black md:col-span-2" />
          </div>
          <button onClick={saveAdjustment} disabled={saving} className={`mt-3 inline-flex items-center gap-2 rounded-2xl px-4 py-3 font-black text-white ${adjustmentType === 'reward' ? 'bg-emerald-600' : 'bg-rose-600'} disabled:opacity-50`}><Bell size={16}/> {saving ? 'جاري الحفظ...' : 'حفظ وإرسال تنبيه'}</button>
        </section>
      </div>

      <section className="rounded-[28px] border bg-white p-5 shadow-sm print:border-0 print:shadow-none">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div><p className="text-xs font-black text-[#008E92]">Dawaa Delivery</p><h2 className="mt-1 text-2xl font-black text-[#061827]">تقرير دليفري شهري</h2><p className="mt-1 text-sm font-bold text-slate-500">دورة من {from} إلى {to}</p></div>
          <div className="text-left"><p className="text-xl font-black text-[#061827]">{rider?.name || rider?.username || '—'}</p><p className="mt-1 text-sm font-bold text-slate-500">{rider?.branch_name || 'بدون فرع'}</p></div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="أوردرات ×1" value={summary.normalOrdersCount} sub={`${money(summary.normalOrdersValue)} ج.م`} />
          <Metric label="أوردرات ×1.5" value={summary.multiplierOrdersCount} sub={`${money(summary.multiplierOrdersValue)} ج.م`} />
          <Metric label="المشاوير" value={summary.tripsCount} sub={`المعتمد ${summary.approvedTripsCount} · المعلق ${summary.pendingTripsCount}`} />
          <Metric label="فواتير فاشلة" value={summary.failedOrdersCount} sub="للمراجعة" />
          <Metric label="مكافآت" value={money(summary.rewardsTotal)} sub="بعد الاعتماد" tone="green" />
          <Metric label="خصومات" value={money(summary.penaltiesTotal)} sub="بعد الاعتماد" tone="rose" />
          <Metric label="الإجمالي" value={money(summary.gross)} sub="قبل الخصم" />
          <Metric label="الصافي" value={money(summary.net)} sub="بعد الخصومات" tone="dark" />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Table title="آخر الأوردرات" headers={["التاريخ", "الفاتورة", "القيمة", "المعامل", "الحالة"]} rows={orders.slice(0, 25).map(o => [rowDate(o, 'delivery_date'), o.invoice_number || o.invoice_no || '—', money(Number(o.invoice_amount || o.invoice_value || 0)), `×${orderMultiplier(o)}`, o.status || '—'])} />
          <Table title="آخر المشاوير" headers={["التاريخ", "من", "إلى", "الحالة"]} rows={trips.slice(0, 25).map(t => [rowDate(t, 'trip_date'), t.from_label || '—', t.to_label || '—', t.status || '—'])} />
        </div>
        <div className="mt-5"><Table title="الخصومات والمكافآت" headers={["التاريخ", "النوع", "القيمة", "المصدر", "السبب"]} rows={adjustments.map(a => [String(a.created_at || '').slice(0, 10), a.adjustment_type === 'reward' ? 'مكافأة' : 'خصم', money(Math.abs(Number(a.final_amount || a.amount || 0))), a.source_person_name || a.source_person_role || '—', a.reason || '—'])} /></div>
        <p className="mt-5 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500">هذا التقرير قابل للمراجعة والاعتماد النهائي من الإدارة، وأي خصم أو مكافأة يظهر للدليفري من خلال تنبيهات التطبيق.</p>
      </section>
    </div>
  )
}

function Metric({ label, value, sub, tone = 'slate' }: { label: string; value: string | number; sub?: string; tone?: 'slate' | 'green' | 'rose' | 'dark' }) {
  const toneClass = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'rose' ? 'bg-rose-50 text-rose-700' : tone === 'dark' ? 'bg-[#061827] text-white' : 'bg-slate-50 text-[#061827]'
  return <div className={`rounded-3xl p-4 ${toneClass}`}><p className="text-xs font-black opacity-70">{label}</p><p className="mt-2 text-2xl font-black">{value}</p>{sub && <p className="mt-1 text-xs font-bold opacity-70">{sub}</p>}</div>
}

function Table({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return <div className="overflow-hidden rounded-3xl border"><div className="border-b bg-slate-50 p-3 font-black text-slate-700">{title}</div><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="bg-white text-slate-400"><tr>{headers.map(header => <th key={header} className="p-3 text-right font-black">{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index} className="border-t">{row.map((cell, cellIndex) => <td key={cellIndex} className="p-3 font-bold text-slate-700">{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="p-6 text-center font-black text-slate-400">لا توجد بيانات</td></tr>}</tbody></table></div></div>
}
