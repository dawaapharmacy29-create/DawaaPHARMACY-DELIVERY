import type { DeliveryOrder, InternalTrip, Rider } from '../lib/types'
import { minutesSince } from '../lib/deliveryIntelligence'

export default function LiveRiderLeaderboard({ orders, trips, riders, onOpen }: { orders: DeliveryOrder[]; trips: InternalTrip[]; riders: Rider[]; onOpen?: (id: string) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const rows = riders.map(rider => {
    const ro = orders.filter(o => o.rider_id === rider.id && (o.delivery_date || (o as any).work_date) === today)
    const rt = trips.filter(t => t.rider_id === rider.id && (t.trip_date || (t as any).work_date) === today)
    const done = ro.filter(o => o.status === 'delivered').length, failed = ro.filter(o => o.status === 'failed').length
    const approved = rt.filter(t => ['approved', 'completed'].includes(t.status)).length
    const current = ro.find(o => ['registered', 'needs_review'].includes(o.status) && !o.delivered_at)
    return { rider, orders: ro.length, done, failed, approved, rate: ro.length ? Math.round(done / ro.length * 100) : 0, earnings: done * Number(rider.order_rate || 0) + approved * Number(rider.trip_rate || 0), minutes: current ? minutesSince(current.registered_at) : null, status: current ? 'active' : ro.length ? 'idle' : 'offline' }
  }).sort((a, b) => b.done - a.done || b.rate - a.rate)
  return <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm"><div className="mb-4"><h3 className="font-black text-slate-800">حالة المندوبين الآن</h3><p className="mt-1 text-xs font-bold text-slate-400">الحالة والأداء والأرباح التقديرية الآن</p></div><div className="space-y-2">{rows.map((s, i) => <button key={s.rider.id} onClick={() => onOpen?.(s.rider.id)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-50 bg-slate-50/60 p-3 text-right hover:border-teal-200 hover:bg-teal-50/40"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-400 text-white' : 'bg-slate-200 text-slate-600'}`}>{i + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><b className="truncate">{s.rider.name}</b><i className={`h-2 w-2 rounded-full ${s.status === 'active' ? 'animate-pulse bg-emerald-500' : s.status === 'idle' ? 'bg-amber-400' : 'bg-slate-300'}`}/>{s.minutes != null && <span className={s.minutes > 45 ? 'text-[10px] font-black text-rose-600' : 'text-[10px] font-bold text-slate-400'}>{s.minutes}د</span>}</div><div className="mt-1 flex gap-3 text-[10px] font-bold text-slate-500"><span>تم {s.done}</span><span>فشل {s.failed}</span><span>مشاوير {s.approved}</span><span className="text-teal-700">{s.rate}%</span></div></div><div className="text-left"><b className="text-sm text-emerald-700">{s.earnings.toLocaleString('ar-EG')} ج</b><p className="text-[10px] font-bold text-slate-400">{s.orders} أوردر</p></div></button>)}</div></div>
}
