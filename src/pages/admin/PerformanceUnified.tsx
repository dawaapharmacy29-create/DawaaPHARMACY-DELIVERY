import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { getOperationalPeriod, formatMoney } from '../../lib/helpers'
import { aggregateCanonicalRiders, loadCanonicalDeliveryData } from '../../lib/canonicalDeliveryData'

const today = () => new Date().toISOString().slice(0, 10)
function addDays(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }
type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly'
function rangeFor(tab: Period) { const op = getOperationalPeriod(); if (tab === 'daily') return { from: today(), to: today() }; if (tab === 'weekly') return { from: addDays(-6), to: today() }; if (tab === 'quarterly') return { from: addDays(-89), to: today() }; return { from: op.start, to: op.end } }

function Stat({ label, value, tone = 'sky' }: { label: string; value: string | number; tone?: 'sky' | 'green' | 'rose' | 'amber' }) {
  const cls = { sky: 'bg-sky-50 border-sky-100 text-sky-700', green: 'bg-emerald-50 border-emerald-100 text-emerald-700', rose: 'bg-rose-50 border-rose-100 text-rose-700', amber: 'bg-amber-50 border-amber-100 text-amber-700' }[tone]
  return <div className={`rounded-3xl border p-5 ${cls}`}><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>
}

export default function PerformanceUnified() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Period>((params.get('period') as Period) || 'monthly')
  const fallback = rangeFor(tab)
  const from = params.get('from') || fallback.from
  const to = params.get('to') || fallback.to
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'orders' | 'delivered' | 'risk'>('orders')

  async function load() {
    setLoading(true)
    try { const data = await loadCanonicalDeliveryData(from, to); setRows(aggregateCanonicalRiders(data).filter(r => r.total_orders || r.trips)) }
    catch (error: any) { toast.error(error?.message || 'حصلت مشكلة في تحميل بيانات الأداء') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [from, to])

  function choose(next: Period) { setTab(next); const r = rangeFor(next); setParams({ period: next, from: r.from, to: r.to }) }

  const filtered = useMemo(() => [...rows.filter(r => !search || r.rider_name.includes(search) || r.branch_name.includes(search))].sort((a, b) => sort === 'orders' ? b.total_orders - a.total_orders : sort === 'delivered' ? b.delivered_orders - a.delivered_orders : b.risk_rate - a.risk_rate), [rows, search, sort])
  const totals = useMemo(() => filtered.reduce((a, r) => ({ orders: a.orders + r.total_orders, delivered: a.delivered + r.delivered_orders, failed: a.failed + r.failed_orders, trips: a.trips + r.trips, rewards: a.rewards + r.rewards, penalties: a.penalties + r.penalties }), { orders: 0, delivered: 0, failed: 0, trips: 0, rewards: 0, penalties: 0 }), [filtered])

  return <div className="min-h-screen bg-[#F3F7F8]" dir="rtl"><header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 shadow-sm"><div className="mx-auto flex max-w-6xl items-center justify-between"><button onClick={() => navigate('/admin')} className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 font-bold"><ArrowLeft size={16}/> رجوع</button><div className="text-center"><h1 className="text-lg font-black">📊 تقرير الأداء</h1><p className="text-xs font-bold text-slate-400">مصدر موحد مباشر · {from} إلى {to}</p></div><button onClick={load} className="rounded-2xl border bg-white p-2"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/></button></div></header><main className="mx-auto max-w-6xl space-y-4 p-4">
    <div className="flex gap-2 overflow-x-auto">{([['daily','يومي'],['weekly','أسبوعي'],['monthly','الدورة'],['quarterly','ربع سنوي']] as const).map(([id,label]) => <button key={id} onClick={() => choose(id)} className={`rounded-2xl px-4 py-2.5 font-black ${tab === id ? 'bg-[#008E92] text-white' : 'border bg-white text-slate-600'}`}>{label}</button>)}</div>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="إجمالي الأوردرات" value={loading ? '—' : totals.orders}/><Stat label="تم التسليم" value={totals.delivered} tone="green"/><Stat label="إجمالي المكافآت" value={formatMoney(totals.rewards)} tone="green"/><Stat label="إجمالي الخصومات" value={formatMoney(totals.penalties)} tone="rose"/></section>
    <section className="rounded-3xl bg-white p-4 shadow-sm"><div className="grid gap-2 lg:grid-cols-[1fr_220px]"><input value={search} onChange={e => setSearch(e.target.value)} className="rounded-2xl border px-4 py-3" placeholder="بحث باسم المندوب أو الفرع..."/><select value={sort} onChange={e => setSort(e.target.value as any)} className="rounded-2xl border px-3 py-2 font-bold"><option value="orders">ترتيب حسب الأوردرات</option><option value="delivered">حسب تم التسليم</option><option value="risk">حسب الخطر</option></select></div></section>
    <section className="space-y-3">{filtered.map((r, i) => <article key={r.rider_id} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#008E92] font-black text-white">{i+1}</span><div><h2 className="font-black">{r.rider_name}</h2><p className="text-xs font-bold text-slate-400">{r.branch_name}</p></div></div></div><button onClick={() => navigate(`/admin/riders/${r.rider_id}/performance?from=${from}&to=${to}`)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">فتح التفاصيل</button></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6 text-center"><div className="rounded-2xl bg-slate-50 p-3"><b>{r.total_orders}</b><p className="text-[10px] text-slate-400">أوردرات</p></div><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><b>{r.delivered_orders}</b><p className="text-[10px]">تم</p></div><div className="rounded-2xl bg-rose-50 p-3 text-rose-700"><b>{r.failed_orders}</b><p className="text-[10px]">فشل</p></div><div className="rounded-2xl bg-amber-50 p-3"><b>{r.duplicate_orders}</b><p className="text-[10px]">مكرر</p></div><div className="rounded-2xl bg-sky-50 p-3"><b>{r.multiplier_orders}</b><p className="text-[10px]">1.5x</p></div><div className="rounded-2xl bg-violet-50 p-3"><b>{r.trips}</b><p className="text-[10px]">مشاوير</p></div></div><div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold">نسبة التسليم: {r.delivery_rate.toFixed(1)}% · الخطر: {r.risk_rate.toFixed(1)}% · صافي: {formatMoney(r.netEarnings)}</div></article>)}</section>
  </main></div>
}
