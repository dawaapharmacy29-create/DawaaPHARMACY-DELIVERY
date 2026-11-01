import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RefreshCw, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { getOperationalPeriod, formatMoney } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'
import { getBranches, getRiders } from '../../lib/delivery'
import TeamAdminTabs from '../../components/TeamAdminTabs'

const today = () => new Date().toISOString().slice(0, 10)
function addDays(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }
type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly'
function rangeFor(tab: Period) { const op = getOperationalPeriod(); if (tab === 'daily') return { from: today(), to: today() }; if (tab === 'weekly') return { from: addDays(-6), to: today() }; if (tab === 'quarterly') return { from: addDays(-89), to: today() }; return { from: op.start, to: op.end } }
function rpcResult(data:any){ return Array.isArray(data) ? data[0] : data }
function operationalMetrics(row: any) {
  if (row.historical) return 'مؤشرات التسليم والخطر والحوافز غير متاحة من الملخص التاريخي؛ الحركات المعتمدة أعلاه محسوبة من السجلات.'
  return `نسبة التسليم: ${Number(row.delivery_rate || 0).toFixed(1)}% · الخطر: ${Number(row.risk_rate || 0).toFixed(1)}% · صافي الحوافز: ${formatMoney(row.net_earnings)}`
}
function shiftCycle(start: string, offset: number) {
  const [year, month] = start.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1 + offset, 26))
  const next = new Date(Date.UTC(year, month + offset, 26))
  next.setUTCDate(next.getUTCDate() - 1)
  return { from: first.toISOString().slice(0, 10), to: next.toISOString().slice(0, 10) }
}
const quantity = (value: unknown) => Number(value || 0) || 0
const countableOrder = (order: any) =>
  (String(order.status || '').toLowerCase() === 'delivered' || Boolean(order.delivered_at)) &&
  (order.is_countable === true || String(order.final_count_status || '').startsWith('counted')) &&
  String(order.final_count_status || '').startsWith('counted')
const approvedTrip = (trip: any) =>
  ['approved', 'completed', 'countable'].includes(String(trip.status || trip.review_status || '').toLowerCase()) &&
  trip.is_countable !== false && !trip.duplicate_of

async function fetchAll(table: 'delivery_orders' | 'internal_trips', fields: string, dateField: string, from: string, to: string) {
  const result: any[] = []
  for (let start = 0; start < 50000; start += 1000) {
    const { data, error } = await supabase.from(table).select(fields).gte(dateField, from).lte(dateField, to).order('id').range(start, start + 999)
    if (error) throw error
    result.push(...(data || []))
    if (!data || data.length < 1000) return result
  }
  throw new Error('عدد الحركات أكبر من حد التقرير؛ لا يمكن عرض إجمالي غير مكتمل')
}

async function loadMovements(from: string, to: string) {
  const [byWork, byDelivery, tripsWork, tripsDate] = await Promise.all([
    fetchAll('delivery_orders', 'id,rider_id,branch_id,branch_name,status,delivered_at,approval_status,is_countable,final_count_status,order_multiplier,work_date,delivery_date,deleted_at', 'work_date', from, to),
    fetchAll('delivery_orders', 'id,rider_id,branch_id,branch_name,status,delivered_at,approval_status,is_countable,final_count_status,order_multiplier,work_date,delivery_date,deleted_at', 'delivery_date', from, to),
    fetchAll('internal_trips', 'id,rider_id,branch_id,branch_name,status,review_status,is_countable,duplicate_of,work_date,trip_date', 'work_date', from, to),
    fetchAll('internal_trips', 'id,rider_id,branch_id,branch_name,status,review_status,is_countable,duplicate_of,work_date,trip_date', 'trip_date', from, to),
  ])
  const result = new Map<string, { near: number; far: number; trips: number; movements: number }>()
  const byBranch = new Map<string, number>()
  const addBranch = (record: any, quantity: number) => {
    const key = record.branch_id || record.branch_name || 'غير محدد'
    byBranch.set(key, (byBranch.get(key) || 0) + quantity)
  }
  const get = (id: string) => {
    if (!result.has(id)) result.set(id, { near: 0, far: 0, trips: 0, movements: 0 })
    return result.get(id)!
  }
  const orders = new Map([...byWork, ...byDelivery].map(o => [o.id, o]))
  for (const order of orders.values()) {
    if (order.deleted_at || !countableOrder(order)) continue
    const date = order.work_date || order.delivery_date
    if (!date || date < from || date > to || !order.rider_id) continue
    const stat = get(order.rider_id)
    const multiplier = !String(order.final_count_status || '').includes('multiplier_pending') && quantity(order.order_multiplier) >= 1.5 ? 1.5 : 1
    if (multiplier === 1.5) stat.far++
    else stat.near++
    stat.movements += multiplier
    addBranch(order, multiplier)
  }
  const trips = new Map([...tripsWork, ...tripsDate].map(t => [t.id, t]))
  for (const trip of trips.values()) {
    if (!approvedTrip(trip) || !trip.rider_id) continue
    const date = trip.work_date || trip.trip_date
    if (!date || date < from || date > to) continue
    const stat = get(trip.rider_id)
    stat.trips++
    stat.movements++
    addBranch(trip, 1)
  }
  return { riders: result, branches: byBranch }
}

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
  const [totals, setTotals] = useState<any>({ orders:0, delivered:0, failed:0, trips:0, rewards:0, penalties:0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'movements' | 'orders' | 'delivered' | 'risk'>('movements')
  const [movements, setMovements] = useState<Map<string, { near: number; far: number; trips: number; movements: number }> | null>(null)
  const [movementBranches, setMovementBranches] = useState<Map<string, number> | null>(null)
  const [movementError, setMovementError] = useState(false)
  const cycleStart = getOperationalPeriod().start
  const cycles = [0, -1, -2, -3].map(offset => ({ offset, ...shiftCycle(cycleStart, offset) }))

  async function load() {
    setLoading(true)
    setMovements(null)
    setMovementBranches(null)
    setMovementError(false)
    try {
      const [{ data, error }, movementResult, rosterResult] = await Promise.all([
        supabase.rpc('delivery_performance_fast', { p_from: from, p_to: to }),
        loadMovements(from, to).then(value => ({ value })).catch(() => ({ value: null })),
        Promise.all([getRiders(), getBranches()]).then(([riders, branches]) => ({ riders, branches })).catch(() => ({ riders: [], branches: [] })),
      ])
      if (error) throw error
      const result = rpcResult(data)
      if (!result?.success) throw new Error(result?.message || 'تعذر تحميل بيانات الأداء')
      const fastRows = Array.isArray(result.rows) ? result.rows : []
      const seen = new Set(fastRows.map((row: any) => row.rider_id))
      const archivedRows = rosterResult.riders.filter((rider: any) => !seen.has(rider.id) && movementResult.value?.riders.get(rider.id)?.movements).map((rider: any) => ({ rider_id: rider.id, rider_name: rider.name || rider.username || 'غير محدد', branch_name: rider.branch_name || rosterResult.branches.find((branch: any) => branch.id === rider.branch_id)?.name || 'غير محدد', total_orders: null, delivered_orders: null, failed_orders: null, duplicate_orders: null, multiplier_orders: null, trips: null, delivery_rate: null, risk_rate: null, net_earnings: null, historical: true }))
      setRows([...fastRows, ...archivedRows])
      setTotals(result.totals || { orders:0, delivered:0, failed:0, trips:0, rewards:0, penalties:0 })
      setMovements(movementResult.value?.riders || null)
      const namedBranches = new Map<string, number>()
      for (const [key, count] of (movementResult.value?.branches || new Map<string, number>())) {
        const name = rosterResult.branches.find((branch: any) => branch.id === key)?.name || key
        namedBranches.set(name, (namedBranches.get(name) || 0) + count)
      }
      setMovementBranches(movementResult.value ? namedBranches : null)
      setMovementError(!movementResult.value)
    } catch (error: any) { toast.error(error?.message || 'حصلت مشكلة في تحميل بيانات الأداء') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [from, to])

  function choose(next: Period) { setTab(next); const r = rangeFor(next); setParams({ period: next, from: r.from, to: r.to }) }

  const filtered = useMemo(() => [...rows.filter(r => !search || String(r.rider_name||'').includes(search) || String(r.branch_name||'').includes(search))].sort((a, b) => sort === 'movements' && movements ? (movements.get(b.rider_id)?.movements || 0) - (movements.get(a.rider_id)?.movements || 0) : sort === 'orders' || (sort === 'movements' && !movements) ? Number(b.total_orders||0) - Number(a.total_orders||0) : sort === 'delivered' ? Number(b.delivered_orders||0) - Number(a.delivered_orders||0) : Number(b.risk_rate||0) - Number(a.risk_rate||0)), [rows, search, sort, movements])
  const movementTotal = movements ? [...movements.values()].reduce((sum, item) => sum + item.movements, 0) : null
  const branchTotals = movementBranches

  return <div className="min-h-screen bg-[#F3F7F8]" dir="rtl"><main className="mx-auto max-w-6xl space-y-4 p-4">
    <TeamAdminTabs />
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><BarChart3 size={20}/></span>
          <div>
            <p className="text-xs font-black text-[#008E92]">الفريق والأداء</p>
            <h1 className="mt-1 text-xl font-black text-[#061827]">أداء الدليفري</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">مقارنة الأداء حسب الفترة مع فصل الأوردرات والمشاوير والخصومات والمكافآت.</p>
            <p className="mt-1 text-xs font-bold text-slate-400">{from} إلى {to}</p>
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-600"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/> تحديث</button>
      </div>
    </section>
    <div className="flex gap-2 overflow-x-auto">{([['daily','يومي'],['weekly','أسبوعي'],['monthly','الدورة'],['quarterly','ربع سنوي']] as const).map(([id,label]) => <button key={id} onClick={() => choose(id)} className={`rounded-2xl px-4 py-2.5 font-black ${tab === id ? 'bg-[#008E92] text-white' : 'border bg-white text-slate-600'}`}>{label}</button>)}</div>
    <section className="rounded-3xl border bg-white p-4"><label htmlFor="performance-cycle" className="mb-2 block text-sm font-black text-slate-700">اختار دورة الدليفري (26 إلى 25)</label><select id="performance-cycle" value={cycles.find(c => c.from === from && c.to === to)?.offset ?? 'custom'} onChange={e => { const selected = cycles.find(c => c.offset === Number(e.target.value)); if (selected) { setTab('monthly'); setParams({ period: 'monthly', from: selected.from, to: selected.to }) } }} className="w-full rounded-2xl border px-4 py-3 font-bold sm:max-w-md"><option value="custom" disabled>فترة مخصصة</option>{cycles.map(c => <option key={c.offset} value={c.offset}>{c.offset === 0 ? 'الدورة الحالية' : c.offset === -1 ? 'الدورة السابقة' : `قبل ${Math.abs(c.offset)} دورات`} — {c.from} إلى {c.to}</option>)}</select></section>
    <section className="rounded-3xl border border-teal-100 bg-teal-50 p-4"><h2 className="mb-2 font-black text-teal-900">إجمالي الحركات المعتمدة</h2><p className="text-xs font-bold text-teal-700">أوردر ×1 + أوردر بعيد ×1.5 + مشوار معتمد ×1. لا تُحسب المعلقة أو الفاشلة.</p><p className="mt-2 text-3xl font-black text-teal-900">{loading ? 'جاري الحساب...' : movementTotal === null ? 'غير متاح' : movementTotal.toLocaleString('ar-EG')}</p>{movementError && <p role="alert" className="mt-2 text-xs font-bold text-rose-700">تعذر تأكيد الحركات من السجلات؛ تم إخفاء الرقم بدل عرض تقدير غير دقيق.</p>}{branchTotals && <div className="mt-3 flex flex-wrap gap-2">{[...branchTotals].map(([branch, value]) => <span key={branch} className="rounded-xl bg-white px-3 py-2 text-sm font-black">{branch}: {value.toLocaleString('ar-EG')}</span>)}</div>}<button type="button" onClick={() => navigate(`/admin/hourly-analytics?from=${from}&to=${to}`)} className="mt-3 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white">عرض نفس الدورة حسب الساعة</button></section>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-6"><Stat label="إجمالي الأوردرات" value={loading ? '—' : totals.orders}/><Stat label="تم التسليم" value={totals.delivered} tone="green"/><Stat label="فشل" value={totals.failed} tone="rose"/><Stat label="المشاوير" value={totals.trips} tone="sky"/><Stat label="المكافآت" value={formatMoney(totals.rewards)} tone="green"/><Stat label="الخصومات" value={formatMoney(totals.penalties)} tone="rose"/></section>
    <section className="rounded-3xl bg-white p-4 shadow-sm"><div className="grid gap-2 lg:grid-cols-[1fr_220px]"><input value={search} onChange={e => setSearch(e.target.value)} className="rounded-2xl border px-4 py-3" placeholder="بحث باسم المندوب أو الفرع..."/><select value={sort} onChange={e => setSort(e.target.value as any)} className="rounded-2xl border px-3 py-2 font-bold"><option value="movements">ترتيب حسب الحركات المعتمدة</option><option value="orders">ترتيب حسب الأوردرات</option><option value="delivered">حسب تم التسليم</option><option value="risk">حسب الخطر</option></select></div></section>
    <section className="space-y-3">
      {loading ? <div className="rounded-3xl bg-white p-12 text-center font-black text-slate-400">جاري حساب الأداء على السيرفر...</div> : filtered.map((r, i) => (
        <article key={r.rider_id} className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#008E92] font-black text-white">{i + 1}</span>
              <div><h2 className="font-black">{r.rider_name}</h2><p className="text-xs font-bold text-slate-400">{r.branch_name}</p></div>
            </div>
            <button onClick={() => navigate(`/admin/riders/${r.rider_id}/performance?from=${from}&to=${to}`)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">فتح التفاصيل</button>
          </div>
          <div className="mt-3 rounded-2xl bg-teal-50 p-3 font-black text-teal-800">
            الحركات المعتمدة: {movements ? (movements.get(r.rider_id)?.movements || 0).toLocaleString('ar-EG') : 'غير متاح'}
            {movements && <span className="block text-xs">قريب {movements.get(r.rider_id)?.near || 0} · بعيد {movements.get(r.rider_id)?.far || 0} ×1.5 · مشاوير معتمدة {movements.get(r.rider_id)?.trips || 0}</span>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6 text-center">
            {([
              ['أوردرات', r.total_orders, 'bg-slate-50 text-slate-700'],
              ['تم', r.delivered_orders, 'bg-emerald-50 text-emerald-700'],
              ['فشل', r.failed_orders, 'bg-rose-50 text-rose-700'],
              ['مكرر', r.duplicate_orders, 'bg-amber-50 text-amber-700'],
              ['1.5x', r.multiplier_orders, 'bg-sky-50 text-sky-700'],
              ['مشاوير مسجلة', r.trips, 'bg-violet-50 text-violet-700'],
            ] as const).map(([label, value, style]) =>
              <div key={label} className={`rounded-2xl p-3 ${style}`}><b>{value == null ? 'غير متاح' : value}</b><p className="text-[10px]">{label}</p></div>
            )}
          </div>
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold">{operationalMetrics(r)}</div>
        </article>
      ))}
    </section>
  </main></div>
}
