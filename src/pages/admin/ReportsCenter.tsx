import { useEffect, useMemo, useState } from 'react'
import { Download, FileBarChart, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AdminModuleShell, { ModuleMetric } from '../../components/AdminModuleShell'
import { supabase } from '../../lib/supabase'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'
import { isDelivered, isFailed, isMultiplier, orderAmount } from '../../lib/deliveryAnalytics'
import type { DeliveryOrder, InternalTrip, Rider } from '../../lib/types'

type Mode = 'cycle' | 'daily'

export default function ReportsCenter() {
  const navigate = useNavigate()
  const today = new Date().toISOString().slice(0, 10)
  const cycle = useMemo(() => getOperationalPeriod(), [])
  const [mode, setMode] = useState<Mode>('cycle')
  const [date, setDate] = useState(today)
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)

  const range = mode === 'daily' ? { start: date, end: date } : cycle

  async function load() {
    setLoading(true)
    const [o, t, r] = await Promise.all([
      supabase.from('delivery_orders').select('*').gte('work_date', range.start).lte('work_date', range.end).limit(20000),
      supabase.from('internal_trips').select('*').gte('work_date', range.start).lte('work_date', range.end).limit(10000),
      supabase.from('riders').select('*'),
    ])
    setOrders((o.data || []) as DeliveryOrder[])
    setTrips((t.data || []) as InternalTrip[])
    setRiders((r.data || []) as Rider[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [mode, date])

  const rows = useMemo(() => riders.map(r => {
    const ro = orders.filter(o => o.rider_id === r.id)
    const rt = trips.filter(t => t.rider_id === r.id)
    const done = ro.filter(isDelivered).length
    const failed = ro.filter(isFailed).length
    const multi = ro.filter(isMultiplier).length
    const oneX = Math.max(0, ro.length - multi - failed)
    const value = ro.reduce((s, o) => s + orderAmount(o), 0)
    return { id: r.id, name: r.name || r.username || 'غير محدد', total: ro.length, done, failed, oneX, multi, trips: rt.length, rate: ro.length ? Math.round(done / ro.length * 100) : 0, value }
  }).filter(r => r.total || r.trips).sort((a, b) => b.total - a.total), [orders, trips, riders])

  const delivered = orders.filter(isDelivered)
  const failed = orders.filter(isFailed)
  const multi = orders.filter(isMultiplier)
  const oneX = orders.length - multi.length - failed.length
  const value = orders.reduce((s, o) => s + orderAmount(o), 0)

  function csv() {
    const content = [['الدليفري','الأوردرات','تم التسليم','فشل','1x','1.5x','المشاوير','نسبة النجاح','قيمة الفواتير'], ...rows.map(r => [r.name,r.total,r.done,r.failed,r.oneX,r.multi,r.trips,`${r.rate}%`,r.value])].map(x => x.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' }))
    a.download = `dawaa-delivery-${mode}-${range.start}-${range.end}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return <AdminModuleShell title="مركز التقارير" subtitle="تقرير يومي أو دورة 26-25 من البيانات الفعلية" icon={<FileBarChart/>} loading={loading} onRefresh={load} actions={<><button onClick={csv} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black"><Download size={15}/> Excel/CSV</button><button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white"><Printer size={15}/> طباعة PDF</button></>}>
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 print:hidden"><select value={mode} onChange={e => setMode(e.target.value as Mode)} className="rounded-xl border px-3 py-2 font-black"><option value="cycle">تقرير الدورة الحالية</option><option value="daily">تقرير يومي</option></select>{mode === 'daily' && <label className="text-xs font-black text-slate-500">تاريخ التقرير <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mr-3 rounded-xl border px-3 py-2"/></label>}<span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-500">من {range.start} إلى {range.end}</span><button onClick={() => navigate(`/admin/reconciliation?from=${range.start}&to=${range.end}`)} className="rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white">فتح المطابقة لنفس الفترة</button></div>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-6"><ModuleMetric label="إجمالي الأوردرات" value={orders.length} hint={mode === 'cycle' ? 'الدورة الحالية' : date}/><ModuleMetric label="تم التسليم" value={delivered.length} hint={`${orders.length ? Math.round(delivered.length / orders.length * 100) : 0}%`} tone="teal"/><ModuleMetric label="فشل" value={failed.length} hint="لا يحتسب" tone="rose"/><ModuleMetric label="1x" value={Math.max(0, oneX)} hint="أوردر عادي"/><ModuleMetric label="1.5x" value={multi.length} hint="بعيد أو زيادة" tone="violet"/><ModuleMetric label="إجمالي النقدي" value={formatMoney(value)} hint="كل الفواتير" tone="teal"/></section>
    <div className="mt-5 overflow-hidden rounded-[2rem] border bg-white shadow-sm"><div className="border-b p-5 text-center"><h2 className="text-xl font-black">تقرير الدليفري — صيدلية دواء</h2><p className="mt-1 text-xs font-bold text-slate-400">الفترة: {range.start} إلى {range.end}</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-xs"><tr><th className="p-4">الدليفري</th><th>الأوردرات</th><th>تم التسليم</th><th>فشل</th><th>1x</th><th>1.5x</th><th>المشاوير</th><th>نسبة النجاح</th><th>قيمة الفواتير</th></tr></thead><tbody>{rows.map(r => <tr key={r.id} className="border-t text-center"><td className="p-4 text-right"><button onClick={() => navigate(`/admin/riders/${r.id}/performance?from=${range.start}&to=${range.end}`)} className="font-black text-[#008E92] hover:underline">{r.name}</button></td><td>{r.total}</td><td className="font-black text-emerald-700">{r.done}</td><td className="font-black text-rose-600">{r.failed}</td><td>{r.oneX}</td><td>{r.multi}</td><td>{r.trips}</td><td>{r.rate}%</td><td>{formatMoney(r.value)}</td></tr>)}{!rows.length && <tr><td colSpan={9} className="p-12 text-center font-bold text-slate-400">لا توجد بيانات في هذه الفترة</td></tr>}</tbody></table></div></div>
  </AdminModuleShell>
}
