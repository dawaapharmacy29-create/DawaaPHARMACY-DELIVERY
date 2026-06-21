import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import RiderOperatingDashboard from '../../components/rider/RiderOperatingDashboard'
import RiderQuickOrderForm from '../../components/rider/RiderQuickOrderForm'
import { supabase } from '../../lib/supabase'
import { getRiderById, getRiderSession, logout } from '../../lib/auth'
import { todayIso } from '../../lib/helpers'
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

type RiderGpsFix = {
  lat: number | null
  lng: number | null
  accuracy: number | null
}

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

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8]" dir="rtl">
      <div className="text-center">
        <img src="/logo.png" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain shadow-lg" alt="دواء" />
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent" />
        <p className="mt-3 font-bold text-slate-500">جاري تحميل وضع التشغيل...</p>
      </div>
    </div>
  )
}

export default function RiderDashboardV2() {
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

  const session = useMemo(() => getRiderSession(), [])
  const riderId = rider?.id || session.rider_id

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
        loadedRider.branch_id
          ? supabase.from('delivery_branches').select('*').eq('id', loadedRider.branch_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('delivery_attendance')
          .select('*')
          .eq('rider_id', currentRiderId)
          .gte('work_date', today)
          .lte('work_date', today)
          .order('check_in_at', { ascending: false })
          .limit(5),
        supabase
          .from('delivery_orders')
          .select('*')
          .eq('rider_id', currentRiderId)
          .gte('work_date', today)
          .lte('work_date', today)
          .order('registered_at', { ascending: false }),
        supabase
          .from('internal_trips')
          .select('*')
          .eq('rider_id', currentRiderId)
          .gte('work_date', today)
          .lte('work_date', today)
          .order('registered_at', { ascending: false }),
      ])

      if (branchRes.status === 'fulfilled' && !branchRes.value.error) setBranch(branchRes.value.data as Branch | null)

      if (attRes.status === 'fulfilled' && !attRes.value.error) {
        const rows = ((attRes.value.data ?? []) as any[]).map((row) => ({
          ...row,
          work_date: row.work_date || row.shift_date,
          check_in_at: row.check_in_at || row.check_in_time,
          check_out_at: row.check_out_at || row.check_out_time,
        })) as Attendance[]
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

  useEffect(() => {
    void loadAll()
  }, [loadAll])

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

      const { data, error } = await supabase.rpc('rider_check_in_out', {
        p_token: token,
        p_action: action,
        p_lat: gps.lat,
        p_lng: gps.lng,
        p_accuracy_m: gps.accuracy,
      })
      const result = getRpcResult<any>(data)
      if (error || !result?.success) throw new Error(error?.message || result?.message || result?.error || 'تعذر تسجيل الحضور/الانصراف')

      if (gps.accuracy && gps.accuracy > 100) {
        toast.warning(`تم التسجيل لكن دقة GPS ضعيفة (${gps.accuracy} متر)، وقد تحتاج مراجعة المدير`)
      } else {
        toast.success(action === 'check_in' ? 'تم تسجيل الحضور بنجاح' : 'تم تسجيل الانصراف بنجاح')
      }
      await loadAll(false)
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تسجيل الحضور/الانصراف')
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
        device={{
          batteryPercent: device?.batteryPercent,
          batterySupported: device?.batterySupported,
          isCharging: device?.isCharging,
          online: device?.online,
          gpsAccuracy: device?.gpsAccuracy,
          lastSyncText: 'تحديث مباشر',
        }}
        onCheckInOut={handleCheckInOut}
        onNewOrder={() => setQuickOrderOpen(true)}
        onOpenOrders={() => {
          toast.info('إدارة الأوردرات المتقدمة ما زالت في الداشبورد الحالي مؤقتًا')
          navigate('/rider')
        }}
        onNewTrip={() => {
          toast.info('تسجيل المشاوير ما زال في الداشبورد الحالي لحين نقل الفورم بأمان')
          navigate('/rider')
        }}
        onRefresh={() => void loadAll(true)}
        onLogout={() => void handleLogout()}
      >
        <section className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm" dir="rtl">
          <h2 className="text-lg font-black text-[#061827]">تشغيل تجريبي آمن</h2>
          <div className="mt-3 space-y-2 text-sm font-bold text-slate-600">
            <p>✅ الحضور والانصراف يعملان من هذه الشاشة.</p>
            <p>✅ تسجيل الأوردر السريع يعمل الآن للفواتير العادية بدون ريسيت أو ×1.5.</p>
            <p>✅ الأوردرات المتقدمة، الريسيت، المشاوير، والتعديل الكامل ما زالت في الداشبورد الحالي مؤقتًا.</p>
          </div>
        </section>
      </RiderOperatingDashboard>

      <RiderQuickOrderForm
        open={quickOrderOpen}
        rider={rider}
        branchName={branch?.name ?? rider.branch_name}
        onClose={() => setQuickOrderOpen(false)}
        onSaved={() => loadAll(false)}
      />
    </>
  )
}
