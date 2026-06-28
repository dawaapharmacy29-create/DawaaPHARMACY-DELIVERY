import type { DeliveryOrder, InternalTrip, Rider } from '../lib/types'
import { minutesSince } from '../lib/deliveryIntelligence'

const isTodayValue = (value: unknown, today: string) => String(value || '').slice(0, 10) === today
const isDelivered = (order: DeliveryOrder) => order.status === 'delivered' || Boolean((order as any).delivered_at)
const isFailed = (order: DeliveryOrder) => order.status === 'failed' || Boolean((order as any).failed_reason)

export default function LiveRiderLeaderboard({ orders, trips, riders, onOpen }: { orders: DeliveryOrder[]; trips: InternalTrip[]; riders: Rider[]; onOpen?: (id: string) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const rows = riders.map(rider => {
    const ro = orders.filter(o => o.rider_id === rider.id && (isTodayValue(o.delivery_date, today) || isTodayValue((o as any).work_date, today) || isTodayValue(o.registered_at || (o as any).created_at, today)))
    const rt = trips.filter(t => t.rider_id === rider.id && (isTodayValue(t.trip_date, today) || isTodayValue((t as any).work_date, today) || isTodayValue(t.registered_at || (t as any).created_at, today)))
    const done = ro.filter(isDelivered).length
    const failed = ro.filter(isFailed).length
    const tripTotal = rt.length
    const tripApproved = rt.filter(t => ['approved', 'completed'].includes(String(t.status || ''))).length
    const current = ro.find(o => ['registered', 'needs_review'].includes(String(o.status || '')) && !(o as any).delivered_at)
    return {
      rider,
      orders: ro.length,
      done,
      failed,
      trips: tripTotal,
      tripApproved,
      rate: ro.length ? Math.round(done / ro.length * 100) : 0,
      earnings: done * Number(rider.order_rate || 0) + tripTotal * Number(rider.trip_rate || 0),
      minutes: current ? minutesSince(current.registered_at || (current as any).created_at) : null,
      status: current ? 'active' : (ro.length || tripTotal) ? 'idle' : 'offline'
    }
  }).sort((a, b) => b.done - a.done || b.trips - a.trips || b.rate - a.rate)

  return (
    <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="font-black text-slate-800">حالة المندوبين الآن</h3>
        <p className="mt-1 text-xs font-bold text-slate-400">الأوردرات والمشاوير المسجلة اليوم والأرباح التقديرية الآن</p>
      </div>
      <div className="space-y-2">
        {rows.map((s, i) => (
          <button key={s.rider.id} onClick={() => onOpen?.(s.rider.id)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-50 bg-slate-50/60 p-3 text-right hover:border-teal-200 hover:bg-teal-50/40">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-400 text-white' : 'bg-slate-200 text-slate-600'}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <b className="truncate">{s.rider.name}</b>
                <i className={`h-2 w-2 rounded-full ${s.status === 'active' ? 'animate-pulse bg-emerald-500' : s.status === 'idle' ? 'bg-amber-400' : 'bg-slate-300'}`}/>
                {s.minutes != null && <span className={s.minutes > 45 ? 'text-[10px] font-black text-rose-600' : 'text-[10px] font-bold text-slate-400'}>{s.minutes}د</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-[10px] font-bold text-slate-500">
                <span>أوردرات {s.orders}</span>
                <span>تم {s.done}</span>
                <span>فشل {s.failed}</span>
                <span>مشاوير {s.trips}</span>
                {s.trips > 0 && <span className="text-[10px] text-slate-400">معتمد {s.tripApproved}</span>}
                <span className="text-teal-700">{s.rate}%</span>
              </div>
            </div>
            <div className="text-left">
              <b className="text-sm text-emerald-700">{s.earnings.toLocaleString('ar-EG')} ج</b>
              <p className="text-[10px] font-bold text-slate-400">{s.orders} أوردر · {s.trips} مشوار</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
