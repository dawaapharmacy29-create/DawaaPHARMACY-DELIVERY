import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarRange, FileBarChart, PackageCheck, RefreshCw, Route } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatMoney, getOperationalPeriod } from '../../lib/helpers'
import CycleSelector from '../../components/CycleSelector'
import { aggregateCanonicalRiders, loadCanonicalDeliveryData, type CanonicalDeliveryData } from '../../lib/canonicalDeliveryData'
import { isDelivered, isFailed, isMultiplier, num } from '../../lib/deliveryAnalytics'

type CycleSummary = {
  orders: number
  delivered: number
  failed: number
  multiplier: number
  value: number
}

const englishNumber = (value: number) => value.toLocaleString('en-US')

export default function CycleArchiveLite() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const period = useMemo(() => getOperationalPeriod(), [])
  const selectedFrom = searchParams.get('from') || period.start
  const selectedTo = searchParams.get('to') || period.end
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CanonicalDeliveryData>({ orders: [], trips: [], riders: [], branches: [] })

  async function load(silent = false) {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const next = await loadCanonicalDeliveryData(selectedFrom, selectedTo)
      setData(next)
    } catch (loadError) {
      console.error(loadError)
      setError('تعذر تحميل بيانات الدورة كاملة. حاول التحديث مرة أخرى.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [selectedFrom, selectedTo])

  const summary = useMemo<CycleSummary>(() => {
    const delivered = data.orders.filter(isDelivered).length
    const failed = data.orders.filter(isFailed).length
    const multiplier = data.orders.filter(isMultiplier).length
    const value = data.orders.reduce((sum, order) => sum + num(order.invoice_amount || order.invoice_value), 0)
    return { orders: data.orders.length, delivered, failed, multiplier, value }
  }, [data.orders])

  const riderRows = useMemo(
    () => aggregateCanonicalRiders(data).filter(row => row.total_orders > 0).sort((a, b) => b.total_orders - a.total_orders),
    [data],
  )

  function handleCycleApply(from: string, to: string) {
    const next = new URLSearchParams(searchParams)
    next.set('from', from)
    next.set('to', to)
    setSearchParams(next)
  }

  return (
    <div className="min-h-screen bg-[#F3F7F8] p-4" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => navigate('/admin')} className="rounded-2xl bg-slate-100 p-2 text-slate-700 hover:bg-slate-200" aria-label="الرجوع إلى لوحة الإدارة">
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-2xl font-black text-[#061827]">أرشيف الدورات</h1>
                <p className="text-sm font-bold text-slate-500">بيانات الدورة الكاملة من نفس المصدر الموحد المستخدم في الداشبورد وتقارير الأداء</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black text-slate-600 disabled:opacity-50">
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> تحديث
              </button>
              <div className="rounded-2xl bg-[#EAF8F8] px-4 py-3 text-sm font-black text-[#008E92]">
                {selectedFrom} إلى {selectedTo}
              </div>
            </div>
          </div>
        </div>

        <CycleSelector from={selectedFrom} to={selectedTo} onApply={handleCycleApply} />

        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">{error}</div>}
        {loading && <div className="rounded-2xl bg-white p-3 text-center text-sm font-black text-slate-500 shadow-sm">جاري تحميل كل سجلات الدورة...</div>}

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-500"><PackageCheck size={16} /> إجمالي الأوردرات</div>
            <p className="mt-3 text-3xl font-black text-[#061827]">{englishNumber(summary.orders)}</p>
            <p className="mt-1 text-xs font-bold text-slate-400">كامل البيانات بدون حد 1000</p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-500"><FileBarChart size={16} /> تم التسليم</div>
            <p className="mt-3 text-3xl font-black text-emerald-700">{englishNumber(summary.delivered)}</p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-500"><Route size={16} /> فاشلة</div>
            <p className="mt-3 text-3xl font-black text-rose-700">{englishNumber(summary.failed)}</p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-500"><CalendarRange size={16} /> ×1.5</div>
            <p className="mt-3 text-3xl font-black text-blue-700">{englishNumber(summary.multiplier)}</p>
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#061827]">ملخص الدورة حسب المندوب</h2>
              <p className="text-xs font-bold text-slate-400">يظهر فقط المناديب النشطون الذين لديهم أوردرات خلال الفترة</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">{formatMoney(summary.value)}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3 text-right">المندوب</th>
                  <th className="p-3 text-right">الفرع</th>
                  <th className="p-3 text-center">الأوردرات</th>
                  <th className="p-3 text-center">تم التسليم</th>
                  <th className="p-3 text-center">فاشل</th>
                  <th className="p-3 text-center">×1.5</th>
                  <th className="p-3 text-center">المشاوير</th>
                  <th className="p-3 text-center">نسبة النجاح</th>
                </tr>
              </thead>
              <tbody>
                {riderRows.map(row => (
                  <tr key={row.rider_id} className="border-t hover:bg-slate-50">
                    <td className="p-3 font-black">{row.rider_name}</td>
                    <td className="p-3 text-slate-500">{row.branch_name}</td>
                    <td className="p-3 text-center font-black">{englishNumber(row.total_orders)}</td>
                    <td className="p-3 text-center text-emerald-700">{englishNumber(row.delivered_orders)}</td>
                    <td className="p-3 text-center text-rose-700">{englishNumber(row.failed_orders)}</td>
                    <td className="p-3 text-center text-blue-700">{englishNumber(row.multiplier_orders)}</td>
                    <td className="p-3 text-center">{englishNumber(row.trips)}</td>
                    <td className="p-3 text-center font-black">{row.total_orders ? `${Math.round(row.delivery_rate)}%` : '0%'}</td>
                  </tr>
                ))}
                {!riderRows.length && !loading && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-sm font-bold text-slate-400">لا توجد بيانات في هذه الفترة</td>
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
