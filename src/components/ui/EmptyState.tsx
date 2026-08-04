import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
        {icon || <Inbox size={26} />}
      </span>
      <p className="text-base font-black text-slate-700">{title}</p>
      {description ? <p className="max-w-sm text-sm font-bold text-slate-400">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
