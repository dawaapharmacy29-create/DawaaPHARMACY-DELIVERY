import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import RiderOperatingDashboard, { type RiderCycleSummary } from '../../components/rider/RiderOperatingDashboard'
import RiderQuickOrderForm from '../../components/rider/RiderQuickOrderForm'
import RiderTripForm from '../../components/rider/RiderTripForm'
import { supabase } from '../../lib/supabase'
import { getRiderSession, logout } from '../../lib/auth'
import { formatDateTime } from '../../lib/helpers'
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
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ lat: null, lng: null, accuracy: null })
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null }),
      () => resolve({ lat: null, lng: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
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
function isSettled(order: any) {
  return Boolean(order.settlement_batch_id || order.settlement_submitted_at || order.settlement_status)
}
function orderCustomerName(order: any) {
  return String(order.customer_name_snapshot || order.customer_name || order.customer_code_snapshot || order.customer_code || 'عميل غير محدد').trim()
}
function orderInvoice(order: any) {
  return String(order.invoice_number || order.invoice_no || '—').trim()
}
function orderAmount(order: any) {
  return Number(order.invoice_amount ?? order.invoice_value ?? 0)
}
function customerPhone(order: any) {
  return String(order.customer_phone_snapshot || order.customer_phone || '').trim()
}
function normalizedWhatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('2') ? digits : `2${digits}`
}
function minutesSince(value?: string | null) {
  if (!value) return 0
  return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
}
function tripLabel(trip: any) {
  return `${trip.from_label || '—'} ← ${trip.to_label || '—'}`
}
function normalizeAttendance(row: any): Attendance | null {
  if (!row) return null
  return { ...row, work_date: row.work_date || row.shift_date, check_in_at: row.check_in_at || row.check_in_time, check_out_at: row.check_out_at || row.check_out_time } as Attendance
}
function LoadingScreen() {
  return <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8]" dir="rtl"><div className="text-center"><img src="/logo.png" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain shadow-lg" alt="دواء" /><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent" /><p className="mt-3 font-bold text-slate-500">جاري فتح وضع التشغيل...</p></div></div>
}

type EditDraft = {
  invoice_number: string
  customer_name: string
  customer_code: string
  customer_phone: string
  customer_address: string
  invoice_amount: string
  notes: string
}

export default function RiderDashboardV3() {
  const navigate = useNavigate()
  const [rider, setRider] = useState<Rider | null>(null)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [attendance, setAttendance] = useState<Attendance | null>(null)
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [cycleSummary, setCycleSummary] = useState<RiderCycleSummary>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [device, setDevice] = useState<RiderDeviceSnapshot | null>(null)
  const [pendingSyncCount, setPendingSyncCount] = useState(offlineQueueCount())
  const [quickOrderOpen, setQuickOrderOpen] = useState(false)
  const [tripOpen, setTripOpen] = useState(false)
  const [failOrder, setFailOrder] = useState<DeliveryOrder | null>(null)
  const [failReason, setFailReason] = useState('')
  const [editOrder, setEditOrder] = useState<DeliveryOrder | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [editReason, setEditReason] = useState('')
  const [settlementOpen, setSettlementOpen] = useState(false)
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [doctorName, setDoctorName] = useState('')
  const [settlementNotes, setSettlementNotes] = useState('')

  const session = useMemo(() => getRiderSession(), [])
  const riderId = rider?.id || session.rider_id
  const openOrders = useMemo(() => orders.filter(isOpenOrder), [orders])
  const deliveredUnsettled = useMemo(() => orders.filter((order) => isDelivered(order) && !isSettled(order)), [orders])
  const selectedSettlementOrders = useMemo(() => deliveredUnsettled.filter((order: any) => selectedOrderIds.includes(String(order.id))), [deliveredUnsettled, selectedOrderIds])
  const selectedSettlementTotal = useMemo(() => selectedSettlementOrders.reduce((sum, order) => sum + orderAmount(order), 0), [selectedSettlementOrders])
  const shiftOpen = Boolean((attendance as any)?.check_in_at && !(attendance as any)?.check_out_at)

  const refreshDevice = useCallback(async () => {
    const snapshot = await readRiderDeviceSnapshot()
    setDevice(snapshot)
    return snapshot
  }, [])
  const applyFastPayload = useCallback((result: any) => {
    if (!result?.success) return false
    if (result.rider) setRider(result.rider as Rider)
    setBranch((result.branch || null) as Branch | null)
    setAttendance(normalizeAttendance(result.attendance))
    setOrders((Array.isArray(result.orders) ? result.orders : []) as DeliveryOrder[])
    setTrips((Array.isArray(result.trips) ? result.trips : []) as InternalTrip[])
    setCycleSummary((result.cycle_summary || {}) as RiderCycleSummary)
    setPendingSyncCount(offlineQueueCount())
    return true
  }, [])
  const loadDashboard = useCallback(async (showToast = false, initial = false) => {
    const token = getStoredRiderToken()
    if (!token) return navigate('/rider-login', { replace: true })
    try {
      if (initial) setLoading(true)
      const { data, error } = await supabase.rpc('rider_get_operating_dashboard_fast', { p_token: token })
      const result = getRpcResult<any>(data)
      if (error || !result?.success) {
        if (['expired_session', 'invalid_token', 'inactive_account', 'rider_inactive'].includes(String(result?.error || ''))) return navigate('/rider-login', { replace: true })
        throw new Error(error?.message || result?.message || result?.error || 'تعذر تحميل وضع التشغيل')
      }
      applyFastPayload(result)
      void refreshDevice()
      if (showToast) toast.success('تم تحديث وضع التشغيل')
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل وضع التشغيل')
    } finally {
      if (initial) setLoading(false)
    }
  }, [applyFastPayload, navigate, refreshDevice])

  useEffect(() => { void loadDashboard(false, true) }, [loadDashboard])
  useEffect(() => {
    const timer = window.setInterval(() => { setPendingSyncCount(offlineQueueCount()); void refreshDevice() }, 60_000)
    return () => window.clearInterval(timer)
  }, [refreshDevice])

  async function handleCheckInOut() {
    if (!riderId) return
    try {
      setSaving(true)
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة. سجل دخول مرة أخرى من تطبيق الدليفري.')
      const action = shiftOpen ? 'check_out' : 'check_in'
      const [gps] = await Promise.all([requestRiderGps(), refreshDevice()])
      const { data, error } = await supabase.rpc('rider_check_in_out', { p_token: token, p_action: action, p_lat: gps.lat, p_lng: gps.lng, p_accuracy_m: gps.accuracy })
      const result = getRpcResult<any>(data)
      if (error || !result?.success) throw new Error(error?.message || result?.message || result?.error || 'تعذر تسجيل الحضور/الانصراف')
      toast.success(action === 'check_in' ? 'تم تسجيل الحضور بنجاح' : 'تم تسجيل الانصراف بنجاح')
      void loadDashboard(false, false)
    } catch (error: any) { toast.error(error?.message || 'تعذر تسجيل الحضور/الانصراف') } finally { setSaving(false) }
  }
  async function handleDelivered(order: DeliveryOrder) {
    try {
      setSaving(true)
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة')
      const [gps, snapshot] = await Promise.all([requestRiderGps(), refreshDevice()])
      const orderId = String((order as any).id)
      const { data, error } = await supabase.rpc('rider_mark_order_delivered', { p_token: token, p_order_id: orderId })
      const result = getRpcResult<any>(data)
      if (error || !result?.success) throw new Error(error?.message || result?.message || 'تعذر تأكيد التسليم')
      setOrders((prev) => prev.map((item: any) => String(item.id) === orderId ? ({ ...item, status: 'delivered', delivered_at: new Date().toISOString() } as DeliveryOrder) : item))
      toast.success(result.message || 'تم تأكيد التسليم بنجاح')
      if (gps.accuracy && gps.accuracy > 100) toast.warning(`تم التسليم بدقة GPS ضعيفة (${gps.accuracy} متر)`)
      if (snapshot.batteryPercent !== null && snapshot.batteryPercent <= 15 && !snapshot.isCharging) toast.warning('البطارية منخفضة جدًا، برجاء توصيل الشاحن')
      void loadDashboard(false, false)
    } catch (error: any) { toast.error(error?.message || 'فشل تأكيد التسليم') } finally { setSaving(false) }
  }
  async function handleFailed() {
    if (!failOrder || failReason.trim().length < 3) return toast.error('اكتب سبب فشل التسليم')
    try {
      setSaving(true)
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة')
      const [gps] = await Promise.all([requestRiderGps(), refreshDevice()])
      const orderId = String((failOrder as any).id)
      const { data, error } = await supabase.rpc('rider_mark_order_failed', { p_token: token, p_order_id: orderId, p_reason: `${failReason.trim()}\nGPS accuracy: ${gps.accuracy ?? 'unknown'}m` })
      const result = getRpcResult<any>(data)
      if (error || !result?.success) throw new Error(error?.message || result?.message || 'تعذر تسجيل فشل التسليم')
      setOrders((prev) => prev.map((item: any) => String(item.id) === orderId ? ({ ...item, status: 'failed', failure_reason: failReason.trim() } as DeliveryOrder) : item))
      toast.success(result.message || 'تم تسجيل فشل التسليم للمراجعة')
      setFailOrder(null); setFailReason(''); void loadDashboard(false, false)
    } catch (error: any) { toast.error(error?.message || 'فشل تحديث الأوردر') } finally { setSaving(false) }
  }
  function openEditOrder(order: DeliveryOrder) {
    if (!isOpenOrder(order)) return toast.error('التعديل متاح قبل التسليم أو الفشل فقط')
    const row: any = order
    setEditOrder(order)
    setEditDraft({
      invoice_number: orderInvoice(row) === '—' ? '' : orderInvoice(row),
      customer_name: orderCustomerName(row) === 'عميل غير محدد' ? '' : orderCustomerName(row),
      customer_code: String(row.customer_code_snapshot || row.customer_code || ''),
      customer_phone: customerPhone(row),
      customer_address: String(row.customer_address_snapshot || row.customer_address || ''),
      invoice_amount: String(orderAmount(row) || ''),
      notes: String(row.notes || ''),
    })
    setEditReason('')
  }
  async function handleSaveEditOrder() {
    if (!editOrder || !editDraft) return
    if (!editDraft.invoice_number.trim()) return toast.error('رقم الفاتورة مطلوب')
    if (editReason.trim().length < 5) return toast.error('اكتب سبب واضح للتعديل')
    try {
      setSaving(true)
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة')
      const patch = {
        invoice_number: editDraft.invoice_number.trim(),
        invoice_no: editDraft.invoice_number.trim(),
        customer_name: editDraft.customer_name.trim(),
        customer_name_snapshot: editDraft.customer_name.trim(),
        customer_code: editDraft.customer_code.trim(),
        customer_code_snapshot: editDraft.customer_code.trim(),
        customer_phone: editDraft.customer_phone.trim(),
        customer_phone_snapshot: editDraft.customer_phone.trim(),
        customer_address: editDraft.customer_address.trim(),
        customer_address_snapshot: editDraft.customer_address.trim(),
        invoice_amount: Number(editDraft.invoice_amount || 0),
        invoice_value: Number(editDraft.invoice_amount || 0),
        notes: editDraft.notes.trim() || null,
      }
      const { data, error } = await supabase.rpc('rider_update_order_before_delivery', { p_token: token, p_order_id: String((editOrder as any).id), p_patch: patch, p_edit_reason: editReason.trim() })
      const result = getRpcResult<any>(data)
      if (error || !result?.success) throw new Error(error?.message || result?.message || 'تعذر تعديل الأوردر')
      const updated = result.order as DeliveryOrder
      setOrders((prev) => prev.map((item: any) => String(item.id) === String((editOrder as any).id) ? updated : item))
      toast.success('تم تعديل الأوردر وتسجيل سبب التعديل')
      setEditOrder(null); setEditDraft(null); setEditReason('')
      void loadDashboard(false, false)
    } catch (error: any) { toast.error(error?.message || 'تعذر تعديل الأوردر') } finally { setSaving(false) }
  }
  function toggleSettlementOrder(orderId: string) {
    setSelectedOrderIds((prev) => prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId])
  }
  async function handleCreateSettlement() {
    if (!selectedOrderIds.length) return toast.error('اختار أوردر واحد على الأقل')
    if (doctorName.trim().length < 2) return toast.error('اكتب اسم الدكتور المستلم')
    try {
      setSaving(true)
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة')
      const { data, error } = await supabase.rpc('rider_create_order_settlement_batch', {
        p_token: token,
        p_order_ids: selectedOrderIds,
        p_doctor_name: doctorName.trim(),
        p_notes: settlementNotes.trim() || null,
      })
      const result = getRpcResult<any>(data)
      if (error || !result?.success) throw new Error(error?.message || result?.message || 'تعذر تسجيل المحاسبة')
      toast.success(`تم تسجيل محاسبة ${result.orders_count || selectedOrderIds.length} أوردر بقيمة ${Number(result.total_amount || selectedSettlementTotal).toFixed(2)} جنيه`)
      setSettlementOpen(false); setSelectedOrderIds([]); setDoctorName(''); setSettlementNotes('')
      void loadDashboard(false, false)
    } catch (error: any) { toast.error(error?.message || 'تعذر تسجيل محاسبة الأوردرات') } finally { setSaving(false) }
  }
  async function handleLogout() { await logout(); navigate('/rider-login', { replace: true }) }

  if (loading && !rider) return <LoadingScreen />
  if (!rider) return <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8] p-4" dir="rtl"><div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl"><img src="/logo.png" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain" alt="دواء" /><p className="text-xl font-black text-red-700">جلسة الدخول غير مكتملة</p><button onClick={() => navigate('/rider-login', { replace: true })} className="mt-6 w-full rounded-2xl bg-[#008E92] py-3 font-black text-white">تسجيل الدخول</button></div></div>

  return <>
    <RiderOperatingDashboard
      rider={rider}
      branchName={branch?.name ?? rider.branch_name}
      attendance={attendance}
      orders={orders}
      trips={trips}
      cycleSummary={cycleSummary}
      saving={saving}
      pendingSyncCount={pendingSyncCount}
      device={{ batteryPercent: device?.batteryPercent, batterySupported: device?.batterySupported, isCharging: device?.isCharging, online: device?.online, gpsAccuracy: device?.gpsAccuracy, lastSyncText: 'تحديث مباشر' }}
      onCheckInOut={handleCheckInOut}
      onNewOrder={() => setQuickOrderOpen(true)}
      onOpenOrders={() => document.getElementById('rider-v3-open-orders')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      onNewTrip={() => setTripOpen(true)}
      onRefresh={() => void loadDashboard(true, false)}
      onLogout={() => void handleLogout()}
    >
      <section className="grid gap-3 sm:grid-cols-2" dir="rtl">
        <button type="button" onClick={() => setSettlementOpen(true)} className="rounded-[26px] bg-gradient-to-l from-[#008E92] to-[#006A70] p-4 text-right text-white shadow-lg"><p className="text-xs font-black text-teal-100">محاسبة الدكتور</p><p className="mt-1 text-xl font-black">تجميع الأوردرات المسلمة</p><p className="mt-1 text-xs font-bold text-teal-50">{deliveredUnsettled.length} أوردر جاهز للمحاسبة</p></button>
        <button type="button" onClick={() => document.getElementById('rider-v3-open-orders')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-[26px] border border-slate-100 bg-white p-4 text-right shadow-sm"><p className="text-xs font-black text-[#008E92]">التشغيل الحالي</p><p className="mt-1 text-xl font-black text-[#061827]">الأوردرات المفتوحة</p><p className="mt-1 text-xs font-bold text-slate-500">{openOrders.length} أوردر يحتاج متابعة</p></button>
      </section>

      <section id="rider-v3-open-orders" className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm" dir="rtl">
        <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-black text-[#008E92]">متابعة التسليم</p><h2 className="text-lg font-black text-[#061827]">الأوردرات المفتوحة</h2><p className="mt-1 text-xs font-bold text-slate-500">الاسم ورقم الفاتورة ظاهرين دائمًا، والتعديل متاح قبل التسليم.</p></div><button type="button" onClick={() => void loadDashboard(true, false)} className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-600">تحديث</button></div>
        {openOrders.length === 0 ? <p className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-black text-emerald-700">لا توجد أوردرات مفتوحة الآن ✅</p> : <div className="space-y-3">{openOrders.map((order: any) => {
          const phone = customerPhone(order); const waPhone = normalizedWhatsappPhone(phone); const invoice = orderInvoice(order); const customer = orderCustomerName(order); const address = order.customer_address_snapshot || order.customer_address || 'لا يوجد عنوان واضح'; const registered = order.registered_at || order.created_at || order.prepared_at; const age = minutesSince(registered)
          return <article key={order.id} className={`rounded-3xl border p-4 shadow-sm ${age >= 90 ? 'border-rose-200 bg-rose-50' : age >= 45 ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-base font-black text-[#061827]">فاتورة {invoice}</p><p className="mt-1 text-sm font-black text-slate-800">{customer}</p><p className="mt-1 text-xs font-bold text-slate-500">{address}</p><p className="mt-2 text-[11px] font-black text-slate-400">منذ {age} دقيقة · {registered ? formatDateTime(registered) : 'وقت غير محدد'}</p></div><div className="flex flex-wrap gap-2 sm:justify-end">{phone ? <a href={`tel:${phone}`} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-sky-700 shadow-sm">اتصال</a> : null}{waPhone ? <button type="button" onClick={() => window.open(`https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(`أهلاً بحضرتك يا فندم\nمع حضرتك مندوب صيدليات دواء\n\nقيمة الفاتورة الخاصة بحضرتك: ${orderAmount(order) || 'غير محددة'} جنيه\n\nنتشرف بخدمة حضرتك دائمًا`)}`, '_blank', 'noopener,noreferrer')} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">واتساب</button> : null}<button type="button" disabled={saving} onClick={() => openEditOrder(order)} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-teal-700 shadow-sm">تعديل</button><button type="button" disabled={saving} onClick={() => void handleDelivered(order)} className="rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white disabled:opacity-50">تم التسليم</button><button type="button" disabled={saving} onClick={() => { setFailOrder(order); setFailReason('') }} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">فشل</button></div></div></article>
        })}</div>}
      </section>

      <section className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm" dir="rtl"><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-black text-[#008E92]">مشاوير اليوم</p><h2 className="text-lg font-black text-[#061827]">آخر المشاوير</h2></div><button type="button" onClick={() => setTripOpen(true)} className="rounded-2xl bg-[#008E92] px-4 py-2 text-xs font-black text-white">مشوار جديد</button></div>{trips.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">لا توجد مشاوير مسجلة اليوم</p> : <div className="space-y-2">{trips.slice(0, 6).map((trip: any) => <div key={trip.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-sm font-black text-slate-800">{tripLabel(trip)}</p><p className="mt-1 text-xs font-bold text-slate-500">{trip.reason || trip.notes || 'بدون سبب'} · {trip.status || 'pending'}</p></div>)}</div>}</section>
    </RiderOperatingDashboard>

    <RiderQuickOrderForm open={quickOrderOpen} rider={rider} branchName={branch?.name ?? rider.branch_name} onClose={() => setQuickOrderOpen(false)} onSaved={() => void loadDashboard(false, false)} />
    <RiderTripForm open={tripOpen} rider={rider} branch={branch} shiftOpen={shiftOpen} attendanceId={(attendance as any)?.id || null} onClose={() => setTripOpen(false)} onSaved={(trip) => { if (trip) setTrips((prev) => [trip, ...prev.filter((item: any) => String(item.id) !== String((trip as any).id))]); setPendingSyncCount(offlineQueueCount()); void loadDashboard(false, false) }} />

    {settlementOpen ? <div className="fixed inset-0 z-50 bg-slate-950/50 p-3 backdrop-blur-sm" dir="rtl"><div className="mx-auto flex h-full max-w-[620px] items-end sm:items-center"><section className="max-h-[92vh] w-full overflow-y-auto rounded-[32px] bg-white p-4 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-[#061827]">محاسبة عدة أوردرات</h2><p className="mt-1 text-xs font-bold text-slate-500">اختار كل الأوردرات التي ستتم محاسبتها مع الدكتور مرة واحدة.</p></div><button onClick={() => setSettlementOpen(false)} className="rounded-xl bg-slate-100 px-3 py-2 font-black">✕</button></div><div className="mt-4 grid grid-cols-2 gap-2"><input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} className="dawaa-input text-right" placeholder="اسم الدكتور المستلم *" /><input value={settlementNotes} onChange={(e) => setSettlementNotes(e.target.value)} className="dawaa-input text-right" placeholder="ملاحظة اختيارية" /></div><div className="mt-3 flex items-center justify-between rounded-2xl bg-teal-50 p-3"><button type="button" onClick={() => setSelectedOrderIds(selectedOrderIds.length === deliveredUnsettled.length ? [] : deliveredUnsettled.map((order: any) => String(order.id)))} className="text-xs font-black text-[#008E92]">{selectedOrderIds.length === deliveredUnsettled.length && deliveredUnsettled.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</button><p className="text-sm font-black text-slate-800">المحدد: {selectedOrderIds.length} · الإجمالي: {selectedSettlementTotal.toFixed(2)} ج</p></div><div className="mt-3 space-y-2">{deliveredUnsettled.length === 0 ? <p className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-black text-emerald-700">لا توجد أوردرات مسلمة تنتظر المحاسبة</p> : deliveredUnsettled.map((order: any) => { const id = String(order.id); const checked = selectedOrderIds.includes(id); return <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${checked ? 'border-teal-400 bg-teal-50' : 'border-slate-100 bg-slate-50'}`}><input type="checkbox" checked={checked} onChange={() => toggleSettlementOrder(id)} className="h-5 w-5" /><div className="min-w-0 flex-1"><p className="font-black text-slate-800">{orderCustomerName(order)}</p><p className="text-xs font-bold text-slate-500">فاتورة {orderInvoice(order)} · {orderAmount(order).toFixed(2)} ج</p></div></label> })}</div><button type="button" disabled={saving || !selectedOrderIds.length} onClick={() => void handleCreateSettlement()} className="mt-4 w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white disabled:opacity-50">{saving ? 'جاري تسجيل المحاسبة...' : `تسجيل محاسبة ${selectedOrderIds.length} أوردر`}</button></section></div></div> : null}

    {editOrder && editDraft ? <div className="fixed inset-0 z-50 bg-slate-950/50 p-3 backdrop-blur-sm" dir="rtl"><div className="mx-auto flex h-full max-w-[620px] items-end sm:items-center"><section className="max-h-[92vh] w-full overflow-y-auto rounded-[32px] bg-white p-4 shadow-2xl"><h2 className="text-xl font-black text-[#061827]">تعديل الأوردر قبل التسليم</h2><p className="mt-1 text-xs font-bold text-slate-500">كل تعديل يتم حفظه مع السبب ووقت التعديل.</p><div className="mt-4 grid grid-cols-2 gap-3"><input value={editDraft.invoice_number} onChange={(e) => setEditDraft({ ...editDraft, invoice_number: e.target.value })} className="dawaa-input text-right" placeholder="رقم الفاتورة *" /><input type="number" value={editDraft.invoice_amount} onChange={(e) => setEditDraft({ ...editDraft, invoice_amount: e.target.value })} className="dawaa-input text-right" placeholder="قيمة الفاتورة" /><input value={editDraft.customer_name} onChange={(e) => setEditDraft({ ...editDraft, customer_name: e.target.value })} className="dawaa-input text-right" placeholder="اسم العميل" /><input value={editDraft.customer_code} onChange={(e) => setEditDraft({ ...editDraft, customer_code: e.target.value })} className="dawaa-input text-right" placeholder="كود العميل" /><input value={editDraft.customer_phone} onChange={(e) => setEditDraft({ ...editDraft, customer_phone: e.target.value })} className="dawaa-input text-right" placeholder="رقم الهاتف" /><input value={editDraft.customer_address} onChange={(e) => setEditDraft({ ...editDraft, customer_address: e.target.value })} className="dawaa-input text-right" placeholder="العنوان" /></div><textarea value={editDraft.notes} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} rows={2} className="dawaa-input mt-3 resize-none text-right" placeholder="ملاحظات الأوردر" /><input value={editReason} onChange={(e) => setEditReason(e.target.value)} className="dawaa-input mt-3 text-right" placeholder="سبب التعديل * مثال: تصحيح رقم الفاتورة" /><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setEditOrder(null); setEditDraft(null); setEditReason('') }} className="rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-600">إلغاء</button><button type="button" disabled={saving} onClick={() => void handleSaveEditOrder()} className="rounded-2xl bg-[#008E92] py-3 text-sm font-black text-white disabled:opacity-50">حفظ التعديل</button></div></section></div></div> : null}

    {failOrder ? <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm" dir="rtl"><div className="mx-auto flex h-full max-w-[520px] items-end sm:items-center"><section className="w-full rounded-[32px] bg-white p-4 shadow-2xl"><h2 className="text-xl font-black text-[#061827]">تسجيل فشل التسليم</h2><p className="mt-1 text-sm font-bold text-slate-500">فاتورة {orderInvoice(failOrder as any)} · {orderCustomerName(failOrder as any)}</p><textarea value={failReason} onChange={(e) => setFailReason(e.target.value)} rows={4} className="dawaa-input mt-4 resize-none text-right" placeholder="سبب الفشل: العميل لا يرد، العنوان غير واضح، رفض الاستلام..." /><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setFailOrder(null); setFailReason('') }} className="rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-600">إلغاء</button><button type="button" disabled={saving} onClick={() => void handleFailed()} className="rounded-2xl bg-rose-600 py-3 text-sm font-black text-white disabled:opacity-50">حفظ الفشل</button></div></section></div></div> : null}
  </>
}
