import { useMemo, useState } from 'react'

type CycleOption = {
  label: string
  start: string
  end: string
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function iso(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function currentCycle(): CycleOption {
  const now = new Date()
  const start = now.getDate() >= 26 ? new Date(now.getFullYear(), now.getMonth(), 26) : new Date(now.getFullYear(), now.getMonth() - 1, 26)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25)
  return { label: 'الدورة الحالية', start: iso(start), end: iso(end) }
}

function shiftCycle(base: CycleOption, months: number, label: string): CycleOption {
  const baseDate = new Date(`${base.start}T00:00:00`)
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth() + months, 26)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25)
  return { label, start: iso(start), end: iso(end) }
}

export function getCycleOptions(count = 12) {
  const base = currentCycle()
  return Array.from({ length: count }, (_, index) => shiftCycle(base, -index, index === 0 ? 'الدورة الحالية' : `دورة سابقة ${index}`))
}

export default function CycleSelector({
  from,
  to,
  onApply,
}: {
  from: string
  to: string
  onApply: (from: string, to: string) => void
}) {
  const cycles = useMemo(() => getCycleOptions(12), [])
  const [manualFrom, setManualFrom] = useState(from)
  const [manualTo, setManualTo] = useState(to)

  return (
    <div className="rounded-3xl border border-teal-100 bg-white p-4 shadow-sm" dir="rtl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-[#061827]">اختيار الدورة</h2>
          <p className="text-xs font-bold text-slate-500">راجع أي دورة من 26 إلى 25 أو اختر فترة مخصصة.</p>
        </div>
        <span className="rounded-full bg-teal-50 px-4 py-2 text-xs font-black text-teal-700">{from} إلى {to}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {cycles.slice(0, 6).map(cycle => (
          <button key={`${cycle.start}-${cycle.end}`} onClick={() => onApply(cycle.start, cycle.end)} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-teal-100 hover:text-teal-800">
            {cycle.label}: {cycle.start} / {cycle.end}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="date" value={manualFrom} onChange={e => setManualFrom(e.target.value)} className="dawaa-input" />
        <input type="date" value={manualTo} onChange={e => setManualTo(e.target.value)} className="dawaa-input" />
        <button onClick={() => onApply(manualFrom, manualTo)} className="rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white hover:bg-[#05777B]">تطبيق الفترة</button>
      </div>
    </div>
  )
}
