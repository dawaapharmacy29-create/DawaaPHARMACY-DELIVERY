import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Clock, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getBranches, getRiders } from '../../lib/delivery'
import { getOperationalPeriod, localIsoDate } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'
import type { Branch, Rider } from '../../lib/types'

type Preset='today'|'yesterday'|'last7'|'cycle'|'custom'
const HOURS=Array.from({length:24},(_,i)=>i)

function addDays(date:Date,days:number){const next=new Date(date);next.setDate(next.getDate()+days);return next}
function rangeForPreset(preset:Preset){const today=new Date();if(preset==='today')return{from:localIsoDate(today),to:localIsoDate(today)};if(preset==='yesterday'){const y=addDays(today,-1);return{from:localIsoDate(y),to:localIsoDate(y)}};if(preset==='last7')return{from:localIsoDate(addDays(today,-6)),to:localIsoDate(today)};const op=getOperationalPeriod(today);return{from:op.start,to:op.end}}
function rpcResult(data:any){return Array.isArray(data)?data[0]:data}
function formatHour(hour:number){const suffix=hour<12?'ص':'م';const display=hour%12===0?12:hour%12;return`${display}:00 ${suffix}`}

function Stat({title,value,hint,tone='teal'}:{title:string;value:string|number;hint?:string;tone?:'teal'|'green'|'red'|'amber'|'blue'}){
  const cls={teal:'bg-teal-50 text-teal-800',green:'bg-emerald-50 text-emerald-800',red:'bg-rose-50 text-rose-800',amber:'bg-amber-50 text-amber-800',blue:'bg-sky-50 text-sky-800'}[tone]
  return <div className={`rounded-3xl border border-slate-100 p-4 shadow-sm ${cls}`}><p className="text-xs font-black opacity-70">{title}</p><p className="mt-1 text-2xl font-black">{value}</p>{hint&&<p className="mt-1 text-xs font-bold opacity-70">{hint}</p>}</div>
}

export default function HourlyDeliveryAnalyticsFast(){
  const navigate=useNavigate()
  const initial=rangeForPreset('today')
  const [preset,setPreset]=useState<Preset>('today')
  const [from,setFrom]=useState(initial.from)
  const [to,setTo]=useState(initial.to)
  const [branchId,setBranchId]=useState('all')
  const [riderId,setRiderId]=useState('all')
  const [status,setStatus]=useState('all')
  const [branches,setBranches]=useState<Branch[]>([])
  const [riders,setRiders]=useState<Rider[]>([])
  const [payload,setPayload]=useState<any>(null)
  const [loading,setLoading]=useState(true)

  useEffect(()=>{void Promise.all([getBranches(),getRiders()]).then(([b,r])=>{setBranches(b);setRiders(r)}).catch(()=>{})},[])

  async function load(){
    try{
      setLoading(true)
      const {data,error}=await supabase.rpc('hourly_delivery_analytics_fast',{
        p_from:from,p_to:to,
        p_branch_id:branchId==='all'?null:branchId,
        p_rider_id:riderId==='all'?null:riderId,
        p_status:status,
      })
      if(error)throw error
      const result=rpcResult(data)
      if(!result?.success)throw new Error(result?.message||'تعذر تحميل التحليل')
      setPayload(result)
    }catch(error:any){toast.error(error?.message||'تعذر تحميل تحليل الساعات')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[from,to,branchId,riderId,status])

  function applyPreset(next:Preset){setPreset(next);if(next!=='custom'){const r=rangeForPreset(next);setFrom(r.from);setTo(r.to)}}
  const summary=payload?.summary||{}
  const hours=Array.isArray(payload?.hours)?payload.hours:[]
  const riderRows=Array.isArray(payload?.riders)?payload.riders:[]
  const hourMap=useMemo(()=>new Map(hours.map((h:any)=>[Number(h.hour),h])),[hours])
  const maxOrders=Math.max(1,...hours.map((h:any)=>Number(h.orders||0)))
  const availableRiders=useMemo(()=>riders.filter(r=>branchId==='all'||r.branch_id===branchId),[riders,branchId])

  return <div className="min-h-screen bg-[#F3F7F8]" dir="rtl">
    <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><button onClick={()=>navigate('/admin')} className="flex items-center gap-3 text-right"><span className="rounded-xl bg-white/10 p-2"><ArrowLeft size={22}/></span><div><h1 className="text-xl font-black">تحليل الدليفري بالساعة · Fast</h1><p className="text-xs text-teal-100">التجميع يتم داخل السيرفر بدل تحميل عشرات الآلاف من السجلات</p></div></button><button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-black disabled:opacity-50"><RefreshCw size={15} className={loading?'animate-spin':''}/> تحديث</button></div></header>

    <main className="mx-auto max-w-7xl space-y-5 p-4">
      <section className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">{(['today','yesterday','last7','cycle','custom'] as Preset[]).map(p=><button key={p} onClick={()=>applyPreset(p)} className={`rounded-full px-4 py-2 text-xs font-black ${preset===p?'bg-[#008E92] text-white':'bg-slate-100 text-slate-600'}`}>{p==='today'?'اليوم':p==='yesterday'?'أمس':p==='last7'?'آخر 7 أيام':p==='cycle'?'الدورة 26→25':'مخصص'}</button>)}</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><input type="date" value={from} onChange={e=>{setPreset('custom');setFrom(e.target.value)}} className="rounded-2xl border px-3 py-2 text-sm font-bold"/><input type="date" value={to} onChange={e=>{setPreset('custom');setTo(e.target.value)}} className="rounded-2xl border px-3 py-2 text-sm font-bold"/><select value={branchId} onChange={e=>{setBranchId(e.target.value);setRiderId('all')}} className="rounded-2xl border px-3 py-2 text-sm font-bold"><option value="all">كل الفروع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><select value={riderId} onChange={e=>setRiderId(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm font-bold"><option value="all">كل الدليفري</option>{availableRiders.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-2xl border px-3 py-2 text-sm font-bold"><option value="all">كل الحالات</option><option value="delivered">تم التسليم</option><option value="failed">فشل</option><option value="open">مفتوح</option><option value="late">متأخر</option><option value="duplicate">مكرر</option><option value="edited">تم تعديله</option></select></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><Stat title="الأوردرات" value={summary.orders||0}/><Stat title="تم" value={summary.delivered||0} tone="green"/><Stat title="فشل" value={summary.failed||0} tone="red"/><Stat title="مفتوح" value={summary.open||0} tone="blue"/><Stat title="متأخر" value={summary.late||0} tone="amber"/><Stat title="مكرر" value={summary.duplicates||0} tone="red"/><Stat title="متوسط التسليم" value={`${Number(summary.avg_minutes||0).toFixed(1)} د`} hint={`${summary.edited||0} أوردر معدل`} tone="teal"/></section>

      <section className="rounded-[2rem] border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Clock className="text-teal-600"/><div><h2 className="text-lg font-black">توزيع الأوردرات على 24 ساعة</h2><p className="text-xs font-bold text-slate-400">الارتفاع يعبر عن عدد الأوردرات في الساعة</p></div></div>{loading?<div className="h-64 animate-pulse rounded-2xl bg-slate-100"/>:<div className="flex h-72 items-end gap-1 overflow-x-auto rounded-2xl bg-slate-50 p-3">{HOURS.map(hour=>{const h:any=hourMap.get(hour)||{};const height=Math.max(4,Number(h.orders||0)/maxOrders*210);return <div key={hour} className="group flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1" title={`${formatHour(hour)} · ${h.orders||0} أوردر · متوسط ${h.avg_minutes||0} د`}><span className="hidden rounded bg-slate-900 px-2 py-1 text-[9px] font-black text-white group-hover:block">{h.orders||0}</span><span className={`w-full rounded-t-lg ${Number(h.late||0)>0?'bg-amber-500':'bg-teal-500'}`} style={{height:`${height}px`}}/><span className="text-[8px] font-bold text-slate-400">{hour}</span></div>})}</div>}</section>

      <section className="overflow-hidden rounded-[2rem] border bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-lg font-black">أداء كل مندوب حسب الساعة</h2><p className="text-xs font-bold text-slate-400">المصفوفة محسوبة في قاعدة البيانات</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-xs"><thead className="bg-slate-50 font-black text-slate-500"><tr><th className="sticky right-0 bg-slate-50 p-3 text-right">المندوب</th><th>إجمالي</th><th>تم</th><th>متأخر</th><th>متوسط</th>{HOURS.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{riderRows.map((r:any)=><tr key={r.rider_id} className="border-t"><td className="sticky right-0 bg-white p-3"><b>{r.rider_name}</b><p className="text-[10px] text-slate-400">{r.branch_name}</p></td><td className="text-center font-black">{r.total}</td><td className="text-center text-emerald-700">{r.delivered}</td><td className="text-center text-amber-700">{r.late}</td><td className="text-center">{Number(r.avg_minutes||0).toFixed(0)} د</td>{HOURS.map(h=><td key={h} className="text-center">{r.hours?.[String(h)]||0}</td>)}</tr>)}</tbody></table></div></section>

      <section className="rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm font-bold text-teal-900">النسخة السريعة لا تنزل كل الأوردرات وسجل التعديلات إلى المتصفح. لو احتجت الفحص التفصيلي القديم مؤقتًا فهو محفوظ في <button onClick={()=>navigate('/admin/hourly-analytics-legacy')} className="underline font-black">النسخة التفصيلية القديمة</button>.</section>
    </main>
  </div>
}
