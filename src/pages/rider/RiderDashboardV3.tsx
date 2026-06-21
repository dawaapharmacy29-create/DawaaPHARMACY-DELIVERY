import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import RiderOperatingDashboard from '../../components/rider/RiderOperatingDashboard'
import RiderQuickOrderForm from '../../components/rider/RiderQuickOrderForm'
import RiderTripForm from '../../components/rider/RiderTripForm'
import { supabase } from '../../lib/supabase'
import { getRiderById, getRiderSession, logout } from '../../lib/auth'
import { formatDateTime, todayIso } from '../../lib/helpers'
import { offlineQueueCount } from '../../lib/offlineQueue'
import { readRiderDeviceSnapshot, type RiderDeviceSnapshot } from '../../lib/riderDeviceSnapshot'
import type { Attendance, Branch, DeliveryOrder, InternalTrip, Rider } from '../../lib/types'

function getStoredRiderToken(): string | null {
  try {
    const raw = localStorage.getItem('dawaa_rider_session')
    if (raw) return JSON.parse(raw)?.session_token || null
  } catch {}
  return localStorage.getItem('rider_session_token')
}

function getRpcResult<T = any>(data: any): T | null {
  return (Array.isArray(data) ? data[0] : data) as T | null
}

type RiderGpsFix = { lat: number | null; lng: number | null; accuracy: number | null }

function requestRiderGps(): Promise<RiderGpsFix> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ lat: null, lng: null, accuracy: null })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
      }),
      () => resolve({ lat: null, lng: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  })
}

function isDelivered(order: DeliveryOrder) {
  return ['delivered', 'تم التسليم'].includes(String(order.status || '').toLowerCase())
}
function isFailed(order: DeliveryOrder) {
  return ['failed', 'فشل', 'failed_delivery'].includes(String(order.status || '').toLowerCase())
}
function isOpenOrder(order: DeliveryOrder) {
  return !isDelivered(order) && !isFailed(order)
}
function minutesSince(value?: string | null) {
  if (!value) return 0
  const diff = Date.now() - new Date(value).getTime()
  return Math.max(0, Math.round(diff / 60000))
}
function customerPhone(order: any) {
  return String(order.customer_phone_snapshot || order.customer_phone || '').trim()
}
function normalizedWhatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('2') ? digits : `2${digits}`
}
function tripLabel(trip: any) {
  return `${trip.from_label || '—'} ← ${trip.to_label || '—'}`
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8]" dir="rtl">
      <div className="text-center">
        <img src="/logo.png" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain shadow-lg" alt="دواء" />
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent" />
        <p className="mt-3 font-bold text-slate-500">جاري تحميل وضع التشغيل الكامل...</p>
      </div>
    </div>
  )
}

export default function RiderDashboardV3() {
  const navigate = useNavigate()
  const [rider, setRider] = useState<Rider | null>(null)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [attendance, setAttendance] = useState<Attendance | null>(null)
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [device, setDevice] = useState<RiderDeviceSnapshot | null>(null)
  const [pendingSyncCount, setPendingSyncCount] = useState(offlineQueueCount())
  const [quickOrderOpen, setQuickOrderOpen] = useState(false)
  const [tripOpen, setTripOpen] = useState(false)
  const [failOrder, setFailOrder] = useState<DeliveryOrder | null>(null)
  const [failReason, setFailReason] = useState('')

  const session = useMemo(() => getRiderSession(), [])
  const riderId = rider?.id || session.rider_id
  const openOrders = useMemo(() => orders.filter(isOpenOrder), [orders])
  const shiftOpen = Boolean(attendance?.check_in_at && !attendance?.check_out_at)

  const refreshDevice = useCallback(async (gpsAccuracy?: number | null) => {
    const snapshot = await readRiderDeviceSnapshot(gpsAccuracy)
    setDevice(snapshot)
    return snapshot
  }, [])

  const loadAll = useCallback(async (showToast = false) => {
    const currentRiderId = getRiderSession().rider_id
    if (!currentRiderId) {
      navigate('/rider-login', { replace: true })
      return
    }
    try {
      setLoading(true)
      const loadedRider = await getRiderById(currentRiderId)
      if (!loadedRider) throw new Error('لم يتم العثور على حساب الدليفري')
      setRider(loadedRider)
      const today = todayIso()
      const [branchRes, attRes, orderRes, tripRes] = await Promise.allSettled([
        loadedRider.branch_id ? supabase.from('delivery_branches').select('*').eq('id', loadedRider.branch_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        supabase.from('delivery_attendance').select('*').eq('rider_id', currentRiderId).gte('work_date', today).lte('work_date', today).order('check_in_at', { ascending: false }).limit(5),
        supabase.from('delivery_orders').select('*').eq('rider_id', currentRiderId).gte('work_date', today).lte('work_date', today).order('registered_at', { ascending: false }),
        supabase.from('internal_trips').select('*').eq('rider_id', currentRiderId).gte('work_date', today).lte('work_date', today).order('registered_at', { ascending: false }),
      ])
      if (branchRes.status === 'fulfilled' && !branchRes.value.error) setBranch(branchRes.value.data as Branch | null)
      if (attRes.status === 'fulfilled' && !attRes.value.error) {
        const rows = ((attRes.value.data ?? []) as any[]).map((row) => ({ ...row, work_date: row.work_date || row.shift_date, check_in_at: row.check_in_at || row.check_in_time, check_out_at: row.check_out_at || row.check_out_time })) as Attendance[]
        setAttendance(rows.find((row) => row.check_in_at && !row.check_out_at) || rows[0] || null)
      }
      if (orderRes.status === 'fulfilled' && !orderRes.value.error) setOrders((orderRes.value.data ?? []) as DeliveryOrder[])
      if (tripRes.status === 'fulfilled' && !tripRes.value.error) setTrips((tripRes.value.data ?? []) as InternalTrip[])
      await refreshDevice()
      setPendingSyncCount(offlineQueueCount())
      if (showToast) toast.success('تم تحديث وضع التشغيل')
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل وضع التشغيل')
    } finally {
      setLoading(false)
    }
  }, [navigate, refreshDevice])

  useEffect(() => { void loadAll() }, [loadAll])
  useEffect(() => {
    const timer = window.setInterval(() => {
      setPendingSyncCount(offlineQueueCount())
      void refreshDevice()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [refreshDevice])

  async function handleCheckInOut() {
    if (!riderId) return
    try {
      setSaving(true)
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة. سجل دخول مرة أخرى من تطبيق الدليفري.')
      const action = attendance?.check_in_at && !attendance?.check_out_at ? 'check_out' : 'check_in'
      const gps = await requestRiderGps()
      await refreshDevice(gps.accuracy)
      const { data, error } = await supabase.rpc('rider_check_in_out', { p_token: token, p_action: action, p_lat: gps.lat, p_lng: gps.lng, p_accuracy_m: gps.accuracy })
      const result = getRpcResult<any>(data)
      if (error || !result?.success) throw new Error(error?.message || result?.message || result?.error || 'تعذر تسجيل الحضور/الانصراف')
      if (gps.accuracy && gps.accuracy > 100) toast.warning(`تم التسجيل لكن دقة GPS ضعيفة (${gps.accuracy} متر)`) 
      else toast.success(action === 'check_in' ? 'تم تسجيل الحضور بنجاح' : 'تم تسجيل الانصراف بنجاح')
      await loadAll(false)
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تسجيل الحضور/الانصراف')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelivered(order: DeliveryOrder) {
    try {
      setSaving(true)
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة')
      const gps = await requestRiderGps()
      const snapshot = await refreshDevice(gps.accuracy)
      const { data, error } = await supabase.rpc('rider_mark_order_delivered', { p_token: token, p_order_id: String(order.id) })
      const result = getRpcResult<any>(data)
      if (error || !result?.success) throw new Error(error?.message || result?.message || 'تعذر تأكيد التسليم')
      toast.success(result.message || 'تم تأكيد التسليم بنجاح')
      if (gps.accuracy && gps.accuracy > 100) toast.warning(`تم التسليم بدقة GPS ضعيفة (${gps.accuracy} متر)`)
      if (snapshot.batteryPercent !== null && snapshot.batteryPercent <= 15 && !snapshot.isCharging) toast.warning('البطارية منخفضة جدًا، برجاء توصيل الشاحن')
      await loadAll(false)
    } catch (error: any) {
      toast.error(error?.message || 'فشل تأكيد التسليم')
    } finally {
      setSaving(false)
    }
  }

  async function handleFailed() {
    if (!failOrder) return
    if (failReason.trim().length < 3) {
      toast.error('اكتب سبب فشل التسليم')
      return
    }
    try {
      setSaving(true)
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة')
      const gps = await requestRiderGps()
      await refreshDevice(gps.accuracy)
      const reason = `${failReason.trim()}\nGPS accuracy: ${gps.accuracy ?? 'unknown'}m`
      const { data, error } = await supabase.rpc('rider_mark_order_failed', { p_token: token, p_order_id: String(failOrder.id), p_reason: reason })
      const result = getRpcResult<any>(data)
      if (error || !result?.success) throw new Error(error?.message || result?.message || 'تعذر تسجيل فشل التسليم')
      toast.success(result.message || 'تم تسجيل فشل التسليم للمراجعة')
      setFailOrder(null)
      setFailReason('')
      await loadAll(false)
    } catch (error: any) {
      toast.error(error?.message || 'فشل تحديث الأوردر')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/rider-login', { replace: true })
  }

  if (loading && !rider) return <LoadingScreen />
  if (!rider) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8] p-4" dir="rtl">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
          <img src="/logo.png" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain" alt="دواء" />
          <p className="text-xl font-black text-red-700">جلسة الدخول غير مكتملة</p>
          <p className="mt-2 text-slate-500">سجل دخول مرة أخرى من تطبيق الدليفري.</p>
          <button onClick={() => navigate('/rider-login', { replace: true })} className="mt-6 w-full rounded-2xl bg-[#008E92] py-3 font-black text-white">تسجيل الدخول</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <RiderOperatingDashboard
        rider={rider}
        branchName={branch?.name ?? rider.branch_name}
        attendance={attendance}
        orders={orders}
        trips={trips}
        saving={saving}
        pendingSyncCount={pendingSyncCount}
        device={{ batteryPercent: device?.batteryPercent, batterySupported: device?.batterySupported, isCharging: device?.isCharging, online: device?.online, gpsAccuracy: device?.gpsAccuracy, lastSyncText: 'تحديث مباشر' }}
        onCheckInOut={handleCheckInOut}
        onNewOrder={() => setQuickOrderOpen(true)}
        onOpenOrders={() => document.getElementById('rider-v3-open-orders')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        onNewTrip={() => setTripOpen(true)}
        onRefresh={() => void loadAll(true)}
        onLogout={() => void handleLogout()}
      >
        <section id="rider-v3-open-orders" className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm" dir="rtl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#008E92]">متابعة التسليم</p>
              <h2 className="text-lg font-black text-[#061827]">الأوردرات المفتوحة</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">تأكيد التسليم أو تسجيل الفشل من نفس الشاشة.</p>
            </div>
            <button type="button" onClick={() => void loadAll(true)} className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-600">تحديث</button>
          </div>
          {openOrders.length === 0 ? (
            <p className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-black text-emerald-700">لا توجد أوردرات مفتوحة الآن ✅</p>
          ) : (
            <div className="space-y-3">
              {openOrders.map((order: any) => {
                const phone = customerPhone(order)
                const waPhone = normalizedWhatsappPhone(phone)
                const invoice = order.invoice_number || order.invoice_no || '—'
                const customer = order.customer_name_snapshot || order.customer_name || 'عميل غير محدد'
                const address = order.customer_address_snapshot || order.customer_address || 'لا يوجد عنوان واضح'
                const registered = order.registered_at || order.created_at || order.prepared_at
                const age = minutesSince(registered)
                return (
                  <article key={order.id} className={`rounded-3xl border p-4 shadow-sm ${age >= 90 ? 'border-rose-200 bg-rose-50' : age >= 45 ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-base font-black text-[#061827]">فاتورة {invoice}</p>
                        <p className="mt-1 text-sm font-bold text-slate-700">{customer}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{address}</p>
                        <p className="mt-2 text-[11px] font-black text-slate-400">منذ {age} دقيقة · {registered ? formatDateTime(registered) : 'وقت غير محدد'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {phone ? <a href={`tel:${phone}`} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-sky-700 shadow-sm">اتصال</a> : null}
                        {waPhone ? <button type="button" onClick={() => window.open(`https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(`أهلاً ${customer}، طلبك من صيدلية دواء في الطريق إليك الآن. رقم الفاتورة: ${invoice}`)}`, '_blank', 'noopener,noreferrer')} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">واتساب</button> : null}
                        <button type="button" disabled={saving} onClick={() => void handleDelivered(order)} className="rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white disabled:opacity-50">تم التسليم</button>
                        <button type="button" disabled={saving} onClick={() => { setFailOrder(order); setFailReason('') }} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">فشل</button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm" dir="rtl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#008E92]">مشاوير اليوم</p>
              <h2 className="text-lg font-black text-[#061827]">آخر المشاوير</h2>
            </div>
            <button type="button" onClick={() => setTripOpen(true)} className="rounded-2xl bg-[#008E92] px-4 py-2 text-xs font-black text-white">مشوار جديد</button>
          </div>
          {trips.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">لا توجد مشاوير مسجلة اليوم</p> : (
            <div className="space-y-2">
              {trips.slice(0, 6).map((trip: any) => (
                <div key={trip.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-black text-slate-800">{tripLabel(trip)}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{trip.reason || trip.notes || 'بدون سبب'} · {trip.status || 'pending'}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm" dir="rtl">
          <h2 className="text-lg font-black text-[#061827]">تشغيل النسخة الجديدة الكامل</h2>
          <div className="mt-3 space-y-2 text-sm font-bold text-slate-600">
            <p>✅ الحضور والانصراف من نفس الشاشة.</p>
            <p>✅ تسجيل الأوردر السريع للفواتير العادية.</p>
            <p>✅ تأكيد التسليم وفشل التسليم للأوردرات المفتوحة.</p>
            <p>✅ تسجيل المشاوير داخل النسخة الجديدة مع دعم Offline.</p>
            <p>⏳ المرحلة التالية: الريسيت، ×1.5، منع التكرار المتقدم، وتعديل الأوردر.</p>
          </div>
        </section>
      </RiderOperatingDashboard>

      <RiderQuickOrderForm open={quickOrderOpen} rider={rider} branchName={branch?.name ?? rider.branch_name} onClose={() => setQuickOrderOpen(false)} onSaved={() => loadAll(false)} />
      <RiderTripForm open={tripOpen} rider={rider} branch={branch} shiftOpen={shiftOpen} attendanceId={attendance?.id || null} onClose={() => setTripOpen(false)} onSaved={() => loadAll(false)} />

      {failOrder ? (
        <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm" dir="rtl">
          <div className="mx-auto flex h-full max-w-[520px] items-end sm:items-center">
            <section className="w-full rounded-[32px] bg-white p-4 shadow-2xl">
              <h2 className="text-xl font-black text-[#061827]">تسجيل فشل التسليم</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">فاتورة {(failOrder as any).invoice_number || (failOrder as any).invoice_no || '—'}</p>
              <textarea value={failReason} onChange={(e) => setFailReason(e.target.value)} rows={4} className="dawaa-input mt-4 resize-none text-right" placeholder="سبب الفشل: العميل لا يرد، العنوان غير واضح، رفض الاستلام..." />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setFailOrder(null); setFailReason('') }} className="rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-600">إلغاء</button>
                <button type="button" disabled={saving} onClick={() => void handleFailed()} className="rounded-2xl bg-rose-600 py-3 text-sm font-black text-white disabled:opacity-50">حفظ الفشل</button>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </>
  )
}
