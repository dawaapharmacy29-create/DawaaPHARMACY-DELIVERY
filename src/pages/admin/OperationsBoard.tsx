import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Columns as Columns3, RefreshCcw, Search, ShieldAlert } from 'lucide-react'
import AdminModuleShell from '../../components/AdminModuleShell'
import { getOperationalPeriod } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'

const invoiceOf=(order:any)=>String(order.invoice_number||order.invoice_no||'—')
function rpcResult(data:any){return Array.isArray(data)?data[0]:data}

export default function OperationsBoard(){
  const navigate=useNavigate()
  const period=useMemo(()=>getOperationalPeriod(),[])
  const [rows,setRows]=useState<any[]>([])
  const [danger,setDanger]=useState<any[]>([])
  const [summary,setSummary]=useState<any>({})
  const [inactive,setInactive]=useState(0)
  const [totalFiltered,setTotalFiltered]=useState(0)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [search,setSearch]=useState('')
  const [debouncedSearch,setDebouncedSearch]=useState('')
  const [filter,setFilter]=useState<'all'|'live'|'overdue'|'stale'|'duplicate'|'failed'|'delivered'>('all')
  const [selected,setSelected]=useState<any|null>(null)

  useEffect(()=>{const id=window.setTimeout(()=>setDebouncedSearch(search.trim()),300);return()=>window.clearTimeout(id)},[search])

  const load=useCallback(async(silent=false)=>{
    if(!silent)setLoading(true)
    setError('')
    try{
      const {data,error:rpcError}=await supabase.rpc('operations_board_fast',{p_period_start:period.start,p_period_end:period.end,p_filter:filter,p_search:debouncedSearch||null,p_limit:180})
      if(rpcError)throw rpcError
      const result=rpcResult(data)
      if(!result?.success)throw new Error(result?.message||'تعذر تحميل غرفة العمليات')
      setRows(Array.isArray(result.rows)?result.rows:[])
      setDanger(Array.isArray(result.danger_rows)?result.danger_rows:[])
      setSummary(result.summary||{})
      setInactive(Number(result.inactive_riders||0))
      setTotalFiltered(Number(result.total_filtered||0))
    }catch(caught:any){setError(caught?.message||'تعذر تحميل غرفة العمليات')}
    finally{setLoading(false)}
  },[period.start,period.end,filter,debouncedSearch])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{const timer=window.setInterval(()=>void load(true),60000);return()=>window.clearInterval(timer)},[load])

  const filters:[typeof filter,string,number][]=[
    ['all','الكل',Number(summary.cycle_orders||0)],['live','مفتوحة',Number(summary.live||0)],['overdue','متأخرة',Number(summary.overdue||0)],['stale','قديمة',Number(summary.stale||0)],['duplicate','مكررة',Number(summary.duplicate||0)],['failed','فشل',Number(summary.failed||0)],['delivered','تم',Number(summary.delivered||0)],
  ]

  const openInReconciliation=(order:any)=>navigate(`/admin/reconciliation?invoice_number=${encodeURIComponent(invoiceOf(order))}`)

  return <AdminModuleShell title="مركز العمليات الحي · Fast" subtitle={`الدورة ${period.start} إلى ${period.end} · تحديث تلقائي كل دقيقة بدون تحميل كل الدورة`} icon={<Columns3/>} loading={loading&&rows.length===0} onRefresh={()=>load()}>
    {error&&<div className="mb-4 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 font-black text-rose-700"><span>{error}</span><button type="button" onClick={()=>load()}><RefreshCcw size={18}/></button></div>}
    <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Metric label="أوردرات الدورة" value={Number(summary.cycle_orders||0)} note="عداد من السيرفر"/><Metric label="أوردرات اليوم" value={Number(summary.today_orders||0)} note={`${summary.today_delivered||0} تم · ${summary.today_failed||0} فشل`}/><Metric label="مفتوحة حية" value={Number(summary.live||0)} note="آخر 24 ساعة"/><Metric label="متأخرة +60د" value={Number(summary.overdue||0)} danger={Number(summary.overdue||0)>0} note="تحتاج متابعة"/><Metric label="خطر +120د" value={Number(summary.danger||0)} danger={Number(summary.danger||0)>0} note="تدخل فوري"/><Metric label="قديمة مفتوحة" value={Number(summary.stale||0)} note="منفصلة عن التشغيل الحي"/></section>
    <section className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]"><div className="relative"><Search className="absolute right-4 top-3.5 text-slate-400" size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث بالفاتورة أو العميل أو الكود أو المندوب" className="w-full rounded-2xl border bg-white py-3 pr-11 font-bold outline-none"/></div><div className="flex flex-wrap gap-2">{filters.map(([key,label,count])=><button type="button" key={key} onClick={()=>setFilter(key)} className={`rounded-xl px-3 py-2 text-xs font-black ${filter===key?'bg-[#0b2d33] text-white':'bg-white text-slate-600'}`}>{label} {count}</button>)}</div></section>
    {danger.length>0&&<section className="mb-4 rounded-3xl border border-rose-200 bg-rose-50 p-4"><div className="mb-3 flex items-center gap-2 font-black text-rose-800"><AlertTriangle size={18}/> أخطر الحالات الآن</div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{danger.map(order=><button type="button" key={order.id} onClick={()=>setSelected(order)} className="rounded-2xl bg-white p-3 text-right shadow-sm"><b>فاتورة {invoiceOf(order)}</b><p className="mt-1 text-xs font-bold text-rose-700">{order.rider_name||'غير محدد'} · {Math.round(Number(order.age_minutes||0))} دقيقة</p></button>)}</div></section>}
    <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(order=><button type="button" key={order.id} onClick={()=>setSelected(order)} className={`rounded-2xl border p-4 text-right shadow-sm ${order.is_stale?'border-amber-300 bg-amber-50':order.is_danger?'border-rose-300 bg-rose-50':'bg-white'}`}><div className="flex items-center justify-between gap-2"><b>فاتورة {invoiceOf(order)}</b><span className="text-xs font-black text-teal-700">{order.status||'غير محدد'}</span></div><p className="mt-2 text-sm font-bold text-slate-600">{order.customer_name_snapshot||order.customer_name||'عميل غير محدد'}</p><p className="mt-1 text-xs font-bold text-slate-400">{order.rider_display_name||order.rider_name||'مندوب غير محدد'} · {Math.round(Number(order.age_minutes||0))} دقيقة</p></button>)}</section>
    {totalFiltered>rows.length&&<p className="mb-4 rounded-2xl bg-amber-50 p-3 text-center text-sm font-bold text-amber-700">يوجد {totalFiltered.toLocaleString('en-US')} نتيجة. يظهر أول {rows.length} فقط لحماية سرعة الصفحة؛ استخدم البحث أو الفلتر للوصول للباقي.</p>}
    <section className="rounded-3xl border bg-white p-4"><div className="mb-3 flex items-center gap-2"><ShieldAlert size={18}/><h3 className="font-black">مراجعة جودة البيانات</h3></div><p className="text-sm font-bold text-slate-600">يوجد {summary.stale||0} أوردر قديم مفتوح و{inactive} مندوب بدون أوردر اليوم. الصفحة الآن تستقبل الملخص والصفوف المطلوبة فقط بدل إعادة تحميل كل الدورة كل دقيقة.</p></section>
    {selected&&<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={()=>setSelected(null)}><div className="w-full max-w-lg rounded-3xl bg-white p-5" onClick={e=>e.stopPropagation()}><h3 className="text-xl font-black">فاتورة {invoiceOf(selected)}</h3><p className="mt-2 font-bold text-slate-600">{selected.customer_name_snapshot||selected.customer_name||'عميل غير محدد'}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><Info label="المندوب" value={selected.rider_display_name||selected.rider_name||'غير محدد'}/><Info label="الحالة" value={String(selected.status||'غير محدد')}/><Info label="منذ" value={`${Math.round(Number(selected.age_minutes||0))} دقيقة`}/><Info label="التاريخ" value={String(selected.order_date||'غير محدد')}/></div><button type="button" onClick={()=>openInReconciliation(selected)} className="mt-4 w-full rounded-2xl bg-[#008E92] px-4 py-3 font-black text-white">فتح التفاصيل في المطابقة</button></div></div>}
  </AdminModuleShell>
}

function Metric({label,value,note,danger=false}:{label:string;value:number;note:string;danger?:boolean}){return <div className={`rounded-2xl p-4 shadow-sm ${danger?'border border-rose-200 bg-rose-50 text-rose-900':'bg-white'}`}><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{note}</p></div>}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-1 font-black">{value}</p></div>}
