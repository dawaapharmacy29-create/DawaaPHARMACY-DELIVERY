import { useCallback, useEffect, useMemo, useState } from 'react'
import { Columns as Columns3, Search } from 'lucide-react'
import AdminModuleShell from '../../components/AdminModuleShell'
import SmartAlertsCenter from '../../components/SmartAlertsCenter'
import LiveRiderLeaderboard from '../../components/LiveRiderLeaderboard'
import { supabase } from '../../lib/supabase'
import { getOperationalPeriod } from '../../lib/helpers'
import { useAdminRealtimeSync } from '../../lib/useRealtimeSync'
import type { DeliveryOrder, InternalTrip, Rider } from '../../lib/types'
import { minutesSince } from '../../lib/deliveryIntelligence'

const columns = [
  { key: 'registered', label: 'مسجّل', icon: '📋', cls: 'border-slate-200 bg-slate-100/70' },
  { key: 'ready', label: 'جاهز للإرسال', icon: '📦', cls: 'border-amber-200 bg-amber-50' },
  { key: 'dispatched', label: 'في الطريق', icon: '🛵', cls: 'border-sky-200 bg-sky-50' },
  { key: 'delivered', label: 'تم التسليم', icon: '✅', cls: 'border-emerald-200 bg-emerald-50' },
  { key: 'failed', label: 'فشل', icon: '❌', cls: 'border-rose-200 bg-rose-50' },
]

export default function OperationsBoard() {
  const period = useMemo(() => getOperationalPeriod(), []); const [orders, setOrders] = useState<DeliveryOrder[]>([]); const [riders, setRiders] = useState<Rider[]>([]); const [trips, setTrips] = useState<InternalTrip[]>([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState('')
  const load = useCallback(async () => { setLoading(true); const [o, r, t] = await Promise.all([supabase.from('delivery_orders').select('*').gte('delivery_date', period.start).lte('delivery_date', period.end).order('registered_at', { ascending: false }), supabase.from('riders').select('*').eq('status', 'active'), supabase.from('internal_trips').select('*').gte('trip_date', period.start).lte('trip_date', period.end)]); setOrders((o.data || []) as DeliveryOrder[]); setRiders((r.data || []) as Rider[]); setTrips((t.data || []) as InternalTrip[]); setLoading(false) }, [period])
  useEffect(() => { void load() }, [load]); useAdminRealtimeSync({ onOrderChange: load, onTripChange: load })
  const riderMap = new Map(riders.map(r => [r.id, r])); const filtered = orders.filter(o => !search || [o.invoice_number, o.customer_name_snapshot, riderMap.get(o.rider_id)?.name].some(v => String(v || '').includes(search)))
  function inColumn(o: DeliveryOrder, key: string) { if (key === 'delivered') return o.status === 'delivered'; if (key === 'failed') return o.status === 'failed'; if (key === 'ready') return o.dispatch_status === 'ready'; if (key === 'dispatched') return ['dispatched', 'picked_up'].includes(String(o.dispatch_status)); return o.status === 'registered' && !['ready', 'dispatched', 'picked_up'].includes(String(o.dispatch_status)) }
  return <AdminModuleShell title="مركز العمليات الحي" subtitle="كل أوردر في مكانه الحقيقي — تحديث لحظي" icon={<Columns3/>} loading={loading} onRefresh={load}><div className="mb-4 grid gap-4 xl:grid-cols-[1fr_420px]"><SmartAlertsCenter orders={orders} riders={riders} compact/><div className="relative"><Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بفاتورة، عميل أو دليفري" className="h-full min-h-12 w-full rounded-2xl border bg-white pr-11 pl-4 text-sm font-bold outline-none focus:border-teal-300"/></div></div><div className="flex min-h-[620px] gap-4 overflow-x-auto pb-4">{columns.map(col => { const rows = filtered.filter(o => inColumn(o, col.key)); return <section key={col.key} className={`w-[290px] shrink-0 rounded-[1.7rem] border p-3 ${col.cls}`}><div className="mb-3 flex items-center justify-between"><h2 className="font-black">{col.icon} {col.label}</h2><span className="rounded-full bg-white px-2.5 py-1 text-xs font-black shadow-sm">{rows.length}</span></div><div className="max-h-[570px] space-y-3 overflow-y-auto">{rows.map(o => { const mins = minutesSince(o.registered_at), urgent = mins > 60 && !['delivered', 'failed'].includes(o.status); return <article key={o.id} className={`rounded-2xl border bg-white p-3 shadow-sm ${urgent ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-100'}`}>{urgent && <p className="mb-2 rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-600">متأخر {mins} دقيقة</p>}<div className="flex justify-between gap-2"><div className="min-w-0"><b className="block truncate text-sm">{o.customer_name_snapshot || 'عميل غير محدد'}</b><span className="text-[10px] font-bold text-slate-400">#{o.invoice_number || '—'}</span></div><b className="shrink-0 text-sm text-teal-700">{Number(o.invoice_amount || 0).toLocaleString('ar-EG')} ج</b></div><div className="mt-3 flex justify-between border-t pt-2 text-[10px] font-bold text-slate-500"><span>🛵 {riderMap.get(o.rider_id)?.name || 'غير محدد'}</span><span>{mins}د</span></div></article>})}{!rows.length && <p className="py-16 text-center text-xs font-bold text-slate-400">لا توجد أوردرات</p>}</div></section> })}</div><div className="mt-4"><LiveRiderLeaderboard orders={orders} trips={trips} riders={riders}/></div></AdminModuleShell>
}
