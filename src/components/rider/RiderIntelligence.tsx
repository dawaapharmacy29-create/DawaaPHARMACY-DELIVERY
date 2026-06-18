import { useEffect, useState } from 'react'
import { Map, Navigation, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export function LiveEarningsBar({ deliveredCount, orderRate, approvedTrips, tripRate, hoursWorked, hourlyRate, dailyTarget = 200 }: { deliveredCount: number; orderRate: number; approvedTrips: number; tripRate: number; hoursWorked: number; hourlyRate: number; dailyTarget?: number }) {
  const orders = deliveredCount * orderRate, trips = approvedTrips * tripRate, hours = hoursWorked * hourlyRate, total = orders + trips + hours, progress = Math.min(100, dailyTarget ? total / dailyTarget * 100 : 0)
  return <section className="overflow-hidden rounded-[28px] bg-gradient-to-l from-[#00777b] to-[#075d61] p-5 text-white shadow-xl shadow-teal-900/15"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-1 text-xs font-bold text-teal-100"><TrendingUp size={14}/> أرباحك التقديرية حتى الآن</p><p className="mt-1 text-4xl font-black">{total.toLocaleString('ar-EG')} <span className="text-lg">ج.م</span></p></div><div className="space-y-1 text-left text-[10px] font-bold text-teal-50/80"><p>{deliveredCount} أوردر = {orders.toLocaleString('ar-EG')} ج</p><p>{approvedTrips} مشوار = {trips.toLocaleString('ar-EG')} ج</p><p>{hoursWorked.toFixed(1)} ساعة = {hours.toLocaleString('ar-EG')} ج</p></div></div><div className="mt-4"><div className="mb-1 flex justify-between text-[10px] font-black text-teal-50"><span>الهدف اليومي</span><span>{Math.round(progress)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progress}%` }}/></div></div></section>
}

export function NavigateButton({ address }: { address?: string | null }) {
  if (!address) return null
  const destination = encodeURIComponent(`${address}, القاهرة, مصر`)
  return <div className="flex gap-2"><a href={`https://www.google.com/maps/dir/?api=1&destination=${destination}`} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white"><Map size={14}/> خرائط</a><a href={`https://waze.com/ul?q=${destination}&navigate=yes`} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-sky-500 px-3 py-2 text-xs font-black text-white"><Navigation size={14}/> Waze</a></div>
}

export function SmartCustomerCard({ customerCode }: { customerCode: string }) {
  const [history, setHistory] = useState<any[] | null>(null)
  useEffect(() => { if (!customerCode) { setHistory(null); return }; let active = true; void supabase.from('delivery_orders').select('status,delivered_at,failed_reason,delivery_date').or(`customer_code_snapshot.eq.${customerCode},customer_code.eq.${customerCode}`).order('delivery_date', { ascending: false }).limit(5).then(({ data }) => { if (active) setHistory(data || []) }); return () => { active = false } }, [customerCode])
  if (!history?.length) return null
  const done = history.filter(o => o.status === 'delivered').length, failed = history.filter(o => o.status === 'failed').length, rate = Math.round(done / history.length * 100)
  return <div className={`rounded-2xl border p-3 ${failed ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><div className="flex justify-between text-sm font-black"><span>سجل توصيل العميل</span><span className={failed ? 'text-amber-700' : 'text-emerald-700'}>{rate}% نجاح</span></div><div className="mt-2 flex gap-3 text-[11px] font-bold text-slate-500"><span>✅ {done}</span><span>❌ {failed}</span><span>📦 {history.length}</span></div>{failed > 0 && <p className="mt-2 text-[11px] font-black text-amber-700">آخر سبب فشل: {history.find(o => o.failed_reason)?.failed_reason || 'غير محدد'}</p>}</div>
}
