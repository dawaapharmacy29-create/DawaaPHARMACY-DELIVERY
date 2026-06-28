import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { displayBranchName } from '../../lib/branchUtils'

const days = [0,1,2,3,4,5,6]
const dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
const key = (r: string, d: number) => `${r}-${d}`
const t = (v: any) => String(v || '').slice(0, 5)
function isOff(x: any) { return Boolean(x?.is_day_off || x?.is_off || String(x?.status || '').toLowerCase() === 'off') }

export default function RiderSchedulesWeekly() {
  const navigate = useNavigate()
  const [riders, setRiders] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
  const [exceptions, setExceptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    const [r, s, e] = await Promise.all([
      supabase.from('riders').select('*').order('name'),
      supabase.from('rider_schedules').select('*').order('day_of_week'),
      supabase.from('rider_schedule_exceptions').select('*').order('exception_date', { ascending: false }).limit(500),
    ])
    setRiders((r.data || []).filter((x: any) => x.status !== 'inactive'))
    setSchedules(s.data || [])
    setExceptions(e.data || [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const scheduleMap = useMemo(() => new Map(schedules.map(s => [key(s.rider_id, Number(s.day_of_week)), s])), [schedules])
  const exceptionMap = useMemo(() => {
    const m = new Map<string, any[]>()
    exceptions.forEach((e: any) => m.set(e.rider_id, [...(m.get(e.rider_id) || []), e]))
    return m
  }, [exceptions])
  const visible = riders.filter(r => !q || String(r.name || r.username || '').includes(q))

  function cell(r: any, d: number) {
    const s = scheduleMap.get(key(r.id, d))
    const ex = (exceptionMap.get(r.id) || []).find((x: any) => String(x.day_of_week || '').includes(String(d)) || String(x.day_name_ar || '').includes(dayNames[d]))
    if (ex) return <div className="min-h-24 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-800"><b>استثناء / إذن</b><p className="mt-1 text-xs">{ex.reason || ex.notes || 'بدون سبب'}</p><p className="mt-1 text-[11px]">{t(ex.shift_start)} {ex.shift_start ? '→' : ''} {t(ex.shift_end)}</p></div>
    if (!s) return <div className="min-h-24 rounded-2xl border bg-slate-50 p-3 text-xs font-bold text-slate-400">لا يوجد موعد</div>
    if (isOff(s)) return <div className="min-h-24 rounded-2xl border border-rose-200 bg-rose-50 p-3 font-black text-rose-700">إجازة</div>
    return <div className="min-h-24 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800"><b>{t(s.shift_start)} → {t(s.shift_end)}</b><p className="mt-1 text-xs">{displayBranchName(s.branch_name || r.branch_name)}</p></div>
  }

  return <div className="min-h-screen bg-[#F3F7F8] p-4 text-right" dir="rtl"><div className="mx-auto max-w-[1600px] space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-4 shadow-sm"><button onClick={() => navigate('/admin')} className="rounded-2xl bg-slate-100 px-4 py-2 font-black text-slate-600"><ArrowLeft size={16} className="inline"/> رجوع</button><div><h1 className="text-2xl font-black text-[#061827]">جدول مواعيد المناديب الأسبوعي</h1><p className="text-xs font-bold text-slate-400">الشيفتات والإجازات والأذونات بألوان واضحة</p></div><button onClick={load} className="rounded-2xl bg-[#008E92] px-4 py-2 font-black text-white"><RefreshCw size={16} className={loading ? 'inline animate-spin' : 'inline'}/> تحديث</button></header>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث باسم الدليفري" className="w-full rounded-2xl border bg-white px-4 py-3 font-bold outline-none" />
    <section className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-right">الدليفري</th>{days.map(d=><th key={d} className="p-3">{dayNames[d]}</th>)}</tr></thead><tbody>{visible.map(r=><tr key={r.id} className="border-t align-top"><td className="w-44 p-3"><p className="font-black text-[#061827]">{r.name || r.username}</p><p className="text-xs font-bold text-slate-400">{displayBranchName(r.branch_name)}</p></td>{days.map(d=><td key={d} className="p-2">{cell(r,d)}</td>)}</tr>)}</tbody></table></div></section>
    <div className="grid gap-2 text-xs font-black md:grid-cols-4"><span className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">أخضر: شيفت</span><span className="rounded-2xl bg-rose-50 p-3 text-rose-700">وردي: إجازة</span><span className="rounded-2xl bg-amber-50 p-3 text-amber-700">أصفر: إذن/استثناء</span><span className="rounded-2xl bg-slate-50 p-3 text-slate-700">رمادي: لا يوجد موعد</span></div>
  </div></div>
}
