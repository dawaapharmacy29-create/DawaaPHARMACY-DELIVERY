import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Columns as Columns3, Search } from 'lucide-react'
import AdminModuleShell from '../../components/AdminModuleShell'
import SmartAlertsCenter from '../../components/SmartAlertsCenter'
import LiveRiderLeaderboard from '../../components/LiveRiderLeaderboard'
import { supabase } from '../../lib/supabase'
import { formatDateTime, getOperationalPeriod, wildcardMatchText } from '../../lib/helpers'
import { useAdminRealtimeSync } from '../../lib/useRealtimeSync'
import type { DeliveryOrder, InternalTrip, Rider } from '../../lib/types'
import { minutesSince } from '../../lib/deliveryIntelligence'

type OpsFilter = 'all' | 'overdue' | 'duplicate' | 'open' | 'failed' | 'delivered' | 'inactive_today'
const valid = ['overdue', 'duplicate', 'open', 'failed', 'delivered', 'inactive_today']
const norm = (v: string | null): OpsFilter => valid.includes(String(v)) ? v as OpsFilter : 'all'
const closed = (o: DeliveryOrder) => ['delivered', 'failed', 'cancelled'].includes(String(o.status || ''))
const day = (o: DeliveryOrder) => String(o.delivery_date || (o as any).work_date || o.registered_at || '').slice(0, 10)
const inv = (o: DeliveryOrder) => String(o.invoice_number || (o as any).invoice_no || '—')
const code = (o: DeliveryOrder) => String((o as any).customer_code_snapshot || (o as any).customer_code || '—')
const cols = ['registered', 'ready', 'dispatched', 'delivered', 'failed'] as const
const labels: Record<string, string> = { registered: 'مسجل', ready: 'جاهز', dispatched: 'في الطريق', delivered: 'تم التسليم', failed: 'فشل' }
function col(o: DeliveryOrder, key: string) { const s = String(o.status || ''); const d = String(o.dispatch_status || ''); if (key === 'delivered') return s === 'delivered' || d === 'delivered'; if (key === 'failed') return s === 'failed' || d === 'failed'; if (key === 'ready') return d === 'ready'; if (key === 'dispatched') return ['dispatched', 'picked_up'].includes(d); return !['ready', 'dispatched', 'picked_up', 'delivered', 'failed'].includes(d) && s !== 'delivered' && s !== 'failed' }

export default function OperationsBoard() {
  const period = useMemo(() => getOperationalPeriod(), [])
  const [params, setParams] = useSearchParams()
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<OpsFilter>(norm(params.get('filter')))
  const [search, setSearch] = useState(params.get('q') || '')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [o, r, t] = await Promise.allSettled([
        supabase.from('delivery_orders').select('*').gte('delivery_date', period.start).lte('delivery_date', period.end).order('registered_at', { ascending: false }),
        supabase.from('riders').select('*').eq('status', 'active'),
        supabase.from('internal_trips').select('*').gte('trip_date', period.start).lte('trip_date', period.end),
      ])
      if (o.status === 'fulfilled') setOrders((o.value.data || []) as DeliveryOrder[])
      if (r.status === 'fulfilled') setRiders((r.value.data || []) as Rider[])
      if (t.status === 'fulfilled') setTrips((t.value.data || []) as InternalTrip[])
    } finally { setLoading(false) }
  }, [period])
  useEffect(() => { void load() }, [load])
  useAdminRealtimeSync({ onOrderChange: load, onTripChange: load })
  useEffect(() => { const n = new URLSearchParams(); if (filter !== 'all') n.set('filter', filter); if (search.trim()) n.set('q', search.trim()); setParams(n, { replace: true }) }, [filter, search, setParams])

  const riderMap = useMemo(() => new Map(riders.map(r => [r.id, r])), [riders])
  const today = new Date().toISOString().slice(0, 10)
  const inactive = riders.filter(r => !orders.some(o => o.rider_id === r.id && day(o) === today))
  const filtered = orders.filter(o => {
    const r = riderMap.get(o.rider_id)
    const age = minutesSince(o.registered_at || o.created_at)
    const searchOk = !search.trim() || [inv(o), code(o), o.customer_name_snapshot, (o as any).customer_name, o.customer_phone_snapshot, r?.name, r?.username].some(v => wildcardMatchText(String(v || ''), search))
    const filterOk = filter === 'all' || (filter === 'overdue' && !closed(o) && age > 60) || (filter === 'duplicate' && (o.is_duplicate_invoice || o.duplicate_review_status === 'pending')) || (filter === 'open' && !closed(o)) || (filter === 'failed' && o.status === 'failed') || (filter === 'delivered' && o.status === 'delivered') || filter === 'inactive_today'
    return searchOk && filterOk
  })
  const overdue = orders.filter(o => !closed(o) && minutesSince(o.registered_at || o.created_at) > 60).length
  const quick: Array<[OpsFilter, string, number]> = [['all','الكل',orders.length],['open','مفتوحة',orders.filter(o=>!closed(o)).length],['overdue','عالقة',overdue],['duplicate','مكررة',orders.filter(o=>o.is_duplicate_invoice||o.duplicate_review_status==='pending').length],['failed','فشل',orders.filter(o=>o.status==='failed').length],['delivered','تم',orders.filter(o=>o.status==='delivered').length],['inactive_today','دليفري بدون أوردر',inactive.length]]

  return <AdminModuleShell title="مركز العمليات الحي" subtitle="بحث وفلاتر وتشغيل لحظي" icon={<Columns3/>} loading={loading} onRefresh={load}>
    <section className="mb-4 grid gap-3 md:grid-cols-4"><K label="أوردرات الدورة" value={orders.length}/><K label="مفتوحة" value={orders.filter(o=>!closed(o)).length}/><K label="عالقة" value={overdue}/><K label="بدون أوردر اليوم" value={inactive.length}/></section>
    <div className="mb-4"><SmartAlertsCenter orders={orders} riders={riders}/></div>
    <div className="mb-4 flex flex-wrap gap-2">{quick.map(([k,l,c])=><button key={k} onClick={()=>setFilter(k)} className={`rounded-xl px-3 py-2 text-xs font-black ${filter===k?'bg-[#0b2d33] text-white':'bg-white text-slate-600'}`}>{l} {c}</button>)}</div>
    {filter === 'inactive_today' ? <div className="grid gap-3 md:grid-cols-3">{inactive.map(r=><div key={r.id} className="rounded-2xl bg-white p-4 shadow-sm"><b>{r.name}</b><p className="text-xs text-slate-400">{r.username}</p></div>)}</div> : <>
      <div className="relative mb-4"><Search className="absolute right-4 top-3 text-slate-400" size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث برقم الفاتورة، اسم العميل، كود العميل أو الدليفري" className="w-full rounded-2xl border bg-white py-3 pr-11 font-bold outline-none"/></div>
      <div className="flex gap-4 overflow-x-auto pb-4">{cols.map(c=>{ const rows=filtered.filter(o=>col(o,c)); return <section key={c} className="w-[310px] shrink-0 rounded-3xl border bg-slate-50 p-3"><div className="mb-3 flex justify-between"><b>{labels[c]}</b><span>{rows.length}</span></div><div className="space-y-3">{rows.map(o=>{ const r=riderMap.get(o.rider_id); const age=minutesSince(o.registered_at||o.created_at); return <article key={o.id} className={`rounded-2xl border bg-white p-3 shadow-sm ${age>60&&!closed(o)?'border-rose-300':''}`}><div className="mb-2 flex justify-between"><b className="truncate">{o.customer_name_snapshot || (o as any).customer_name || 'عميل غير محدد'}</b><span className="text-xs text-teal-700">{Number(o.invoice_amount||0).toLocaleString('ar-EG')} ج</span></div><p className="text-[11px] font-bold text-slate-400">فاتورة #{inv(o)} · كود {code(o)}</p><p className="mt-2 border-t pt-2 text-[11px] font-bold text-slate-500">{r?.name || 'غير محدد'} · {age} دقيقة</p><p className="text-[11px] font-bold text-slate-500">وقت التسجيل: {formatDateTime(o.registered_at || o.created_at)}</p></article>})}{!rows.length&&<p className="py-10 text-center text-xs text-slate-400">لا توجد أوردرات</p>}</div></section>})}</div></>}
    <div className="mt-4"><LiveRiderLeaderboard orders={orders} trips={trips} riders={riders}/></div>
  </AdminModuleShell>
}
function K({label,value}:{label:string;value:number}){return <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>}
