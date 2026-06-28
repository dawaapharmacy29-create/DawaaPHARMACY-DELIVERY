import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, History, PackageCheck, Route, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getOperationalPeriod } from '../lib/helpers'

type OrderRow = { id: string; delivery_date?: string | null; work_date?: string | null; registered_at?: string | null; created_at?: string | null; status?: string | null; delivered_at?: string | null; failed_reason?: string | null; invoice_amount?: number | null }
type TripRow = { id: string; trip_date?: string | null; work_date?: string | null; registered_at?: string | null; created_at?: string | null; status?: string | null; proof_image_url?: string | null; proof_exception_status?: string | null; audit_status?: string | null }
type CycleRow = { key: string; start: string; end: string; orders: number; delivered: number; failed: number; trips: number; tripsWithProof: number; tripsWithoutProof: number; exceptions: number; pendingTrips: number; sales: number }

function d(value?: string | null) { return String(value || '').slice(0, 10) }
function orderDate(o: OrderRow) { return d(o.work_date || o.delivery_date || o.registered_at || o.created_at) }
function tripDate(t: TripRow) { return d(t.work_date || t.trip_date || t.registered_at || t.created_at) }
function ok(o: OrderRow) { return o.status === 'delivered' || Boolean(o.delivered_at) }
function bad(o: OrderRow) { return o.status === 'failed' || Boolean(o.failed_reason) }
function money(value: number) { return `${Math.round(value).toLocaleString('ar-EG')} ج` }

export default function CycleArchiveOverview() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [trips, setTrips] = useState<TripRow[]>([])
  const [loading, setLoading] = useState(true)
  const archiveStart = useMemo(() => { const now = new Date(); now.setMonth(now.getMonth() - 5); return getOperationalPeriod(now).start }, [])
  const current = useMemo(() => getOperationalPeriod(), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [ordersRes, tripsRes] = await Promise.allSettled([
        supabase.from('delivery_orders').select('id,delivery_date,work_date,registered_at,created_at,status,delivered_at,failed_reason,invoice_amount').gte('delivery_date', archiveStart).lte('delivery_date', current.end).limit(6000),
        supabase.from('internal_trip_daily_audit').select('id,trip_date,work_date,registered_at,created_at,status,proof_image_url,proof_exception_status,audit_status').gte('trip_date', archiveStart).lte('trip_date', current.end).limit(4000),
      ])
      if (cancelled) return
      if (ordersRes.status === 'fulfilled' && !ordersRes.value.error) setOrders((ordersRes.value.data || []) as OrderRow[])
      if (tripsRes.status === 'fulfilled' && !tripsRes.value.error) setTrips((tripsRes.value.data || []) as TripRow[])
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [archiveStart, current.end])

  const rows = useMemo(() => {
    const map = new Map<string, CycleRow>()
    const ensure = (date: string) => {
      const p = getOperationalPeriod(new Date(`${date}T12:00:00`))
      const key = `${p.start} → ${p.end}`
      if (!map.has(key)) map.set(key, { key, start: p.start, end: p.end, orders: 0, delivered: 0, failed: 0, trips: 0, tripsWithProof: 0, tripsWithoutProof: 0, exceptions: 0, pendingTrips: 0, sales: 0 })
      return map.get(key)!
    }
    for (const order of orders) {
      const date = orderDate(order); if (!date) continue
      const row = ensure(date); row.orders += 1; if (ok(order)) row.delivered += 1; if (bad(order)) row.failed += 1; row.sales += Number(order.invoice_amount || 0)
    }
    for (const trip of trips) {
      const date = tripDate(trip); if (!date) continue
      const row = ensure(date); row.trips += 1; if (trip.proof_image_url) row.tripsWithProof += 1; else row.tripsWithoutProof += 1; if (trip.proof_exception_status === 'pending') row.exceptions += 1; if (trip.status === 'pending_approval' || trip.audit_status === 'pending_approval') row.pendingTrips += 1
    }
    return [...map.values()].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 6)
  }, [orders, trips])

  return <section className="rounded-[2rem] border border-white/80 bg-white p-5 shadow-sm" dir="rtl">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-black text-[#008E92]"><History size={16} /> أرشيف آخر الدورات</p><h2 className="mt-1 text-xl font-black text-[#102a32]">أرشيف الأوردرات والمشاوير</h2><p className="mt-1 text-xs font-bold text-slate-400">يشمل آخر الدورات: أوردرات + مشاوير + صور الإثبات + الاستثناءات</p></div>{loading && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">جاري التحميل...</span>}</div>
    {rows.length === 0 ? <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">لا توجد بيانات أرشيف بعد</div> : <div className="grid gap-3 lg:grid-cols-2">{rows.map(row => {
      const success = row.orders ? Math.round(row.delivered / row.orders * 100) : 0
      const proofRate = row.trips ? Math.round(row.tripsWithProof / row.trips * 100) : 0
      return <article key={row.key} className="rounded-3xl border border-slate-100 bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><b className="text-[#102a32]">{row.key}</b><p className="mt-1 text-xs font-bold text-slate-400">مبيعات {money(row.sales)}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700">نجاح {success}%</span></div><div className="grid gap-2 sm:grid-cols-3"><Mini icon={<PackageCheck size={14} />} label="أوردرات" value={row.orders} hint={`${row.delivered} تم · ${row.failed} فشل`} /><Mini icon={<Route size={14} />} label="مشاوير" value={row.trips} hint={`${row.pendingTrips} مستني اعتماد`} /><Mini icon={<ShieldCheck size={14} />} label="التزام الصور" value={`${proofRate}%`} hint={`${row.tripsWithProof} بصورة · ${row.exceptions} استثناء`} /></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => navigate(`/admin/reconciliation?from=${row.start}&to=${row.end}`)} className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-[#008E92]">مطابقة الدورة</button><button onClick={() => navigate('/admin/trips')} className="inline-flex items-center gap-1 rounded-2xl bg-white px-3 py-2 text-xs font-black text-rose-700">مشاوير الدورة <ChevronLeft size={13} /></button></div></article>
    })}</div>}
  </section>
}

function Mini({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number | string; hint: string }) { return <div className="rounded-2xl bg-white p-3"><p className="flex items-center gap-1 text-[11px] font-black text-slate-400">{icon}{label}</p><b className="mt-1 block text-xl text-[#102a32]">{typeof value === 'number' ? value.toLocaleString('ar-EG') : value}</b><p className="mt-1 text-[11px] font-bold text-slate-400">{hint}</p></div> }
