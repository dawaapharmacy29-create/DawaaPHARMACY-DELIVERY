import type { ReactNode } from 'react'
import Skeleton from './Skeleton'

export type StatCardTone = 'teal' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'slate'

const TONE_CLASSES: Record<StatCardTone, { icon: string; hint: string }> = {
  teal: { icon: 'bg-teal-50 text-teal-600', hint: 'bg-teal-50 text-teal-700' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', hint: 'bg-emerald-50 text-emerald-700' },
  amber: { icon: 'bg-amber-50 text-amber-600', hint: 'bg-amber-50 text-amber-700' },
  rose: { icon: 'bg-rose-50 text-rose-600', hint: 'bg-rose-50 text-rose-700' },
  sky: { icon: 'bg-sky-50 text-sky-600', hint: 'bg-sky-50 text-sky-700' },
  violet: { icon: 'bg-violet-50 text-violet-600', hint: 'bg-violet-50 text-violet-700' },
  slate: { icon: 'bg-slate-100 text-slate-600', hint: 'bg-slate-100 text-slate-600' },
}

export default function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'teal',
  onClick,
  loading,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: ReactNode
  tone?: StatCardTone
  onClick?: () => void
  loading?: boolean
}) {
  const cls = TONE_CLASSES[tone]
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-[1.6rem] border border-slate-100 bg-white p-4 text-right shadow-sm transition sm:p-5 ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-500">{label}</p>
        {icon ? <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cls.icon}`}>{icon}</span> : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className="mt-2 text-2xl font-black text-[#061827] sm:text-3xl">{value}</p>
      )}
      {hint && !loading ? <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-black ${cls.hint}`}>{hint}</span> : null}
    </Wrapper>
  )
}
