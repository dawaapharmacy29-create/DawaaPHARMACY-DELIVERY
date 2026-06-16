import type { DeliveryOrder } from '../lib/types'
import {
  formatClock,
  formatMinutes,
  getDispatchAgeLabel,
  getOrderTimelineStatus,
  getPrepareAgeLabel,
  minutesBetween,
  orderTimelineSummary,
} from '../lib/orderTimeline'

type Tone = 'emerald' | 'red' | 'sky' | 'cyan' | 'amber' | 'slate'

const toneClass: Record<Tone, string> = {
  emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  red: 'border-red-100 bg-red-50 text-red-700',
  sky: 'border-sky-100 bg-sky-50 text-sky-700',
  cyan: 'border-cyan-100 bg-cyan-50 text-cyan-700',
  amber: 'border-amber-100 bg-amber-50 text-amber-700',
  slate: 'border-slate-100 bg-slate-50 text-slate-600',
}

export default function OrderTimelineBadge({
  order,
  compact = false,
}: {
  order: Partial<DeliveryOrder> & Record<string, any>
  compact?: boolean
}) {
  const status = getOrderTimelineStatus(order)
  const dispatchMinutes = minutesBetween(order.dispatched_at, order.delivered_at || null)
  const pickupDelay = minutesBetween(order.dispatched_at, order.picked_up_at || null)
  const timeline = orderTimelineSummary(order)

  if (compact) {
    return (
      <div className={`rounded-2xl border px-3 py-2 text-xs font-black ${toneClass[status.tone]}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span>{status.label}</span>
          <span>خروج: {formatClock(order.dispatched_at)}</span>
          {order.dispatched_at ? <span>{getDispatchAgeLabel(order)}</span> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${toneClass[status.tone]}`}>
          {status.label}
        </span>
        <span className="text-xs font-black text-slate-500">{getPrepareAgeLabel(order)}</span>
      </div>

      <div className="grid grid-cols-5 gap-2 text-center">
        {timeline.map((item) => (
          <div key={item.label} className="rounded-xl bg-white px-2 py-2 shadow-sm">
            <p className="text-[10px] font-black text-slate-400">{item.label}</p>
            <p className="mt-1 text-xs font-black text-[#061827]">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 grid gap-2 text-xs font-bold text-slate-500 sm:grid-cols-2">
        <span>مدة الخروج: {order.dispatched_at ? formatMinutes(dispatchMinutes) : 'لم يخرج بعد'}</span>
        <span>انتظار الاستلام: {order.dispatched_at && order.picked_up_at ? formatMinutes(pickupDelay) : 'غير مكتمل'}</span>
      </div>

      {(order.dispatch_by_name || order.picked_up_by_name) && (
        <p className="mt-2 text-xs font-bold text-slate-500">
          خرج بواسطة: {order.dispatch_by_name || '—'} · استلمه: {order.picked_up_by_name || '—'}
        </p>
      )}
    </div>
  )
}
