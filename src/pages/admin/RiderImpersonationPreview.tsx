import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Eye, RefreshCw, Search, Smartphone, UserCheck } from 'lucide-react'
import RiderOperatingDashboard from '../../components/rider/RiderOperatingDashboard'
import { supabase } from '../../lib/supabase'
import { formatDateTime, todayIso } from '../../lib/helpers'
import { readRiderDeviceSnapshot, type RiderDeviceSnapshot } from '../../lib/riderDeviceSnapshot'
import type { Attendance, Branch, DeliveryOrder, InternalTrip, Rider } from '../../lib/types'

function isDelivered(order: DeliveryOrder) {
  return ['delivered', 'تم التسليم'].includes(String(order.status || '').toLowerCase())
}

function isFailed(order: DeliveryOrder) {
  return ['failed', 'فشل', 'failed_delivery'].includes(String(order.status || '').toLowerCase())
}

function isOpenOrder(order: DeliveryOrder) {
  return !isDelivered(order) && !isFailed(order)
}

function customerName(order: any) {
  return order.customer_name_snapshot || order.customer_name || 'عميل غير محدد'
}

function invoiceNumber(order: any) {
  return order.invoice_number || order.invoice_no || '—'
}

export default function RiderImpersonationPreview() {
  const navigate = useNavigate()
  const [riders, setRiders] = useState<Rider[]>([])
  const [selectedRiderId, setSelectedRiderId] = useState('')
  const [rider, setRider] = useState<Rider | null>(null)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [attendance, setAttendance] = useState<Attendance | null>(null)
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [device, setDevice] = useState<RiderDeviceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const filteredRiders = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return riders
    return riders.filter((item: any) =>
      [item.name, item.display_name, item.username, item.phone, item.branch_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    )
  }, [query, riders])

  const openOrders = useMemo(() => orders.filter(isOpenOrder), [orders])

  async function loadRiders() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('delivery_riders')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      setRiders((data ?? []) as Rider[])
      if (!selectedRiderId && data?.[0]?.id) setSelectedRiderId(data[0].id)
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل المناديب')
    } finally {
      setLoading(false)
    }
  }

  async function loadSelectedRider(riderId = selectedRiderId, showToast = false) {
    if (!riderId) return
    try {
      setLoading(true)
      const today = todayIso()
      const riderRow = riders.find((item) => item.id === riderId)
      const riderPromise = riderRow
        ? Promise.resolve({ data: riderRow, error: null })
        : supabase.from('delivery_riders').select('*').eq('id', riderId).maybeSingle()

      const [riderRes, attRes, orderRes, tripRes, deviceSnapshot] = await Promise.all([
        riderPromise,
        supabase.from('delivery_attendance').select('*').eq('rider_id', riderId).gte('work_date', today).lte('work_date', today).order('check_in_at', { ascending: false }).limit(5),
        supabase.from('delivery_orders').select('*').eq('rider_id', riderId).gte('work_date', today).lte('work_date', today).order('registered_at', { ascending: false }),
        supabase.from('internal_trips').select('*').eq('rider_id', riderId).gte('work_date', today).lte('work_date', today).order('registered_at', { ascending: false }),
        readRiderDeviceSnapshot(),
      ])

      if (riderRes.error) throw riderRes.error
      const loadedRider = riderRes.data as Rider | null
      if (!loadedRider) throw new Error('لم يتم العثور على المندوب')
      setRider(loadedRider)

      if (loadedRider.branch_id) {
        const { data: branchData } = await supabase.from('delivery_branches').select('*').eq('id', loadedRider.branch_id).maybeSingle()
        setBranch((branchData ?? null) as Branch | null)
      } else {
        setBranch(null)
      }

      if (!attRes.error) {
        const rows = ((attRes.data ?? []) as any[]).map((row) => ({
          ...row,
          work_date: row.work_date || row.shift_date,
          check_in_at: row.check_in_at || row.check_in_time,
          check_out_at: row.check_out_at || row.check_out_time,
        })) as Attendance[]
        setAttendance(rows.find((row) => row.check_in_at && !row.check_out_at) || rows[0] || null)
      }
      if (!orderRes.error) setOrders((orderRes.data ?? []) as DeliveryOrder[])
      if (!tripRes.error) setTrips((tripRes.data ?? []) as InternalTrip[])
      setDevice(deviceSnapshot)
      if (showToast) toast.success('تم تحديث معاينة المندوب')
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل معاينة المندوب')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRiders()
  }, [])

  useEffect(() => {
    if (selectedRiderId) void loadSelectedRider(selectedRiderId)
  }, [selectedRiderId])

  const readOnlyToast = () => toast.info('وضع تجربة المدير للعرض والتشخيص فقط. لا يتم تسجيل عمليات باسم الدليفري من هنا.')

  return (
    <main className="min-h-screen bg-[#F3F7F8]" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-[#008E92]">لوحة المدير</p>
            <h1 className="text-xl font-black text-[#061827]">تجربة التطبيق كالدليفري</h1>
            <p className="mt-1 text-xs font-bold text-slate-500">اختار أي مندوب وشوف شاشة الدليفري الجديدة ببياناته الحقيقية بدون تنفيذ عمليات باسمه.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate('/admin')} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">رجوع للإدارة</button>
            <button onClick={() => void loadSelectedRider(selectedRiderId, true)} className="inline-flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white">
              <RefreshCw size={16} /> تحديث
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-[28px] border border-white bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
            <Search size={16} className="text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-sm font-bold outline-none" placeholder="بحث باسم المندوب أو الفرع" />
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
            {filteredRiders.map((item: any) => {
              const active = item.id === selectedRiderId
              return (
                <button key={item.id} onClick={() => setSelectedRiderId(item.id)} className={`w-full rounded-2xl border p-3 text-right transition ${active ? 'border-[#008E92] bg-[#EAF8F8]' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-slate-800">{item.name || item.display_name || 'مندوب'}</p>
                    {active ? <UserCheck size={17} className="text-[#008E92]" /> : <Smartphone size={17} className="text-slate-400" />}
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-500">{item.branch_name || 'فرع غير محدد'}</p>
                  <p className="mt-1 text-[11px] font-bold text-slate-400">{item.phone || item.username || 'بدون هاتف'}</p>
                </button>
              )
            })}
            {!loading && filteredRiders.length === 0 ? <p className="rounded-2xl bg-amber-50 p-3 text-center text-sm font-black text-amber-700">لا توجد نتائج</p> : null}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 rounded-[28px] border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            <div className="mb-1 flex items-center gap-2 font-black"><Eye size={18} /> وضع معاينة وتشخيص</div>
            هذه الشاشة تعرض شكل وتجربة الدليفري ببيانات حقيقية، لكن أزرار الحضور/الأوردر/التسليم/المشاوير لا تنفذ عمليات من حساب المدير.
          </div>

          {rider ? (
            <RiderOperatingDashboard
              rider={rider}
              branchName={branch?.name ?? rider.branch_name}
              attendance={attendance}
              orders={orders}
              trips={trips}
              saving={false}
              pendingSyncCount={0}
              device={{
                batteryPercent: device?.batteryPercent,
                batterySupported: device?.batterySupported,
                isCharging: device?.isCharging,
                online: device?.online,
                gpsAccuracy: device?.gpsAccuracy,
                lastSyncText: 'معاينة المدير',
              }}
              onCheckInOut={readOnlyToast}
              onNewOrder={readOnlyToast}
              onOpenOrders={() => document.getElementById('admin-preview-open-orders')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              onNewTrip={readOnlyToast}
              onRefresh={() => void loadSelectedRider(selectedRiderId, true)}
              onLogout={() => navigate('/admin')}
            >
              <section id="admin-preview-open-orders" className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-black text-[#061827]">الأوردرات المفتوحة في حساب المندوب</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">للمتابعة والتشخيص فقط من حساب المدير.</p>
                <div className="mt-4 space-y-2">
                  {openOrders.length === 0 ? <p className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-black text-emerald-700">لا توجد أوردرات مفتوحة ✅</p> : null}
                  {openOrders.map((order: any) => (
                    <article key={order.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <p className="font-black text-slate-800">فاتورة {invoiceNumber(order)} · {customerName(order)}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{order.customer_address_snapshot || order.customer_address || 'لا يوجد عنوان'} · {order.registered_at ? formatDateTime(order.registered_at) : 'وقت غير محدد'}</p>
                    </article>
                  ))}
                </div>
              </section>
            </RiderOperatingDashboard>
          ) : (
            <div className="rounded-[30px] bg-white p-8 text-center shadow-sm">
              <p className="font-black text-slate-500">اختار مندوب من القائمة لعرض التجربة</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
