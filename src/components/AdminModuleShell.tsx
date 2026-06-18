import type { ReactNode } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function AdminModuleShell({ title, subtitle, icon, loading, onRefresh, actions, children }: { title: string; subtitle: string; icon: ReactNode; loading?: boolean; onRefresh?: () => void; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate()
  return <div dir="rtl" className="min-h-screen bg-[#f4f8f8] p-3 text-[#102a32] sm:p-6"><div className="mx-auto max-w-[1500px]"><header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-white bg-white p-5 shadow-sm"><div className="flex items-center gap-4"><button onClick={() => navigate('/admin')} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><ArrowRight/></button><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#008E92] text-white">{icon}</span><div><h1 className="text-2xl font-black">{title}</h1><p className="mt-1 text-xs font-bold text-slate-400">{subtitle}</p></div></div><div className="flex gap-2">{actions}{onRefresh && <button onClick={onRefresh} disabled={loading} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black text-slate-600"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/> تحديث</button>}</div></header>{children}</div></div>
}

export function ModuleMetric({ label, value, hint, tone = 'teal' }: { label: string; value: string | number; hint?: string; tone?: 'teal' | 'sky' | 'amber' | 'rose' | 'violet' }) {
  const cls = { teal: 'text-teal-700 bg-teal-50', sky: 'text-sky-700 bg-sky-50', amber: 'text-amber-700 bg-amber-50', rose: 'text-rose-700 bg-rose-50', violet: 'text-violet-700 bg-violet-50' }[tone]
  return <div className="rounded-[1.6rem] border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-[#102a32]">{value}</p>{hint && <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-black ${cls}`}>{hint}</span>}</div>
}

