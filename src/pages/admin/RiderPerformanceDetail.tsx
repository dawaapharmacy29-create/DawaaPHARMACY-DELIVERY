import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'
import { displayBranchName } from '../../lib/branchUtils'
import CycleSelector from '../../components/CycleSelector'

type FilterKey = 'all' | 'one' | 'multi' | 'review' | 'delivered' | 'failed' | 'duplicate' | 'uncounted' | 'trips'

function n(v: any) { return Number(v || 0) || 0 }
function isDeleted(o: any) { return !!o?.deleted_at }
function isDelivered(o: any) { return ['delivered', 'تم التسليم'].includes(String(o?.status || '').toLowerCase()) || !!o?.delivered_at }
function isFailed(o: any) { const s = String(o?.status || '').toLowerCase(); return s.includes('fail') || s === 'failed' || !!o?.failed_at || !!o?.failed_reason }
function isMulti(o: any) { return Number(o?.order_multiplier ?? (o?.is_multiplier_order ? 1.5 : 1)) >= 1.5 }
function isDuplicate(o: any) { return !!(o?.is_duplicate_invoice || o?.duplicate_warning) }
function isUncounted(o: any) { const s = String(o?.count_status || o?.reconciliation_status || o?.review_status || '').toLowerCase(); return !!(o?.not_countable || o?.excluded_from_incentive || o?.is_countable === false) || ['rejected','not_countable','excluded','invoice_not_found'].includes(s) }
function isReview(o: any) { const s = String(o?.review_status || o?.status || '').toLowerCase(); return !!o?.needs_review || ['pending','needs_review','registered'].includes(s) }
function filterLabel(f: FilterKey) { return ({ all:'كل أوردرات المندوب', one:'أوردرات ×1', multi:'أوردرات ×1.5', review:'تحت المراجعة', delivered:'تم التسليم', failed:'الفاشلة', duplicate:'المكررة', uncounted:'غير محتسبة', trips:'المشاوير' } as Record<FilterKey,string>)[f] }

function Card({ label, value, tone='slate', onClick }: { label: string; value: any; tone?: string; onClick: () => void }) {
  const tones: Record<string,string> = { blue:'bg-sky-50 text-sky-700 border-sky-100', green:'bg-emerald-50 text-emerald-700 border-emerald-100', red:'bg-rose-50 text-rose-700 border-rose-100', orange:'bg-amber-50 text-amber-700 border-amber-100', purple:'bg-purple-50 text-purple-700 border-purple-100', slate:'bg-white text-slate-800 border-slate-100' }
  return <button type="button" onClick={onClick} className={`rounded-3xl border p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${tones[tone] || tones.slate}`}><p className="text-xs font-black opacity-70">{label}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-[11px] font-bold opacity-70">اضغط للتفاصيل</p></button>
}

export default function RiderPerformanceDetail() {
  const { riderId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const period = getOperationalPeriod()
  const selectedFrom = searchParams.get('from') || period.start
  const selectedTo = searchParams.get('to') || period.end
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rider, setRider] = useState<any>(null)
  const [branch, setBranch] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [attendanceRows, setAttendanceRows] = useState<any[]>([])
  const [riderActions, setRiderActions] = useState<any[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [edit, setEdit] = useState<any | null>(null)
  const [draft, setDraft] = useState<any | null>(null)

  useEffect(() => { void load() }, [riderId, selectedFrom, selectedTo])
  useEffect(() => {
    const raw = searchParams.get('filter')
    const normalized = raw === 'multiplier' ? 'multi' : raw
    if (normalized && ['all', 'one', 'multi', 'review', 'delivered', 'failed', 'duplicate', 'uncounted', 'trips'].includes(normalized)) {
      setFilter(normalized as FilterKey)
      setTimeout(() => document.getElementById('rider-orders-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    }
  }, [searchParams])

  async function load() {
    if (!riderId) return
    setLoading(true)
    try {
      const { data: r } = await supabase.from('riders').select('*').eq('id', riderId).maybeSingle()
      setRider(r)
      if (r?.branch_id) {
        const { data: b } = await supabase.from('delivery_branches').select('*').eq('id', r.branch_id).maybeSingle()
        setBranch(b)
      }
      const [or, tr, at, ac] = await Promise.all([
        supabase.from('delivery_orders').select('*').eq('rider_id', riderId).gte('delivery_date', selectedFrom).lte('delivery_date', selectedTo).order('delivery_date', { ascending: false }),
        supabase.from('internal_trips').select('*').eq('rider_id', riderId).gte('trip_date', selectedFrom).lte('trip_date', selectedTo).order('trip_date', { ascending: false }),
        supabase.from('attendance').select('*').eq('rider_id', riderId).gte('work_date', selectedFrom).lte('work_date', selectedTo),
        supabase.from('rider_shift_actions').select('*').eq('rider_id', riderId).gte('shift_date', selectedFrom).lte('shift_date', selectedTo),
      ])
      if (or.error) throw or.error
      if (tr.error) throw tr.error
      if (at.error) throw at.error
      if (ac.error) throw ac.error
      setOrders(or.data || [])
      setTrips(tr.data || [])
      setAttendanceRows(at.data || [])
      setRiderActions(ac.data || [])
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل تفاصيل الدليفري')
    } finally { setLoading(false) }
  }

  const stats = useMemo(() => {
    const clean = orders.filter(o => !isDeleted(o))
    const one = clean.filter(o => !isMulti(o) && !isFailed(o))
    const counted = clean.filter(o => o.is_countable === true || String(o.final_count_status || o.reconciliation_status || '').startsWith('counted'))
    const notFound = clean.filter(o => o.bconnect_match_status === 'invoice_not_found' || String(o.final_count_status || o.reconciliation_status || '').includes('not_found'))
    const attendanceMinutes = attendanceRows.reduce((sum, row: any) => {
      if (typeof row.total_minutes === 'number' && row.total_minutes > 0) return sum + row.total_minutes
      if (row.check_in_at && row.check_out_at) return sum + Math.max(0, Math.round((new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 60000))
      return sum
    }, 0)
    const approvedDeductions = riderActions.filter((row: any) => row.review_status === 'approved' && ['deduction', 'deduction_request'].includes(String(row.final_action_type || row.action_type || '').toLowerCase()))
    const approvedRewards = riderActions.filter((row: any) => row.review_status === 'approved' && ['reward', 'reward_request'].includes(String(row.final_action_type || row.action_type || '').toLowerCase()))
    const deductions = approvedDeductions.reduce((sum, row: any) => sum + Number(row.final_amount ?? row.requested_amount ?? 0), 0)
    const rewards = approvedRewards.reduce((sum, row: any) => sum + Number(row.final_amount ?? row.requested_amount ?? 0), 0)
    const revenue = clean.reduce((sum, o: any) => sum + n(o.invoice_amount || o.invoice_value || o.amount), 0)
    const net = revenue - deductions + rewards
    const riskScore = clean.filter(isFailed).length + clean.filter(isDuplicate).length + notFound.length + clean.filter(isUncounted).length + clean.filter(isReview).length
    return {
      clean,
      one,
      counted,
      multi: clean.filter(isMulti),
      review: clean.filter(isReview),
      delivered: clean.filter(isDelivered),
      failed: clean.filter(isFailed),
      duplicate: clean.filter(isDuplicate),
      uncounted: clean.filter(isUncounted),
      notFound,
      trips: trips.filter((t:any) => ['approved','countable','تم الاعتماد'].includes(String(t.status || t.review_status || '').toLowerCase())),
      attendanceDays: new Set(attendanceRows.filter((row: any) => row.check_in_at || row.work_date).map((row: any) => row.work_date)).size,
      attendanceHours: Math.round((attendanceMinutes / 60) * 100) / 100,
      deductions,
      rewards,
      net,
      riskScore,
    }
  }, [orders, trips, attendanceRows, riderActions])

  const visibleOrders = useMemo(() => {
    if (filter === 'one') return stats.one
    if (filter === 'multi') return stats.multi
    if (filter === 'review') return stats.review
    if (filter === 'delivered') return stats.delivered
    if (filter === 'failed') return stats.failed
    if (filter === 'duplicate') return stats.duplicate
    if (filter === 'uncounted') return stats.uncounted
    return stats.clean
  }, [filter, stats])

  function openFilter(next: FilterKey) {
    setFilter(next)
    const nextParams = new URLSearchParams(searchParams)
    if (next === 'all') nextParams.delete('filter')
    else nextParams.set('filter', next === 'multi' ? 'multiplier' : next)
    setSearchParams(nextParams)
    setTimeout(() => document.getElementById('rider-orders-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  function handleCycleApply(from: string, to: string) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('from', from)
    nextParams.set('to', to)
    setSearchParams(nextParams)
  }

  function openEdit(order: any) {
    setEdit(order)
    setDraft({
      invoiceNumber: order.invoice_number || order.invoice_no || '',
      customerName: order.customer_name || order.customer_name_snapshot || '',
      customerPhone: order.customer_phone || order.customer_phone_snapshot || '',
      customerAddress: order.customer_address || order.customer_address_snapshot || '',
      amount: order.invoice_amount || order.invoice_value || order.amount || '',
      status: order.status || 'registered',
      multiplier: String(order.order_multiplier || (order.is_multiplier_order ? 1.5 : 1)),
      reviewStatus: order.review_status || '',
      note: '',
    })
  }

  async function saveEdit() {
    if (!edit || !draft) return
    try {
      setSaving(true)
      const multiplier = Number(draft.multiplier || 1) || 1
      const amount = Number(draft.amount || 0) || 0
      const patch: any = {
        invoice_number: String(draft.invoiceNumber || '').trim() || null,
        invoice_no: String(draft.invoiceNumber || '').trim() || null,
        customer_name: String(draft.customerName || '').trim() || null,
        customer_name_snapshot: String(draft.customerName || '').trim() || null,
        customer_phone: String(draft.customerPhone || '').trim() || null,
        customer_phone_snapshot: String(draft.customerPhone || '').trim() || null,
        customer_address: String(draft.customerAddress || '').trim() || null,
        customer_address_snapshot: String(draft.customerAddress || '').trim() || null,
        invoice_amount: amount,
        invoice_value: amount,
        status: draft.status || 'registered',
        order_multiplier: multiplier,
        is_multiplier_order: multiplier >= 1.5,
        review_status: draft.reviewStatus || null,
        needs_review: !!draft.reviewStatus,
        updated_at: new Date().toISOString(),
      }
      if (String(draft.note || '').trim()) patch.notes = `${edit.notes ? `${edit.notes}\n` : ''}تعديل المدير العام: ${draft.note}`
      const { data, error } = await supabase.from('delivery_orders').update(patch).eq('id', edit.id).select('*').single()
      if (error) throw error
      setOrders(prev => prev.map(o => o.id === edit.id ? data : o))
      setEdit(null); setDraft(null)
      toast.success('تم تعديل الأوردر')
    } catch (e: any) { toast.error(e?.message || 'تعذر تعديل الأوردر') }
    finally { setSaving(false) }
  }

  return <div className="min-h-screen bg-[#F3F7F8] print:bg-white" dir="rtl">
    <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 shadow-sm print:static print:shadow-none">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <button onClick={() => navigate('/admin/performance')} className="no-print flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"><ArrowLeft size={16}/> رجوع</button>
        <div className="text-center"><p className="text-lg font-black text-[#061827]">تقرير دليفري تفصيلي</p><p className="text-xs font-bold text-slate-400">الدورة الحالية: {period.start} إلى {period.end}</p></div>
        <button onClick={() => window.print()} className="no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm"><Download size={16}/> PDF</button>
      </div>
    </header>

    <main className="mx-auto max-w-7xl space-y-4 p-4 print:p-0">
      {loading ? <div className="rounded-3xl bg-white p-8 text-center font-black text-slate-500">جاري تحميل التفاصيل...</div> : <>
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3"><img src="/logo.png" className="h-16 w-16 rounded-3xl border object-contain p-1"/><div><h1 className="text-2xl font-black text-[#061827]">{rider?.name || rider?.username || 'دليفري'}</h1><p className="font-bold text-slate-500">{displayBranchName(branch?.name || rider?.branch_name)} · {rider?.status || 'active'}</p></div></div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-center text-emerald-700"><p className="text-xs font-black">إجمالي الأوردرات</p><p className="text-3xl font-black">{stats.clean.length}</p></div>
          </div>
        </section>

        <CycleSelector from={selectedFrom} to={selectedTo} onApply={handleCycleApply} />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Card label="إجمالي الأوردرات" value={stats.clean.length} tone="blue" onClick={() => openFilter('all')} />
          <Card label="محتسبة" value={stats.counted.length} tone="green" onClick={() => openFilter('all')} />
          <Card label="أوردرات ×1" value={stats.one.length} tone="blue" onClick={() => openFilter('one')} />
          <Card label="أوردرات ×1.5" value={stats.multi.length} tone="orange" onClick={() => openFilter('multi')} />
          <Card label="الفاشلة" value={stats.failed.length} tone="red" onClick={() => openFilter('failed')} />
          <Card label="المكررة" value={stats.duplicate.length} tone="red" onClick={() => openFilter('duplicate')} />
          <Card label="غير موجودة" value={stats.notFound.length} tone="slate" onClick={() => openFilter('uncounted')} />
          <Card label="غير محتسبة" value={stats.uncounted.length} tone="slate" onClick={() => openFilter('uncounted')} />
          <Card label="المشاوير" value={stats.trips.length} tone="purple" onClick={() => openFilter('trips')} />
          <Card label="أيام حضور" value={stats.attendanceDays} tone="purple" onClick={() => openFilter('all')} />
          <Card label="ساعات حضور" value={stats.attendanceHours} tone="slate" onClick={() => openFilter('all')} />
          <Card label="خصومات" value={formatMoney(stats.deductions)} tone="red" onClick={() => openFilter('all')} />
          <Card label="مكافآت" value={formatMoney(stats.rewards)} tone="green" onClick={() => openFilter('all')} />
          <Card label="صافي تقديري" value={formatMoney(stats.net)} tone="blue" onClick={() => openFilter('all')} />
          <Card label="Risk Score" value={stats.riskScore} tone={stats.riskScore > 8 ? 'red' : stats.riskScore > 3 ? 'orange' : 'green'} onClick={() => openFilter('review')} />
        </section>

        <section id="rider-orders-list" className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="font-black text-[#061827]">{filterLabel(filter)}</div>
            <div className="flex flex-wrap gap-2">{(['all','one','multi','review','delivered','failed','duplicate','uncounted','trips'] as FilterKey[]).map(f => <button key={f} onClick={() => openFilter(f)} className={`cursor-pointer rounded-xl px-3 py-2 text-xs font-black transition hover:-translate-y-0.5 hover:shadow-lg ${filter === f ? 'bg-[#008E92] text-white' : 'bg-slate-100 text-slate-600'}`} title="اضغط للتفاصيل">{filterLabel(f)}</button>)}</div>
          </div>
          {filter === 'trips' ? <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">التاريخ</th><th className="p-3">من</th><th className="p-3">إلى</th><th className="p-3">السبب</th><th className="p-3">الحالة</th><th className="p-3">القيمة</th></tr></thead><tbody>{trips.map((t:any) => <tr key={t.id} className="border-t"><td className="p-3">{(t.work_date || t.trip_date || t.created_at || '').slice(0,10)}</td><td className="p-3 font-bold">{t.from_label || '—'}</td><td className="p-3 font-bold">{t.to_label || '—'}</td><td className="p-3">{t.reason || t.notes || '—'}</td><td className="p-3">{t.status || t.review_status || '—'}</td><td className="p-3">{formatMoney(n(t.trip_earning || t.trip_rate))}</td></tr>)}</tbody></table></div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">التاريخ</th><th className="p-3">الفاتورة</th><th className="p-3">العميل</th><th className="p-3">الحالة</th><th className="p-3">×</th><th className="p-3">القيمة</th><th className="p-3">مراجعة</th><th className="p-3 no-print">إجراء</th></tr></thead><tbody>{visibleOrders.slice(0,250).map((o:any) => <tr key={o.id} className="border-t"><td className="p-3">{(o.delivery_date || o.work_date || o.created_at || '').slice(0,10)}</td><td className="p-3 font-black">{o.invoice_number || o.invoice_no || '—'}</td><td className="p-3">{o.customer_name || o.customer_name_snapshot || '—'}</td><td className="p-3">{o.status || '—'}</td><td className="p-3 font-black">{isMulti(o) ? '1.5' : '1'}</td><td className="p-3">{formatMoney(n(o.invoice_amount || o.invoice_value || o.amount))}</td><td className="p-3">{o.review_status || o.reconciliation_status || '—'}</td><td className="p-3 no-print"><button onClick={() => openEdit(o)} className="rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white">تعديل</button></td></tr>)}</tbody></table></div>}
        </section>
      </>}
    </main>

    {edit && draft ? <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm no-print" dir="rtl"><div className="mx-auto flex h-full max-w-3xl items-end sm:items-center"><section className="max-h-[92vh] w-full overflow-y-auto rounded-[32px] bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black text-[#061827]">تعديل الأوردر</h2><button onClick={() => { setEdit(null); setDraft(null) }} className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100"><X size={18}/></button></div><div className="grid gap-3 md:grid-cols-2">
      <input value={draft.invoiceNumber} onChange={e => setDraft({...draft, invoiceNumber:e.target.value})} className="rounded-2xl border px-3 py-2 font-bold" placeholder="رقم الفاتورة" />
      <input type="number" value={draft.amount} onChange={e => setDraft({...draft, amount:e.target.value})} className="rounded-2xl border px-3 py-2 font-bold" placeholder="القيمة" />
      <input value={draft.customerName} onChange={e => setDraft({...draft, customerName:e.target.value})} className="rounded-2xl border px-3 py-2 font-bold" placeholder="اسم العميل" />
      <input value={draft.customerPhone} onChange={e => setDraft({...draft, customerPhone:e.target.value})} className="rounded-2xl border px-3 py-2 font-bold" placeholder="التليفون" />
      <input value={draft.customerAddress} onChange={e => setDraft({...draft, customerAddress:e.target.value})} className="rounded-2xl border px-3 py-2 font-bold md:col-span-2" placeholder="العنوان" />
      <select value={draft.status} onChange={e => setDraft({...draft, status:e.target.value})} className="rounded-2xl border px-3 py-2 font-bold"><option value="registered">متسجل</option><option value="delivered">تم التسليم</option><option value="failed">فشل</option><option value="needs_review">مراجعة</option><option value="cancelled">ملغي</option></select>
      <select value={draft.multiplier} onChange={e => setDraft({...draft, multiplier:e.target.value})} className="rounded-2xl border px-3 py-2 font-bold"><option value="1">×1</option><option value="1.5">×1.5</option></select>
      <input value={draft.reviewStatus} onChange={e => setDraft({...draft, reviewStatus:e.target.value})} className="rounded-2xl border px-3 py-2 font-bold" placeholder="حالة المراجعة" />
      <input value={draft.note} onChange={e => setDraft({...draft, note:e.target.value})} className="rounded-2xl border px-3 py-2 font-bold" placeholder="ملاحظة المدير" />
    </div><div className="mt-5 grid grid-cols-2 gap-3"><button onClick={() => { setEdit(null); setDraft(null) }} className="rounded-2xl bg-slate-100 py-3 font-black text-slate-600">إلغاء</button><button disabled={saving} onClick={() => void saveEdit()} className="rounded-2xl bg-[#008E92] py-3 font-black text-white disabled:opacity-60">حفظ</button></div></section></div></div> : null}
    <style>{`@media print {.no-print{display:none!important} body{background:white!important} main{max-width:none!important} table{font-size:11px} }`}</style>
  </div>
}
