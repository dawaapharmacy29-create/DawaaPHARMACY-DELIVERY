import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, CheckSquare, ChevronLeft, ChevronRight, Eye, ImageOff, RotateCcw, Search, Square, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getRiders } from '../../lib/delivery'
import { getOperationalPeriod } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'
import type { Rider } from '../../lib/types'

type StatusFilter = 'all' | 'pending_approval' | 'approved' | 'rejected'
type ProofFilter = 'all' | 'with_photo' | 'without_photo'

const labels: Record<string,string> = { branch_to_branch:'بين الفروع', warehouse:'مخزن', supplies:'مستلزمات', pharmacy:'صيدلية', shipment_pickup:'استلام شحن', accessories:'إكسسوار', purchase_missing_item:'شراء نواقص', supplier:'مورد', returns:'مرتجع', collection:'تحصيل', visit_again:'زيارة تانية', other:'أخرى' }
const statusText: Record<string,string> = { pending_approval:'مستني اعتماد', approved:'معتمد', rejected:'مرفوض', completed:'تم', cancelled:'ملغي' }
const rejectReasons = [
  'صورة الإثبات غير واضحة',
  'لا توجد صورة إثبات',
  'صورة الإثبات لا تخص المشوار',
  'بيانات المشوار غير صحيحة',
  'الفرع أو الوجهة غير صحيحة',
  'الفاتورة أو الإذن غير واضح / غير مطابق',
  'المشوار مكرر',
  'المشوار غير مبرر',
]
const pageSize = 100

function rpcResult(data:any){ return Array.isArray(data) ? data[0] : data }
function proofUrl(row:any){ return String(row?.proof_image_url || '').trim() }
function statusClass(status?:string|null){ return status==='approved'||status==='completed'?'bg-emerald-100 text-emerald-700':status==='rejected'?'bg-rose-100 text-rose-700':'bg-amber-100 text-amber-700' }

function Stat({label,value,tone='slate',onClick}:{label:string;value:number;tone?:'slate'|'green'|'red'|'amber';onClick?:()=>void}){
  const cls={slate:'bg-white text-slate-900',green:'bg-emerald-50 text-emerald-800',red:'bg-rose-50 text-rose-800',amber:'bg-amber-50 text-amber-800'}[tone]
  return <button type="button" onClick={onClick} className={`rounded-2xl border border-slate-100 p-4 text-right shadow-sm transition hover:-translate-y-0.5 ${cls}`}><p className="text-xs font-black opacity-70">{label}</p><p className="mt-1 text-2xl font-black">{Number(value||0).toLocaleString('en-US')}</p></button>
}

export default function TripsFast(){
  const navigate=useNavigate()
  const period=useMemo(()=>getOperationalPeriod(),[])
  const [rows,setRows]=useState<any[]>([])
  const [summary,setSummary]=useState<any>({})
  const [riders,setRiders]=useState<Rider[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState<Set<string>>(new Set())
  const [selected,setSelected]=useState<Set<string>>(new Set())
  const [statusFilter,setStatusFilter]=useState<StatusFilter>('all')
  const [proofFilter,setProofFilter]=useState<ProofFilter>('all')
  const [typeFilter,setTypeFilter]=useState('all')
  const [riderFilter,setRiderFilter]=useState('all')
  const [search,setSearch]=useState('')
  const [debouncedSearch,setDebouncedSearch]=useState('')
  const [page,setPage]=useState(0)
  const [totalFiltered,setTotalFiltered]=useState(0)
  const [details,setDetails]=useState<any|null>(null)
  const [imageZoom,setImageZoom]=useState(1)
  const [isImageDragging,setIsImageDragging]=useState(false)
  const [rejectTrip,setRejectTrip]=useState<any|null>(null)
  const [rejectReason,setRejectReason]=useState('')
  const requestSeq=useRef(0)
  const imageViewportRef=useRef<HTMLDivElement|null>(null)
  const imageDragRef=useRef({pointerId:-1,x:0,y:0,scrollLeft:0,scrollTop:0})

  useEffect(()=>{ const id=window.setTimeout(()=>setDebouncedSearch(search.trim()),300); return()=>window.clearTimeout(id)},[search])
  useEffect(()=>{ setPage(0) },[statusFilter,proofFilter,typeFilter,riderFilter,debouncedSearch])
  useEffect(()=>{ void getRiders().then(setRiders).catch(()=>{}) },[])
  useEffect(()=>{ setImageZoom(1);setIsImageDragging(false);if(imageViewportRef.current){imageViewportRef.current.scrollLeft=0;imageViewportRef.current.scrollTop=0} },[details?.id])
  useEffect(()=>{
    if(!details&&!rejectTrip)return
    const closeWithEscape=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return
      event.preventDefault()
      if(rejectTrip){setRejectTrip(null);setRejectReason('');return}
      setDetails(null)
    }
    window.addEventListener('keydown',closeWithEscape)
    return()=>window.removeEventListener('keydown',closeWithEscape)
  },[details,rejectTrip])

  async function load(){
    const seq=++requestSeq.current
    try{
      setLoading(true)
      const {data,error}=await supabase.rpc('admin_trips_fast',{
        p_period_start:period.start,p_period_end:period.end,p_status:statusFilter,p_proof:proofFilter,p_trip_type:typeFilter,
        p_rider_id:riderFilter==='all'?null:riderFilter,p_search:debouncedSearch||null,p_limit:pageSize,p_offset:page*pageSize,
      })
      if(error)throw error
      if(seq!==requestSeq.current)return
      const result=rpcResult(data)
      if(!result?.success)throw new Error(result?.message||'تعذر تحميل المشاوير')
      setRows(Array.isArray(result.rows)?result.rows:[])
      setSummary(result.summary||{})
      setTotalFiltered(Number(result.total_filtered||0))
      setSelected(new Set())
    }catch(error:any){ if(seq===requestSeq.current) toast.error(error?.message||'فشل تحميل بيانات المشاوير') }
    finally{ if(seq===requestSeq.current)setLoading(false) }
  }
  useEffect(()=>{ void load() },[page,statusFilter,proofFilter,typeFilter,riderFilter,debouncedSearch])

  function patchLocal(id:string,patch:any){ setRows(prev=>prev.map(row=>row.id===id?{...row,...patch}:row)); setDetails((current:any)=>current?.id===id?{...current,...patch}:current) }
  function setBusyId(id:string,on:boolean){ setBusy(prev=>{const next=new Set(prev);on?next.add(id):next.delete(id);return next}) }
  function updateSummaryStatus(fromStatus:string,toStatus:string,count=1){
    if(fromStatus===toStatus)return
    setSummary((current:any)=>{
      const next={...current}
      const keyFor=(status:string)=>status==='pending_approval'?'pending':status==='approved'?'approved':status==='rejected'?'rejected':null
      const fromKey=keyFor(fromStatus),toKey=keyFor(toStatus)
      if(fromKey)next[fromKey]=Math.max(0,Number(next[fromKey]||0)-count)
      if(toKey)next[toKey]=Number(next[toKey]||0)+count
      return next
    })
  }
  function removeIfOutsideStatusFilter(id:string,status:string){
    if(statusFilter==='all'||statusFilter===status)return
    setRows(prev=>prev.filter(row=>row.id!==id));setTotalFiltered(prev=>Math.max(0,prev-1))
    setSelected(prev=>{const next=new Set(prev);next.delete(id);return next});setDetails(current=>current?.id===id?null:current)
  }

  async function changeStatus(trip:any,status:'approved'|'rejected'|'pending_approval',reason?:string){
    const previous={...trip},previousStatus=String(trip.status||'')
    const patch=status==='approved'?{status:'approved',review_status:'approved',approved_at:new Date().toISOString(),rejection_reason:null,needs_review:false,review_reason:null}:status==='rejected'?{status:'rejected',review_status:'rejected',approved_at:null,rejection_reason:reason||'تم الرفض إداريًا',needs_review:false,review_reason:null}:{status:'pending_approval',review_status:'pending_approval',approved_at:null,rejection_reason:null,needs_review:true,review_reason:'إعادة للمراجعة الإدارية'}
    setBusyId(trip.id,true);patchLocal(trip.id,patch)
    try{
      const {error}=await supabase.from('internal_trips').update(patch).eq('id',trip.id);if(error)throw error
      updateSummaryStatus(previousStatus,status);removeIfOutsideStatusFilter(trip.id,status)
      toast.success(status==='approved'?'تم اعتماد المشوار':status==='rejected'?'تم رفض المشوار':'تمت إعادة المشوار للمراجعة')
    }catch(error){patchLocal(trip.id,previous);toast.error('تعذر حفظ القرار وتمت إعادة الحالة السابقة')}
    finally{setBusyId(trip.id,false)}
  }

  function toggle(id:string){setSelected(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next})}
  const pendingVisible=rows.filter(r=>r.status==='pending_approval')
  const allPendingSelected=pendingVisible.length>0&&pendingVisible.every(r=>selected.has(r.id))
  function toggleAllPending(){setSelected(prev=>{const next=new Set(prev);allPendingSelected?pendingVisible.forEach(r=>next.delete(r.id)):pendingVisible.forEach(r=>next.add(r.id));return next})}
  async function bulkApprove(){
    const ids=[...selected].filter(id=>rows.some(r=>r.id===id&&r.status==='pending_approval'));if(!ids.length)return toast.error('اختر مشاوير مستنية اعتماد')
    const now=new Date().toISOString();const {error}=await supabase.from('internal_trips').update({status:'approved',review_status:'approved',approved_at:now,rejection_reason:null,needs_review:false,review_reason:null}).in('id',ids)
    if(error)return toast.error('فشل اعتماد المجموعة')
    setRows(prev=>statusFilter==='pending_approval'?prev.filter(row=>!ids.includes(row.id)):prev.map(row=>ids.includes(row.id)?{...row,status:'approved',review_status:'approved',approved_at:now,rejection_reason:null,needs_review:false,review_reason:null}:row))
    if(statusFilter==='pending_approval')setTotalFiltered(prev=>Math.max(0,prev-ids.length));updateSummaryStatus('pending_approval','approved',ids.length);setSelected(new Set());toast.success(`تم اعتماد ${ids.length} مشوار`)
  }
  async function bulkReject(reason:string){
    const ids=[...selected].filter(id=>rows.some(r=>r.id===id&&r.status==='pending_approval'));if(!ids.length)return toast.error('اختر مشاوير مستنية اعتماد')
    const {error}=await supabase.from('internal_trips').update({status:'rejected',review_status:'rejected',approved_at:null,rejection_reason:reason,needs_review:false,review_reason:null}).in('id',ids)
    if(error)return toast.error('فشل رفض المجموعة')
    setRows(prev=>statusFilter==='pending_approval'?prev.filter(row=>!ids.includes(row.id)):prev.map(row=>ids.includes(row.id)?{...row,status:'rejected',review_status:'rejected',approved_at:null,rejection_reason:reason,needs_review:false,review_reason:null}:row))
    if(statusFilter==='pending_approval')setTotalFiltered(prev=>Math.max(0,prev-ids.length));updateSummaryStatus('pending_approval','rejected',ids.length);setSelected(new Set());toast.success(`تم رفض ${ids.length} مشوار`)
  }

  const pages=Math.max(1,Math.ceil(totalFiltered/pageSize))
  return <div className="min-h-screen bg-[#F3F7F8]" dir="rtl">
    <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><button onClick={()=>navigate('/admin')} className="flex items-center gap-3 text-right"><span className="rounded-xl bg-white/10 p-2"><ArrowLeft size={22}/></span><div><h1 className="text-xl font-black">إدارة ورقابة المشاوير · Fast</h1><p className="text-xs text-teal-100">تحميل على دفعات بدل أكثر من ألف سجل مرة واحدة</p></div></button><button onClick={()=>void load()} className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black">تحديث</button></div></header>
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Stat label="كل المشاوير" value={summary.all||0} onClick={()=>{setStatusFilter('all');setProofFilter('all')}}/><Stat label="بصورة" value={summary.with_photo||0} tone="green" onClick={()=>setProofFilter('with_photo')}/><Stat label="بدون صورة" value={summary.without_photo||0} tone="red" onClick={()=>setProofFilter('without_photo')}/><Stat label="مستني اعتماد" value={summary.pending||0} tone="amber" onClick={()=>setStatusFilter('pending_approval')}/><Stat label="معتمد" value={summary.approved||0} tone="green" onClick={()=>setStatusFilter('approved')}/><Stat label="مرفوض" value={summary.rejected||0} tone="red" onClick={()=>setStatusFilter('rejected')}/></section>
      <section className="sticky top-2 z-20 rounded-3xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2"><button onClick={toggleAllPending} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">{allPendingSelected?<CheckSquare size={16}/>:<Square size={16}/>} اختيار المستني في الصفحة ({pendingVisible.length})</button><button onClick={()=>void bulkApprove()} disabled={!selected.size} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40">اعتماد المختار ({selected.size})</button><button onClick={()=>{if(!selected.size)return toast.error('اختر مشاوير مستنية اعتماد');setRejectTrip({bulk:true});setRejectReason('')}} disabled={!selected.size} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40">رفض المختار ({selected.size})</button>{selected.size>0&&<button onClick={()=>setSelected(new Set())} className="rounded-xl border px-3 py-2 text-xs font-black">إلغاء الاختيار</button>}</div>
        <div className="grid gap-2 lg:grid-cols-[1fr_180px_180px_200px]"><div className="relative"><Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث: مندوب، فرع، سبب، فاتورة، من/إلى..." className="w-full rounded-2xl border py-2.5 pr-9 pl-4 text-sm"/></div><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as StatusFilter)} className="rounded-2xl border px-3 py-2 text-sm font-bold"><option value="all">كل الحالات</option><option value="pending_approval">مستني اعتماد</option><option value="approved">معتمد</option><option value="rejected">مرفوض</option></select><select value={proofFilter} onChange={e=>setProofFilter(e.target.value as ProofFilter)} className="rounded-2xl border px-3 py-2 text-sm font-bold"><option value="all">كل الإثباتات</option><option value="with_photo">بصورة</option><option value="without_photo">بدون صورة</option></select><select value={riderFilter} onChange={e=>setRiderFilter(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm font-bold"><option value="all">كل الدليفري</option>{riders.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div className="mt-2"><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm font-bold"><option value="all">كل أنواع المشاوير</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
      </section>
      {loading?<div className="rounded-3xl bg-white p-12 text-center shadow-sm"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent"/><p className="mt-3 font-bold text-slate-500">تحميل الصفحة...</p></div>:rows.length===0?<div className="rounded-3xl bg-white p-12 text-center font-bold text-slate-400">لا توجد مشاوير لهذا الفلتر</div>:<div className="grid gap-3 xl:grid-cols-2">{rows.map(row=>{const photo=proofUrl(row);const pending=row.status==='pending_approval';return <article key={row.id} className={`rounded-3xl bg-white p-4 shadow-sm ${selected.has(row.id)?'ring-2 ring-teal-500':''}`}><div className="flex items-start gap-3">{pending&&<button onClick={()=>toggle(row.id)} className="mt-1 text-teal-700">{selected.has(row.id)?<CheckSquare/>:<Square/>}</button>}<button onClick={()=>setDetails(row)} className="min-w-0 flex-1 text-right"><div className="flex flex-wrap items-center gap-2"><b>{row.rider_name||'دليفري غير محدد'}</b><span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{labels[row.trip_type]||row.trip_type}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusClass(row.status)}`}>{statusText[row.status]||row.status}</span>{photo?<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700"><Camera size={12}/> صورة</span>:<span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700"><ImageOff size={12}/> بدون صورة</span>}</div><p className="mt-2 text-sm font-black text-slate-800">{row.from_label||'—'} ← {row.to_label||'—'}</p><p className="mt-1 line-clamp-2 text-xs font-bold text-slate-500">{row.reason||'بدون سبب'}</p>{row.notes&&<p className="mt-1 line-clamp-2 rounded-xl bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-800">ملاحظة: {row.notes}</p>}<p className="mt-2 text-[11px] font-bold text-slate-400">{row.branch_name||'—'} · {row.trip_date||row.work_date||'—'}</p></button><button onClick={()=>setDetails(row)} className="rounded-xl bg-slate-100 p-2 text-slate-600"><Eye size={17}/></button></div>{photo&&<button type="button" onClick={()=>setDetails(row)} className="mt-3 block w-full overflow-hidden rounded-2xl border border-slate-100 bg-slate-50"><img src={photo} alt="إثبات المشوار" loading="lazy" className="h-44 w-full object-cover transition duration-200 hover:scale-[1.02]"/></button>}<div className="mt-3 flex flex-wrap gap-2">{row.status!=='approved'&&<button disabled={busy.has(row.id)} onClick={()=>void changeStatus(row,'approved')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">اعتماد</button>}{row.status!=='rejected'&&<button disabled={busy.has(row.id)} onClick={()=>{setRejectTrip(row);setRejectReason('')}} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">رفض</button>}{row.status!=='pending_approval'&&<button disabled={busy.has(row.id)} onClick={()=>void changeStatus(row,'pending_approval')} className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-800 disabled:opacity-40">إعادة للمراجعة</button>}</div></article>})}</div>}
      <section className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm"><button disabled={page===0||loading} onClick={()=>setPage(p=>Math.max(0,p-1))} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black disabled:opacity-40"><ChevronRight size={15}/> السابق</button><p className="text-xs font-black text-slate-500">صفحة {page+1} من {pages} · {totalFiltered.toLocaleString('en-US')} نتيجة</p><button disabled={page+1>=pages||loading} onClick={()=>setPage(p=>p+1)} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black disabled:opacity-40">التالي <ChevronLeft size={15}/></button></section>
    </main>
    {details&&<div className="fixed inset-0 z-50 bg-slate-950/50 p-3 backdrop-blur-sm" onMouseDown={()=>setDetails(null)}><div className="mx-auto flex h-full max-w-3xl items-center"><section role="dialog" aria-modal="true" className="max-h-[94vh] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-start justify-between"><div><h2 className="text-xl font-black">تفاصيل المشوار</h2><p className="text-xs font-bold text-slate-400">{details.rider_name} · {details.branch_name}</p></div><button onClick={()=>setDetails(null)} className="rounded-xl bg-slate-100 p-2"><X size={18}/></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm"><p><b>النوع:</b> {labels[details.trip_type]||details.trip_type}</p><p><b>الحالة:</b> {statusText[details.status]||details.status}</p><p><b>من:</b> {details.from_label||'—'}</p><p><b>إلى:</b> {details.to_label||'—'}</p><p className="sm:col-span-2"><b>السبب:</b> {details.reason||'—'}</p><p className="sm:col-span-2"><b>ملاحظات المشوار:</b> {details.notes||'—'}</p><p className="sm:col-span-2"><b>ملاحظة الإثبات:</b> {details.proof_note||details.trip_proof_note||'—'}</p><p><b>طالب المشوار:</b> {details.requester_name||details.trip_requester_name||'—'}</p><p><b>فاتورة/إذن:</b> {details.related_invoice_number||'—'}</p><p><b>Audit:</b> {details.audit_status||'—'}</p>{details.rejection_reason&&<p className="sm:col-span-2 rounded-xl bg-rose-50 p-2 text-rose-700"><b>سبب الرفض:</b> {details.rejection_reason}</p>}</div>{proofUrl(details)?<div className="mt-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-slate-500">حرّك بكرة الماوس فوق الصورة للتكبير والتصغير، واسحب الصورة بالماوس بعد الزوم</p><div className="flex items-center gap-1"><button type="button" onClick={()=>setImageZoom(z=>Math.max(1,Number((z-0.25).toFixed(2))))} disabled={imageZoom<=1} className="rounded-xl bg-slate-100 p-2 disabled:opacity-40" title="تصغير"><ZoomOut size={17}/></button><span className="min-w-14 text-center text-xs font-black text-slate-600">{Math.round(imageZoom*100)}%</span><button type="button" onClick={()=>setImageZoom(z=>Math.min(4,Number((z+0.25).toFixed(2))))} disabled={imageZoom>=4} className="rounded-xl bg-slate-100 p-2 disabled:opacity-40" title="تكبير"><ZoomIn size={17}/></button><button type="button" onClick={()=>{setImageZoom(1);setIsImageDragging(false);if(imageViewportRef.current){imageViewportRef.current.scrollLeft=0;imageViewportRef.current.scrollTop=0}}} className="rounded-xl bg-slate-100 p-2" title="إعادة الحجم الطبيعي"><RotateCcw size={17}/></button></div></div><div ref={imageViewportRef} onWheel={event=>{event.preventDefault();setImageZoom(z=>Math.min(4,Math.max(1,Number((z+(event.deltaY<0?0.25:-0.25)).toFixed(2)))))} } onDoubleClick={()=>setImageZoom(z=>z===1?2:1)} onPointerDown={event=>{if(imageZoom<=1||!imageViewportRef.current)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);imageDragRef.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,scrollLeft:imageViewportRef.current.scrollLeft,scrollTop:imageViewportRef.current.scrollTop};setIsImageDragging(true)}} onPointerMove={event=>{if(!isImageDragging||imageDragRef.current.pointerId!==event.pointerId||!imageViewportRef.current)return;event.preventDefault();imageViewportRef.current.scrollLeft=imageDragRef.current.scrollLeft-(event.clientX-imageDragRef.current.x);imageViewportRef.current.scrollTop=imageDragRef.current.scrollTop-(event.clientY-imageDragRef.current.y)}} onPointerUp={event=>{if(imageDragRef.current.pointerId===event.pointerId){setIsImageDragging(false);imageDragRef.current.pointerId=-1;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}} onPointerCancel={()=>{setIsImageDragging(false);imageDragRef.current.pointerId=-1}} className={`max-h-[60vh] overflow-auto rounded-2xl border bg-slate-50 p-2 ${imageZoom>1?(isImageDragging?'cursor-grabbing':'cursor-grab'):''}`} style={{touchAction:'none'}} title="استخدم بكرة الماوس للتكبير والتصغير، ثم اضغط واسحب للتحرك داخل الصورة"><img src={proofUrl(details)} alt="إثبات المشوار" draggable={false} className="mx-auto block select-none object-contain" style={{width:`${imageZoom*100}%`,maxWidth:'none',height:'auto',pointerEvents:'none'}}/></div></div>:<div className="mt-4 rounded-2xl bg-rose-50 p-4 text-center text-sm font-black text-rose-700">لا توجد صورة إثبات</div>}</section></div></div>}
    {rejectTrip&&<div className="fixed inset-0 z-[60] bg-slate-950/50 p-3 backdrop-blur-sm" onMouseDown={()=>{setRejectTrip(null);setRejectReason('')}}><div className="mx-auto flex h-full max-w-xl items-center"><section role="dialog" aria-modal="true" className="max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">{rejectTrip?.bulk?`رفض ${selected.size} مشوار مختار`:'رفض المشوار'}</h2><p className="mt-1 text-xs font-bold text-slate-400">اختر سبب سريع أو اكتب السبب يدويًا</p></div><button onClick={()=>{setRejectTrip(null);setRejectReason('')}} className="rounded-xl bg-slate-100 p-2"><X size={18}/></button></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{rejectReasons.map(reason=><button key={reason} type="button" onClick={()=>setRejectReason(reason)} className={`rounded-2xl border px-3 py-3 text-right text-sm font-black transition ${rejectReason===reason?'border-rose-500 bg-rose-50 text-rose-700 ring-2 ring-rose-100':'border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50/60'}`}>{reason}</button>)}</div><textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} className="mt-4 w-full rounded-2xl border p-3 text-right outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100" placeholder="سبب الرفض أو ملاحظة إضافية..."/><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={()=>{setRejectTrip(null);setRejectReason('')}} className="rounded-xl bg-slate-100 py-3 font-black">إلغاء</button><button onClick={()=>{if(rejectReason.trim().length<3)return toast.error('اختر أو اكتب سبب الرفض');const reason=rejectReason.trim();if(rejectTrip?.bulk){setRejectTrip(null);setRejectReason('');void bulkReject(reason);return}const row=rejectTrip;setRejectTrip(null);setRejectReason('');void changeStatus(row,'rejected',reason)}} className="rounded-xl bg-rose-600 py-3 font-black text-white">{rejectTrip?.bulk?'تأكيد رفض المختار':'تأكيد الرفض'}</button></div></section></div></div>}
  </div>
}
