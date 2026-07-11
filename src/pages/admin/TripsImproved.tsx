import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, Search, Clock, MapPin, Eye, Camera, AlertTriangle, X, Square, CheckSquare, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { InternalTrip, Rider } from '../../lib/types'
import { getRiders } from '../../lib/delivery'
import { formatTime, getOperationalPeriod } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'

type TripRow = InternalTrip & {
  rider_name?: string | null; branch_name?: string | null; proof_required?: boolean | null
  proof_image_url?: string | null; proof_note?: string | null; proof_captured_at?: string | null
  proof_uploaded_at?: string | null; proof_source?: string | null; proof_review_status?: string | null
  evidence_status?: string | null; proof_exception_status?: string | null; proof_exception_reason?: string | null
  audit_status?: string | null; created_at?: string | null
}

const labels: Record<string,string> = { branch_to_branch:'بين الفروع', warehouse:'مخزن', supplies:'مستلزمات', pharmacy:'صيدلية', shipment_pickup:'استلام شحن', accessories:'إكسسوار', purchase_missing_item:'شراء نواقص', supplier:'مورد', returns:'مرتجع', collection:'تحصيل', visit_again:'زيارة تانية', other:'أخرى' }
const statusText: Record<string,string> = { pending_approval:'مستني اعتماد', approved:'معتمد', rejected:'مرفوض', completed:'تم', cancelled:'ملغي' }
const proofUrl = (t: TripRow) => String(t.proof_image_url || '').trim()
const statusClass = (s?: string | null) => s === 'approved' || s === 'completed' ? 'bg-emerald-100 text-emerald-700' : s === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
const displayDate = (v?: string | null) => v ? new Date(v).toLocaleString('ar-EG') : '—'

export default function TripsImproved() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [trips,setTrips] = useState<TripRow[]>([])
  const [riders,setRiders] = useState<Rider[]>([])
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState<Set<string>>(new Set())
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const [statusFilter,setStatusFilter] = useState<'all'|'pending_approval'|'approved'|'rejected'>('all')
  const [typeFilter,setTypeFilter] = useState('all')
  const [riderFilter,setRiderFilter] = useState('all')
  const [search,setSearch] = useState('')
  const [rejectTrip,setRejectTrip] = useState<TripRow|null>(null)
  const [rejectReason,setRejectReason] = useState('')
  const [details,setDetails] = useState<TripRow|null>(null)

  async function load() {
    setLoading(true)
    try {
      const [{data,error}, riderRows] = await Promise.all([
        supabase.from('internal_trip_daily_audit').select('*').gte('trip_date',period.start).lte('trip_date',period.end).order('registered_at',{ascending:false}).limit(2000),
        getRiders(),
      ])
      if (error) throw error
      setTrips((data || []) as TripRow[])
      setRiders(riderRows)
    } catch (e) { console.error(e); toast.error('فشل تحميل بيانات المشاوير') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const riderMap = useMemo(() => new Map(riders.map(r => [r.id,r])),[riders])
  const filtered = useMemo(() => trips.filter(t => {
    const riderName = t.rider_name || riderMap.get(t.rider_id)?.name || ''
    const q = search.trim()
    return (statusFilter === 'all' || t.status === statusFilter)
      && (typeFilter === 'all' || t.trip_type === typeFilter)
      && (riderFilter === 'all' || t.rider_id === riderFilter)
      && (!q || [t.reason,riderName,t.branch_name,t.from_label,t.to_label,t.related_invoice_number].some(v => String(v || '').includes(q)))
  }),[trips,statusFilter,typeFilter,riderFilter,search,riderMap])
  const pendingFiltered = filtered.filter(t => t.status === 'pending_approval')
  const allPendingSelected = pendingFiltered.length > 0 && pendingFiltered.every(t => selected.has(t.id))

  function patchLocal(id:string, patch:Partial<TripRow>) { setTrips(rows => rows.map(t => t.id === id ? {...t,...patch} : t)); setDetails(d => d?.id === id ? {...d,...patch} : d) }
  function setBusyId(id:string,on:boolean) { setBusy(prev => { const next = new Set(prev); on ? next.add(id) : next.delete(id); return next }) }

  async function changeStatus(trip:TripRow, status:'approved'|'rejected'|'pending_approval', reason?:string) {
    const previous = {...trip}
    const patch: Record<string,unknown> = status === 'approved'
      ? { status:'approved', review_status:'approved', approved_at:new Date().toISOString(), rejection_reason:null, needs_review:false, review_reason:null }
      : status === 'rejected'
        ? { status:'rejected', review_status:'rejected', approved_at:null, rejection_reason:reason || 'تم تعديل القرار إداريًا', needs_review:false, review_reason:null }
        : { status:'pending_approval', review_status:'pending_approval', approved_at:null, rejection_reason:null, needs_review:true, review_reason:'إعادة للمراجعة الإدارية' }
    setBusyId(trip.id,true)
    patchLocal(trip.id,patch as Partial<TripRow>)
    try {
      const {error} = await supabase.from('internal_trips').update(patch).eq('id',trip.id)
      if (error) throw error
      toast.success(status === 'approved' ? 'تم اعتماد المشوار بدون إعادة تحميل الصفحة' : status === 'rejected' ? 'تم رفض المشوار' : 'تمت إعادة المشوار للمراجعة')
    } catch (e) {
      patchLocal(trip.id,previous)
      console.error(e); toast.error('تعذر حفظ القرار وتمت إعادة الحالة السابقة')
    } finally { setBusyId(trip.id,false) }
  }

  async function bulkApprove() {
    const ids = [...selected].filter(id => trips.find(t => t.id === id)?.status === 'pending_approval')
    if (!ids.length) return toast.error('اختر مشاوير مستنية اعتماد')
    const previous = trips.filter(t => ids.includes(t.id))
    setTrips(rows => rows.map(t => ids.includes(t.id) ? {...t,status:'approved',review_status:'approved',approved_at:new Date().toISOString(),rejection_reason:null,needs_review:false} : t))
    setBusy(new Set([...busy,...ids]))
    const {error} = await supabase.from('internal_trips').update({status:'approved',review_status:'approved',approved_at:new Date().toISOString(),rejection_reason:null,needs_review:false,review_reason:null}).in('id',ids)
    setBusy(prev => { const n=new Set(prev); ids.forEach(id=>n.delete(id)); return n })
    if (error) {
      const oldMap = new Map(previous.map(t => [t.id,t]))
      setTrips(rows => rows.map(t => oldMap.get(t.id) || t))
      toast.error('فشل اعتماد المجموعة وتمت إعادة الحالات السابقة')
    } else { setSelected(new Set()); toast.success(`تم اعتماد ${ids.length} مشوار بدون إعادة تحميل الصفحة`) }
  }

  function toggle(id:string) { setSelected(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n }) }
  function toggleAllPending() { setSelected(prev => { const n=new Set(prev); if (allPendingSelected) pendingFiltered.forEach(t=>n.delete(t.id)); else pendingFiltered.forEach(t=>n.add(t.id)); return n }) }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent"/><p className="mt-3 font-bold text-slate-600">بنحمل المشاوير...</p></div></div>

  const counts = {all:trips.length,pending:trips.filter(t=>t.status==='pending_approval').length,approved:trips.filter(t=>t.status==='approved').length,rejected:trips.filter(t=>t.status==='rejected').length}
  return <div className="min-h-screen bg-[#F3F7F8]" dir="rtl">
    <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white"><div className="mx-auto flex max-w-7xl items-center gap-4"><button onClick={()=>navigate('/admin')} className="rounded-xl bg-white/10 p-2"><ArrowLeft size={22}/></button><div><h1 className="text-xl font-black">إدارة ورقابة المشاوير</h1><p className="text-xs text-teal-100">{counts.pending} مستني اعتماد · القرارات تعمل فورًا بدون تحميل كامل</p></div></div></header>
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="كل المشاوير" value={counts.all}/><Stat label="مستني اعتماد" value={counts.pending} tone="amber"/><Stat label="معتمد" value={counts.approved} tone="green"/><Stat label="مرفوض" value={counts.rejected} tone="red"/></section>
      <section className="sticky top-2 z-20 rounded-3xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button onClick={toggleAllPending} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">{allPendingSelected?<CheckSquare size={16}/>:<Square size={16}/>} اختيار كل المستني ({pendingFiltered.length})</button>
          <button onClick={()=>void bulkApprove()} disabled={!selected.size} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40">اعتماد المختار ({selected.size})</button>
          {selected.size>0 && <button onClick={()=>setSelected(new Set())} className="rounded-xl border px-3 py-2 text-xs font-black">إلغاء الاختيار</button>}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">{(['all','pending_approval','approved','rejected'] as const).map(f=><button key={f} onClick={()=>setStatusFilter(f)} className={`rounded-full px-4 py-2 text-sm font-bold ${statusFilter===f?'bg-[#008E92] text-white':'bg-slate-50 text-slate-600'}`}>{f==='all'?'كل الحالات':statusText[f]}</button>)}</div>
        <div className="grid gap-2 lg:grid-cols-[1fr_220px_220px]"><div className="relative"><Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث باسم الدليفري أو الفرع أو السبب أو رقم الفاتورة..." className="w-full rounded-2xl border py-2.5 pr-9 pl-4 text-sm"/></div><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm font-bold"><option value="all">كل الأنواع</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select value={riderFilter} onChange={e=>setRiderFilter(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm font-bold"><option value="all">كل الدليفري</option>{riders.filter(r=>trips.some(t=>t.rider_id===r.id)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
      </section>
      {!filtered.length ? <div className="rounded-2xl bg-white p-10 text-center"><MapPin className="mx-auto text-slate-200" size={40}/><p className="mt-3 font-bold text-slate-400">لا توجد مشاوير لهذا الفلتر</p></div> : <div className="grid gap-3 xl:grid-cols-2">{filtered.map(t=>{const riderName=t.rider_name||riderMap.get(t.rider_id)?.name||'دليفري غير محدد'; const isPending=t.status==='pending_approval'; return <article key={t.id} className={`rounded-3xl bg-white p-4 shadow-sm ${selected.has(t.id)?'ring-2 ring-teal-500':''}`}><div className="flex items-start gap-3">{isPending&&<button onClick={()=>toggle(t.id)} className="mt-1 text-teal-700">{selected.has(t.id)?<CheckSquare/>:<Square/>}</button>}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b>{riderName}</b><span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{labels[t.trip_type]||t.trip_type}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusClass(t.status)}`}>{statusText[t.status]||t.status}</span>{proofUrl(t)&&<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">صورة كاميرا</span>}{!proofUrl(t)&&<span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">بدون صورة</span>}</div><div className="mt-2 text-sm"><b>{t.from_label}</b> → <b>{t.to_label}</b></div><p className="mt-1 text-sm text-slate-500">{t.reason||'بدون سبب تفصيلي'}</p><div className="mt-2 flex gap-3 text-xs text-slate-400"><span className="inline-flex items-center gap-1"><Clock size={12}/>{formatTime(t.registered_at)}</span>{t.related_invoice_number&&<span>فاتورة: {t.related_invoice_number}</span>}</div></div><button onClick={()=>setDetails(t)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black"><Eye size={14}/></button></div>{proofUrl(t)&&<img src={proofUrl(t)} className="mt-3 h-40 w-full rounded-2xl border object-cover" alt="إثبات المشوار"/>}<div className="mt-3 flex flex-wrap gap-2">{isPending&&<><button onClick={()=>void changeStatus(t,'approved')} disabled={busy.has(t.id)} className="flex-1 rounded-xl bg-emerald-500 py-2 text-xs font-bold text-white">اعتماد</button><button onClick={()=>{setRejectTrip(t);setRejectReason('')}} disabled={busy.has(t.id)} className="flex-1 rounded-xl bg-rose-500 py-2 text-xs font-bold text-white">رفض</button></>}{t.status!=='pending_approval'&&<button onClick={()=>void changeStatus(t,'pending_approval')} disabled={busy.has(t.id)} className="inline-flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700"><RotateCcw size={14}/> تعديل القرار / إعادة للمراجعة</button>}{t.status==='rejected'&&<button onClick={()=>void changeStatus(t,'approved')} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">تحويل إلى معتمد</button>}{t.status==='approved'&&<button onClick={()=>{setRejectTrip(t);setRejectReason('تعديل قرار اعتماد سابق')}} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">تحويل إلى مرفوض</button>}</div>{t.rejection_reason&&<div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">سبب الرفض: {t.rejection_reason}</div>}</article>})}</div>}
    </main>
    {rejectTrip&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6"><h2 className="text-xl font-black">رفض المشوار</h2><textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} className="mt-4 w-full rounded-2xl border p-3" placeholder="اكتب سبب الرفض..."/><div className="mt-4 flex gap-3"><button onClick={()=>{if(!rejectReason.trim())return toast.error('اكتب سبب الرفض');void changeStatus(rejectTrip,'rejected',rejectReason.trim());setRejectTrip(null)}} className="flex-1 rounded-2xl bg-rose-500 py-3 font-black text-white">تأكيد</button><button onClick={()=>setRejectTrip(null)} className="rounded-2xl border px-5">إلغاء</button></div></div></div>}
    {details&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={()=>setDetails(null)}><div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6" onMouseDown={e=>e.stopPropagation()}><div className="flex justify-between"><div><p className="text-xs font-black text-teal-700">تفاصيل المشوار</p><h2 className="text-2xl font-black">{details.rider_name||riderMap.get(details.rider_id)?.name}</h2></div><button onClick={()=>setDetails(null)} className="rounded-xl bg-slate-100 p-2"><X/></button></div><div className="mt-4 grid gap-3 md:grid-cols-2"><Info label="الحالة" value={statusText[details.status]||details.status}/><Info label="النوع" value={labels[details.trip_type]||details.trip_type}/><Info label="من" value={details.from_label||'—'}/><Info label="إلى" value={details.to_label||'—'}/><Info label="السبب" value={details.reason||'—'}/><Info label="الفاتورة" value={details.related_invoice_number||'بدون فاتورة'}/><Info label="وقت التسجيل" value={displayDate(details.registered_at||details.created_at)}/><Info label="وقت التصوير" value={displayDate(details.proof_captured_at)}/></div><div className="mt-4 rounded-2xl bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2 font-black"><Camera size={18}/> صورة الإثبات</div>{proofUrl(details)?<img src={proofUrl(details)} className="max-h-[520px] w-full rounded-2xl object-contain"/>:<p className="rounded-xl bg-rose-50 p-4 font-bold text-rose-700">لا توجد صورة</p>}</div></div></div>}
  </div>
}

function Stat({label,value,tone='teal'}:{label:string;value:number;tone?:'teal'|'green'|'red'|'amber'}) { const cls={teal:'text-teal-700',green:'text-emerald-700',red:'text-rose-700',amber:'text-amber-700'}[tone]; return <div className="rounded-3xl bg-white p-4 text-center shadow-sm"><p className="text-xs font-black text-slate-500">{label}</p><b className={`mt-1 block text-2xl ${cls}`}>{value.toLocaleString('ar-EG')}</b></div> }
function Info({label,value}:{label:string;value:React.ReactNode}) { return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-black text-slate-400">{label}</p><div className="mt-1 text-sm font-bold text-slate-700">{value}</div></div> }
