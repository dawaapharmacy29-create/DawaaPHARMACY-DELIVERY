import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Award, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { getBranches, getRiders } from '../../lib/delivery'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { riderPerformanceUrl } from '../../lib/adminDrilldown'

type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly'

type RiderStat = {
  rider: string
  branch: string
  riderId: string
  orders: number
  delivered: number
  failed: number
  trips: number
  approvedTrips: number
  duplicates: number
  multiplier: number
  lateMinutes: number
  absence: number
  incidents: number
  rewards: number
  penalties: number
  avgScore: number
  deliveryRate: number
  netEarnings: number
}

const today = () => new Date().toISOString().slice(0, 10)
const dateOnly = (value: any) => String(value || '').slice(0, 10)
const num = (value: any) => Number(value || 0) || 0

function addDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function rangeFor(tab: Period) {
  const op = getOperationalPeriod()
  if (tab === 'daily') return { from: today(), to: today(), label: 'اليوم' }
  if (tab === 'weekly') return { from: addDays(-6), to: today(), label: 'آخر 7 أيام' }
  if (tab === 'quarterly') return { from: addDays(-89), to: today(), label: 'آخر 90 يوم' }
  return { from: op.start, to: op.end, label: 'الدورة الحالية' }
}

function isDelivered(order: any) {
  const s = String(order.status || '').toLowerCase()
  return s === 'delivered' || s.includes('تم التسليم') || Boolean(order.delivered_at)
}

function isFailed(order: any) {
  const s = String(order.status || '').toLowerCase()
  return s.includes('fail') || s === 'failed' || Boolean(order.failed_reason || order.failed_at)
}

function orderDate(order: any) {
  return order.delivery_date || order.work_date || order.registered_at || order.created_at
}

function tripDate(trip: any) {
  return trip.trip_date || trip.work_date || trip.created_at
}

function inRange(value: any, from: string, to: string) {
  const d = dateOnly(value)
  return d >= from && d <= to
}

function uniqueById(rows: any[]) {
  const map = new Map<string, any>()
  rows.forEach((row, index) => map.set(String(row.id || index), row))
  return Array.from(map.values())
}

function ScoreBadge({ score }: { score: number }) {
  const label = score >= 90 ? 'ممتاز' : score >= 75 ? 'جيد' : 'يحتاج تحسين'
  const cls = score >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : score >= 75 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-black ${cls}`}>{score >= 90 ? '🏆' : score >= 75 ? '✅' : '⚠️'} {label}</span>
}

function MiniBar({ value, max, color = '#008E92' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return <div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} /></div><span className="w-8 text-right text-xs font-black text-slate-600">{value}</span></div>
}

function StatCard({ label, value, sub, icon, tone = 'green' }: { label: string; value: string | number; sub?: string; icon: string; tone?: 'green' | 'blue' | 'red' | 'orange' }) {
  const colors = { green: 'from-emerald-50 to-white border-emerald-100 text-emerald-700', blue: 'from-sky-50 to-white border-sky-100 text-sky-700', red: 'from-rose-50 to-white border-rose-100 text-rose-700', orange: 'from-amber-50 to-white border-amber-100 text-amber-700' }
  return <div className={`rounded-3xl border bg-gradient-to-br ${colors[tone]} p-4`}><div className="flex items-center gap-2"><span className="text-2xl">{icon}</span><div><p className="text-xs font-bold text-slate-500">{label}</p><p className="text-xl font-black">{value}</p>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div></div></div>
}

function DrillNumber({ value, onClick }: { value: string | number; onClick: () => void }) {
  return <button type="button" onClick={onClick} title="اضغط للتفاصيل" className="cursor-pointer rounded-xl px-2 py-1 font-black text-[#008E92] transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-lg">{value}</button>
}

export default function Performance() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Period>((searchParams.get('period') as Period) || 'monthly')
  const defaultRange = rangeFor(tab)
  const from = searchParams.get('from') || defaultRange.from
  const to = searchParams.get('to') || defaultRange.to
  const [performanceData, setPerformanceData] = useState<RiderStat[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'score' | 'orders' | 'delivered' | 'penalties'>('orders')

  const tabs: { id: Period; label: string; emoji: string }[] = [
    { id: 'daily', label: 'يومي', emoji: '📅' },
    { id: 'weekly', label: 'أسبوعي', emoji: '📆' },
    { id: 'monthly', label: 'الدورة', emoji: '🗓️' },
    { id: 'quarterly', label: 'ربع سنوي', emoji: '📊' },
  ]

  useEffect(() => { void loadPerformanceData() }, [from, to])

  function chooseTab(nextTab: Period) {
    setTab(nextTab)
    const r = rangeFor(nextTab)
    setSearchParams({ period: nextTab, from: r.from, to: r.to })
  }

  async function loadPerformanceData() {
    setLoading(true)
    try {
      const [ridersData, branchesData, ordersByDeliveryDate, ordersByWorkDate, tripsByTripDate, tripsByWorkDate] = await Promise.allSettled([
        getRiders(),
        getBranches(),
        supabase.from('delivery_orders').select('*').gte('delivery_date', from).lte('delivery_date', to).limit(50000),
        supabase.from('delivery_orders').select('*').gte('work_date', from).lte('work_date', to).limit(50000),
        supabase.from('internal_trips').select('*').gte('trip_date', from).lte('trip_date', to).limit(50000),
        supabase.from('internal_trips').select('*').gte('work_date', from).lte('work_date', to).limit(50000),
      ])
      const riders = ridersData.status === 'fulfilled' ? ridersData.value : []
      const branches = branchesData.status === 'fulfilled' ? branchesData.value : []
      const orderRows = [ordersByDeliveryDate, ordersByWorkDate].flatMap((res: any) => res.status === 'fulfilled' && !res.value.error ? (res.value.data || []) : [])
      const tripRows = [tripsByTripDate, tripsByWorkDate].flatMap((res: any) => res.status === 'fulfilled' && !res.value.error ? (res.value.data || []) : [])
      const orders = uniqueById(orderRows).filter(o => inRange(orderDate(o), from, to))
      const trips = uniqueById(tripRows).filter(t => inRange(tripDate(t), from, to))
      const aggregated: RiderStat[] = riders.map((rider: any) => {
        const riderOrders = orders.filter((o: any) => o.rider_id === rider.id)
        const riderTrips = trips.filter((t: any) => t.rider_id === rider.id)
        const delivered = riderOrders.filter(isDelivered).length
        const failed = riderOrders.filter(isFailed).length
        const duplicates = riderOrders.filter((o: any) => o.is_duplicate_invoice || o.duplicate_reason).length
        const multiplier = riderOrders.filter((o: any) => num(o.order_multiplier || 1) >= 1.5).length
        const rewards = riderOrders.reduce((sum: number, o: any) => sum + num(o.reward_amount || o.rewards_amount), 0)
        const penalties = riderOrders.reduce((sum: number, o: any) => sum + num(o.penalty_amount || o.penalties_amount), 0)
        const score = Math.max(0, Math.min(100, 100 - failed * 8 - duplicates * 5 + delivered * 0.15))
        const branch = branches.find((b: any) => b.id === rider.branch_id)
        return { rider: rider.name || rider.username || 'غير محدد', branch: (branch as any)?.name || rider.branch_name || 'غير محدد', riderId: rider.id, orders: riderOrders.length, delivered, failed, trips: riderTrips.length, approvedTrips: riderTrips.filter((t: any) => ['approved','completed','countable'].includes(String(t.status || t.review_status || '').toLowerCase())).length, duplicates, multiplier, lateMinutes: 0, absence: 0, incidents: failed + duplicates, rewards, penalties, avgScore: score, deliveryRate: riderOrders.length ? Math.round((delivered / riderOrders.length) * 100) : 0, netEarnings: rewards - penalties }
      })
      setPerformanceData(aggregated)
    } catch (error: any) {
      toast.error(error?.message || 'حصلت مشكلة في تحميل بيانات الأداء')
    } finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    let rows = performanceData.filter(r => !searchTerm || r.rider.includes(searchTerm) || r.branch.includes(searchTerm))
    rows = [...rows].sort((a, b) => sortBy === 'score' ? b.avgScore - a.avgScore : sortBy === 'orders' ? b.orders - a.orders : sortBy === 'delivered' ? b.delivered - a.delivered : b.penalties - a.penalties)
    return rows
  }, [performanceData, searchTerm, sortBy])

  const totals = useMemo(() => ({ orders: filtered.reduce((s, r) => s + r.orders, 0), delivered: filtered.reduce((s, r) => s + r.delivered, 0), failed: filtered.reduce((s, r) => s + r.failed, 0), trips: filtered.reduce((s, r) => s + r.trips, 0), penalties: filtered.reduce((s, r) => s + r.penalties, 0), rewards: filtered.reduce((s, r) => s + r.rewards, 0), avgScore: filtered.length > 0 ? filtered.reduce((s, r) => s + r.avgScore, 0) / filtered.length : 0 }), [filtered])
  const maxOrders = Math.max(...filtered.map(r => r.orders), 1)
  const drillParams = (filter?: string) => ({ filter, from, to })

  return <div className="min-h-screen bg-[#F3F7F8]" dir="rtl"><header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur-md shadow-sm"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3"><button onClick={() => navigate('/admin')} className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 active:scale-95"><ArrowLeft size={16} /> رجوع</button><div className="text-center"><h1 className="text-lg font-black text-[#061827]">📊 تقرير الأداء</h1><p className="text-xs font-bold text-slate-400">{from} إلى {to}</p></div><button onClick={loadPerformanceData} disabled={loading} className="rounded-2xl border bg-white p-2 text-slate-600 hover:bg-slate-50 active:scale-95"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></div></header><main className="mx-auto max-w-6xl p-4 space-y-4"><div className="flex gap-2 overflow-x-auto pb-1">{tabs.map(t => <button key={t.id} onClick={() => chooseTab(t.id)} className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-black transition-all active:scale-95 ${tab === t.id ? 'bg-[#008E92] text-white shadow-md' : 'bg-white text-slate-600 border hover:bg-slate-50'}`}><span>{t.emoji}</span>{t.label}</button>)}</div>{!loading && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><StatCard label="إجمالي الأوردرات" value={totals.orders} icon="📦" tone="blue" /><StatCard label="تم التسليم" value={totals.delivered} icon="✅" tone="green" sub={`${totals.orders > 0 ? Math.round((totals.delivered/totals.orders)*100) : 0}%`} /><StatCard label="إجمالي المكافآت" value={formatMoney(totals.rewards)} icon="🎁" tone="green" /><StatCard label="إجمالي الخصومات" value={formatMoney(totals.penalties)} icon="⚠️" tone="red" /></div>}<div className="flex flex-wrap gap-2"><input type="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث باسم المندوب أو الفرع..." dir="rtl" className="flex-1 min-w-48 rounded-2xl border bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-[#008E92] focus:ring-2 focus:ring-[#008E92]/20" /><select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="rounded-2xl border bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-[#008E92]"><option value="score">ترتيب حسب التقييم</option><option value="orders">ترتيب حسب الأوردرات</option><option value="delivered">ترتيب حسب التسليم</option><option value="penalties">ترتيب حسب الخصومات</option></select></div>{loading && <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-28 animate-pulse rounded-3xl bg-slate-200" />)}</div>}{!loading && filtered.length === 0 && <div className="rounded-3xl bg-white p-10 text-center shadow-sm"><p className="text-4xl">📭</p><p className="mt-3 font-bold text-slate-500">لا توجد بيانات أداء للفترة المحددة</p></div>}{!loading && filtered.map((r, idx) => <div key={r.riderId} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm space-y-3"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#008E92] to-[#006A70] text-sm font-black text-white shadow-sm">{idx + 1}</div><div><p className="font-black text-[#061827]">{r.rider}</p><p className="text-xs font-bold text-slate-400">{r.branch}</p></div></div><div className="flex flex-col items-end gap-1"><ScoreBadge score={Math.round(r.avgScore)} /><span className="text-xs font-black text-slate-400">تقييم: {r.avgScore.toFixed(0)}/100</span></div></div><div><div className="mb-1 flex items-center justify-between"><span className="text-xs font-bold text-slate-500">الأوردرات</span><span className="text-xs font-black text-slate-700">{r.delivered} / {r.orders} تسليم</span></div><MiniBar value={r.delivered} max={maxOrders} color="#008E92" /></div><div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{[{ label: 'مشاوير', value: r.trips, emoji: '🛵' }, { label: 'فشل', value: r.failed, emoji: '❌', warn: r.failed > 5 }, { label: '1.5x', value: r.multiplier, emoji: '⏱️' }, { label: 'مكرر', value: r.duplicates, emoji: '🔁', warn: r.duplicates > 0 }, { label: 'مكافآت', value: formatMoney(r.rewards).replace(' ج.م',''), emoji: '🎁' }, { label: 'خصومات', value: formatMoney(r.penalties).replace(' ج.م',''), emoji: '💸', warn: r.penalties > 0 }].map(s => <div key={s.label} className={`rounded-2xl p-2 text-center ${s.warn ? 'bg-rose-50 border border-rose-100' : 'bg-slate-50'}`}><p className="text-base">{s.emoji}</p><p className={`text-xs font-black ${s.warn ? 'text-rose-700' : 'text-slate-700'}`}>{s.value}</p><p className="text-[10px] font-bold text-slate-400">{s.label}</p></div>)}</div><div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-2 text-center text-xs font-black"><DrillNumber value={`الكل ${r.orders}`} onClick={() => navigate(riderPerformanceUrl(r.riderId, drillParams('all')))} /><DrillNumber value={`تم ${r.delivered}`} onClick={() => navigate(riderPerformanceUrl(r.riderId, drillParams('delivered')))} /><DrillNumber value={`فشل ${r.failed}`} onClick={() => navigate(riderPerformanceUrl(r.riderId, drillParams('failed')))} /><DrillNumber value={`مكرر ${r.duplicates}`} onClick={() => navigate(riderPerformanceUrl(r.riderId, drillParams('duplicate')))} /><DrillNumber value={`مشاوير ${r.trips}`} onClick={() => navigate(riderPerformanceUrl(r.riderId, drillParams('trips')))} /><DrillNumber value={`1.5x ${r.multiplier}`} onClick={() => navigate(riderPerformanceUrl(r.riderId, drillParams('multiplier')))} /></div><button onClick={() => navigate(riderPerformanceUrl(r.riderId, { from, to }))} title="اضغط للتفاصيل" className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#008E92] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#00777B] hover:shadow-lg active:scale-[0.99]">فتح الصفحة التفصيلية + تقرير PDF</button>{(r.rewards > 0 || r.penalties > 0) && <div className={`flex items-center justify-between rounded-2xl px-3 py-2 text-sm font-black ${r.netEarnings >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}><span>{r.netEarnings >= 0 ? <TrendingUp size={14} className="inline ml-1" /> : <TrendingDown size={14} className="inline ml-1" />}صافي المكافآت والخصومات</span><span>{formatMoney(r.netEarnings)}</span></div>}</div>)}{!loading && filtered.length > 0 && <div className="rounded-3xl bg-gradient-to-l from-amber-50 to-white border border-amber-200 p-4 text-center shadow-sm"><Award className="mx-auto mb-2 text-amber-500" size={28} /><p className="font-black text-amber-800">🏆 الأفضل في الفترة</p><p className="mt-1 text-lg font-black text-[#008E92]">{filtered[0]?.rider}</p><p className="text-sm font-bold text-slate-500">{filtered[0]?.branch} — تقييم {filtered[0]?.avgScore.toFixed(0)}/100</p></div>}</main></div>
}
