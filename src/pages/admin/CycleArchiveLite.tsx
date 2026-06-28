import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarRange, FileBarChart, PackageCheck, Route } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'
import CycleSelector from '../../components/CycleSelector'

type CycleSummary = {
  orders: number
  delivered: number
  failed: number
  multiplier: number
  value: number
}

export default function CycleArchiveLite() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const period = useMemo(() => getOperationalPeriod(), [])
  const selectedFrom = searchParams.get('from') || period.start
  const selectedTo = searchParams.get('to') || period.end
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])

  async function load() {
    setLoading(true)
    const [ordersRes, ridersRes] = await Promise.allSettled([
      supabase.from('delivery_orders').select('*').gte('delivery_date', selectedFrom).lte('delivery_date', selectedTo).order('registered_at', { ascending: false }),
      supabase.from('riders').select('*'),
    ])
    if (ordersRes.status === 'fulfilled') setOrders((ordersRes.value.data || []) as any[])
    if (ridersRes.status === 'fulfilled') setRiders((ridersRes.value.data || []) as any[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [selectedFrom, selectedTo])

  const summary = useMemo<CycleSummary>(() => {
    const delivered = orders.filter(order => String(order.status || '').toLowerCase() === 'delivered' || Boolean(order.delivered_at)).length
    const failed = orders.filter(order => String(order.status || '').toLowerCase() === 'failed').length
    const multiplier = orders.filter(order => Number(order.order_multiplier ?? 1) >= 1.5).length
    const value = orders.reduce((sum, order) => sum + Number(order.invoice_amount || order.invoice_value || 0), 0)
    return { orders: orders.length, delivered, failed, multiplier, value }
  }, [orders])

  function handleCycleApply(from: string, to: string) {
    const next = new URLSearchParams(searchParams)
    next.set('from', from)
    next.set('to', to)
    setSearchParams(next)
  }

  return (
    <div className="min-h-screen bg-[#F3F7F8] p-4" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-4">
        {loading && <div className="rounded-2xl bg-white p-3 text-center text-sm font-black text-slate-500 shadow-sm">جاري تحميل أرشيف الدورة...</div>}
        <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => navigate('/admin')} className="rounded-2xl bg-slate-100 p-2 text-slate-700 hover:bg-slate-200">
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-2xl font-black text-[#061827]">أرشيف الدورات</h1>
                <p className="text-sm font-bold text-slate-500">عرض بيانات دورة مختارة مع إبقاء روابط المطابقة والأداء متوافقة</p>
              </div>
            </div>
            <div className="rounded-2xl bg-[#EAF8F8] px-4 py-3 text-sm font-black text-[#008E92]">
              {selectedFrom} إلى {selectedTo}
            </div>
          </div>
        </div>

        <CycleSelector from={selectedFrom} to={selectedTo} onApply={handleCycleApply} />

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-500"><PackageCheck size={16} /> إجمالي الأوردرات</div>
            <p className="mt-3 text-3xl font-black text-[#061827]">{summary.orders}</p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-500"><FileBarChart size={16} /> تم التسليم</div>
            <p className="mt-3 text-3xl font-black text-emerald-700">{summary.delivered}</p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-500"><Route size={16} /> فاشلة</div>
            <p className="mt-3 text-3xl font-black text-rose-700">{summary.failed}</p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-500"><CalendarRange size={16} /> ×1.5</div>
            <p className="mt-3 text-3xl font-black text-blue-700">{summary.multiplier}</p>
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-[#061827]">ملخص الدورة</h2>
            <div className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">{formatMoney(summary.value)}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3 text-right">المندوب</th>
                  <th className="p-3 text-center">الأوردرات</th>
                  <th className="p-3 text-center">تم التسليم</th>
                  <th className="p-3 text-center">فاشل</th>
                  <th className="p-3 text-center">×1.5</th>
                </tr>
              </thead>
              <tbody>
                {riders.map(rider => {
                  const riderOrders = orders.filter(order => order.rider_id === rider.id)
                  return (
                    <tr key={rider.id} className="border-t">
                      <td className="p-3 font-black">{rider.name || rider.username || 'غير محدد'}</td>
                      <td className="p-3 text-center">{riderOrders.length}</td>
                      <td className="p-3 text-center">{riderOrders.filter(order => String(order.status || '').toLowerCase() === 'delivered' || Boolean(order.delivered_at)).length}</td>
                      <td className="p-3 text-center">{riderOrders.filter(order => String(order.status || '').toLowerCase() === 'failed').length}</td>
                      <td className="p-3 text-center">{riderOrders.filter(order => Number(order.order_multiplier ?? 1) >= 1.5).length}</td>
                    </tr>
                  )
                })}
                {!riders.length && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-sm font-bold text-slate-400">لا توجد بيانات في هذه الفترة بعد</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
