import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'
import { riderPerformanceUrl } from '../../lib/adminDrilldown'
import { isDelivered, isFailed, isMultiplier, isDuplicate, isUncounted, isOverdue, orderAmount } from '../../lib/deliveryAnalytics'

type Row = {
  id: string
  name: string
  branch: string
  orders: number
  delivered: number
  failed: number
  oneX: number
  multi: number
  dup: number
  uncounted: number
  overdue: number
  trips: number
  cash: number
  risk: number
}

export default function PerformanceActual() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [ridersRes, ordersRes, tripsRes] = await Promise.all([
        supabase.from('riders').select('*').order('name'),
        supabase.from('delivery_orders').select('*').gte('work_date', period.start).lte('work_date', period.end).limit(20000),
        supabase.from('internal_trips').select('*').gte('work_date', period.start).lte('work_date', period.end).limit(10000),
      ])
      if (ridersRes.error) throw ridersRes.error
      if (ordersRes.error) throw ordersRes.error
      const riders = ridersRes.data || []
      const orders = ordersRes.data || []
      const trips = tripsRes.data || []
      const nextRows: Row[] = riders.map((r: any) => {
        const ro = orders.filter((o: any) => o.rider_id === r.id)
        const rt = trips.filter((t: any) => t.rider_id === r.id)
        const delivered = ro.filter(isDelivered).length
        const failed = ro.filter(isFailed).length
        const multi = ro.filter(isMultiplier).length
        const dup = ro.filter(isDuplicate).length
        const uncounted = ro.filter(isUncounted).length
        const overdue = ro.filter((o: any) => isOverdue(o, 60)).length
        const risk = Math.min(100, overdue * 8 + failed * 5 + dup * 4 + uncounted * 3)
        return {
          id: r.id,
          name: r.name || r.username || 'غير محدد',
          branch: r.branch_name || 'غير محدد',
          orders: ro.length,
          delivered,
          failed,
          oneX: Math.max(0, ro.length - multi - failed),
          multi,
          dup,
          uncounted,
          overdue,
          trips: rt.length,
          cash: ro.reduce((s: number, o: any) => s + orderAmount(o), 0),
          risk,
        }
      }).filter((r: Row) => r.orders || r.trips).sort((a: Row, b: Row) => b.orders - a.orders)
      setRows(nextRows)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الأداء الفعلي')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const visible = rows.filter(r => !q || r.name.includes(q) || r.branch.includes(q))
  const totals = useMemo(() => ({
    orders: visible.reduce((s, r) => s + r.orders, 0),
    delivered: visible.reduce((s, r) => s + r.delivered, 0),
    failed: visible.reduce((s, r) => s + r.failed, 0),
    multi: visible.reduce((s, r) => s + r.multi, 0),
    trips: visible.reduce((s, r) => s + r.trips, 0),
    cash: visible.reduce((s, r) => s + r.cash, 0),
    overdue: visible.reduce((s, r) => s + r.overdue, 0),
  }), [visible])
  const card = (label: string, value: string | number, to?: string) => <button type="button" onClick={() => to && navigate(to)} className="rounded-3xl border bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-[#061827]">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-400">اضغط للتفاصيل</p></button>

  return <div className="min-h-screen bg-[#F3F7F8] p-4 text-right" dir="rtl"><div className="mx-auto max-w-7xl space-y-4">
    <header className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm"><button onClick={() => navigate('/admin')} className="rounded-2xl bg-slate-100 px-4 py-2 font-black"><ArrowLeft size={16} className="inline"/> رجوع</button><div><h1 className="text-2xl font-black">تحليل أداء المناديب الفعلي</h1><p className="text-xs font-bold text-slate-400">من {period.start} إلى {period.end}</p></div><button onClick={load} className="rounded-2xl bg-[#008E92] px-4 py-2 font-black text-white"><RefreshCw size={16} className={loading ? 'inline animate-spin' : 'inline'}/> تحديث</button></header>
    <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">{card('إجمالي الأوردرات', totals.orders, '/admin/reconciliation')}{card('تم التسليم', totals.delivered, '/admin/reconciliation?status=delivered')}{card('فشل', totals.failed, '/admin/reconciliation?status=failed')}{card('1.5x', totals.multi, '/admin/reconciliation?multiplier=1.5')}{card('متأخر +60د', totals.overdue, '/admin/ops?filter=overdue')}{card('المشاوير', totals.trips, '/admin/trips')}{card('إجمالي النقدي', formatMoney(totals.cash), '/admin/cash-flow')}</section>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث باسم المندوب أو الفرع" className="w-full rounded-2xl border bg-white px-4 py-3 font-bold outline-none" />
    <section className="space-y-3">{loading && <div className="rounded-3xl bg-white p-8 text-center font-black text-slate-400">جاري التحميل...</div>}{!loading && visible.map(r => <article key={r.id} className="rounded-3xl border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><button onClick={() => navigate(riderPerformanceUrl(r.id))} className="text-right"><b className="text-lg">{r.name}</b><p className="text-xs font-bold text-slate-400">{r.branch}</p></button><span className={`rounded-full px-3 py-1 text-xs font-black ${r.risk > 35 ? 'bg-rose-50 text-rose-700' : r.risk > 15 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>خطر {r.risk}%</span></div><div className="grid grid-cols-3 gap-2 md:grid-cols-9">{[['الكل',r.orders,'all'],['تم',r.delivered,'delivered'],['فشل',r.failed,'failed'],['1x',r.oneX,'one_x'],['1.5x',r.multi,'multiplier'],['مكرر',r.dup,'duplicate'],['غير محتسب',r.uncounted,'uncounted'],['متأخر',r.overdue,'review'],['مشاوير',r.trips,'trips']].map(([label,value,filter]) => <button key={String(label)} onClick={() => navigate(riderPerformanceUrl(r.id, { filter: String(filter) }))} className="rounded-2xl bg-slate-50 p-3 transition hover:bg-emerald-50"><p className="text-xs font-bold text-slate-500">{label}</p><p className="text-lg font-black text-[#008E92]">{value}</p></button>)}</div><div className="mt-3 rounded-2xl bg-emerald-50 p-3 font-black text-emerald-700">النقدي: {formatMoney(r.cash)}</div></article>)}</section>
  </div></div>
}
