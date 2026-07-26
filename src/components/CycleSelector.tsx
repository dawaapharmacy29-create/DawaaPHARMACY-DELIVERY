import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarRange, ChevronDown, Clock3 } from 'lucide-react'
import {
  cycleForDate,
  currentWeekRange,
  getDeliveryCycleOptions,
  lastCyclesRange,
  todayRange,
  type DeliveryCycleRange,
} from '../lib/deliveryCycles'

type CycleSelectorProps = {
  from: string
  to: string
  onApply: (from: string, to: string) => void
  compact?: boolean
  showSmartRanges?: boolean
}

export function getCycleOptions(count = 12) {
  return getDeliveryCycleOptions(count)
}

function rangeLabel(from: string, to: string) {
  return from === to ? from : `${from} إلى ${to}`
}

export default function CycleSelector({ from, to, onApply, compact = false, showSmartRanges = true }: CycleSelectorProps) {
  const cycles = useMemo(() => getDeliveryCycleOptions(18), [])
  const [manualFrom, setManualFrom] = useState(from)
  const [manualTo, setManualTo] = useState(to)
  const [expanded, setExpanded] = useState(!compact)

  useEffect(() => {
    setManualFrom(from)
    setManualTo(to)
  }, [from, to])

  function applyCycle(cycle: DeliveryCycleRange) {
    setManualFrom(cycle.start)
    setManualTo(cycle.end)
    onApply(cycle.start, cycle.end)
  }

  function applyRange(start: string, end: string) {
    setManualFrom(start)
    setManualTo(end)
    onApply(start, end)
  }

  const current = cycleForDate()
  const selectedCycle = cycles.find(cycle => cycle.start === from && cycle.end === to)

  return (
    <section className="rounded-[28px] border border-teal-100 bg-white p-4 shadow-sm" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-teal-50 p-3 text-[#008E92]"><CalendarRange size={22} /></div>
          <div>
            <h2 className="text-lg font-black text-[#061827]">الفترة التشغيلية</h2>
            <p className="text-xs font-bold text-slate-500">الدورة الرسمية تبدأ يوم 26 وتنتهي يوم 25.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-2xl bg-[#EAF8F8] px-4 py-2 text-xs font-black text-[#008E92]">
            {selectedCycle?.label || rangeLabel(from, to)}
          </span>
          <button type="button" onClick={() => setExpanded(value => !value)} className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-black text-slate-600">
            {expanded ? 'إخفاء الاختيارات' : 'تغيير الفترة'}
            <ChevronDown size={15} className={expanded ? 'rotate-180 transition' : 'transition'} />
          </button>
        </div>
      </div>

      {expanded && <div className="mt-4 space-y-4">
        {showSmartRanges && <div>
          <p className="mb-2 text-xs font-black text-slate-400">اختيارات سريعة</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { const r = todayRange(); applyRange(r.start, r.end) }} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-teal-50 hover:text-teal-700"><Clock3 size={15}/> اليوم</button>
            <button type="button" onClick={() => { const r = currentWeekRange(); applyRange(r.start, r.end) }} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-teal-50 hover:text-teal-700"><CalendarDays size={15}/> هذا الأسبوع</button>
            <button type="button" onClick={() => applyCycle(current)} className="rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white">الدورة الحالية</button>
            <button type="button" onClick={() => applyCycle(cycles[1])} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-teal-50 hover:text-teal-700">الدورة السابقة</button>
            <button type="button" onClick={() => { const r = lastCyclesRange(3); applyRange(r.start, r.end) }} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-teal-50 hover:text-teal-700">آخر 3 دورات</button>
          </div>
        </div>}

        <div>
          <p className="mb-2 text-xs font-black text-slate-400">الدورات الجاهزة</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {cycles.slice(0, 9).map(cycle => {
              const active = cycle.start === from && cycle.end === to
              return <button key={cycle.key} type="button" onClick={() => applyCycle(cycle)} className={`rounded-2xl border p-3 text-right transition ${active ? 'border-[#008E92] bg-teal-50 ring-2 ring-teal-100' : 'border-slate-100 bg-slate-50 hover:border-teal-200 hover:bg-teal-50'}`}>
                <span className="block font-black text-slate-800">{cycle.label}</span>
                <span className="mt-1 block text-xs font-bold text-slate-400" dir="ltr">{cycle.start} → {cycle.end}</span>
              </button>
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-black text-slate-400">فترة مخصصة</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input aria-label="بداية الفترة" type="date" value={manualFrom} onChange={event => setManualFrom(event.target.value)} className="dawaa-input" />
            <input aria-label="نهاية الفترة" type="date" value={manualTo} onChange={event => setManualTo(event.target.value)} className="dawaa-input" />
            <button type="button" disabled={!manualFrom || !manualTo || manualFrom > manualTo} onClick={() => applyRange(manualFrom, manualTo)} className="rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40">تطبيق الفترة</button>
          </div>
        </div>
      </div>}
    </section>
  )
}
