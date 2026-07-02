import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, Clock, RefreshCw, Search } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { getBranches, getRiders } from '../../lib/delivery'
import { formatMoney, getOperationalPeriod, localIsoDate } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const LATE_MINUTES = 45

type Preset = 'today' | 'yesterday' | 'last7' | 'cycle' | 'custom'

type RiderLite = {
  id: string
  name?: string | null
  username?: string | null
  branch_id?: string | null
  branch_name?: string | null
}

type BranchLite = {
  id: string
  name?: string | null
  code?: string | null
}

type OrderRow = Record<string, any>

type EnrichedOrder = OrderRow & {
  rider_name: string
  branch_name: string
  analytics_hour: number
  analytics_minutes: number | null
  analytics_is_delivered: boolean
  analytics_is_failed: boolean
  analytics_is_open: boolean
  analytics_is_late: boolean
  analytics_has_edit: boolean
  analytics_is_duplicate: boolean
}

type HourStat = {
  hour: number
  orders: number
  delivered: number
  failed: number
  open: number
  late: number
  duplicates: number
  edited: number
  avgMinutes: number
  topRider: string
}

type RiderHourStat = {
  riderId: string
  rider: string
  branch: string
  total: number
  delivered: number
  late: number
  avgMinutes: number
  hours: Record<number, number>
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function rangeForPreset(preset: Preset) {
  const today = new Date()
  if (preset === 'today') return { from: localIsoDate(today), to: localIsoDate(today), label: 'اليوم' }
  if (preset === 'yesterday') {
    const yesterday = addDays(today, -1)
    return { from: localIsoDate(yesterday), to: localIsoDate(yesterday), label: 'أمس' }
  }
  if (preset === 'last7') return { from: localIsoDate(addDays(today, -6)), to: localIsoDate(today), label: 'آخر 7 أيام' }
  const op = getOperationalPeriod(today)
  return { from: op.start, to: op.end, label: 'الدورة الحالية 26 → 25' }
}

function safeDateOnly(value: any) {
  return String(value || '').slice(0, 10)
}

function pickDate(order: OrderRow) {
  return order.delivery_date || order.work_date || order.registered_at || order.created_at
}

function inRange(value: any, from: string, to: string) {
  const d = safeDateOnly(value)
  return d >= from && d <= to
}

function uniqueById(rows: OrderRow[]) {
  const map = new Map<string, OrderRow>()
  rows.forEach((row, index) => map.set(String(row.id || `${row.invoice_number || 'row'}-${index}`), row))
  return Array.from(map.values())
}

function getHour(value: any) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return 0
  return date.getHours()
}

function formatHour(hour: number) {
  const suffix = hour < 12 ? 'ص' : 'م'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:00 ${suffix}`
}

function formatDateTime(value: any) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('ar-EG', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function num(value: any) {
  return Number(value || 0) || 0
}

function isDelivered(order: OrderRow) {
  const status = String(order.status || order.dispatch_status || '').toLowerCase()
  return status === 'delivered' || status.includes('delivered') || status.includes('تم التسليم') || Boolean(order.delivered_at)
}

function isFailed(order: OrderRow) {
  const status = String(order.status || '').toLowerCase()
  return status === 'failed' || status === 'cancelled' || status.includes('fail') || status.includes('cancel') || Boolean(order.failed_at || order.failed_reason)
}

function deliveryMinutes(order: OrderRow) {
  const saved = num(order.delivery_duration_minutes)
  if (saved > 0) return saved
  if (!order.registered_at || !order.delivered_at) return null
  const start = new Date(order.registered_at).getTime()
  const end = new Date(order.delivered_at).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round((end - start) / 60000)
}

function orderSearchText(order: EnrichedOrder) {
  return [
    order.invoice_number,
    order.customer_code_snapshot,
    order.customer_name_snapshot,
    order.customer_phone_snapshot,
    order.customer_address_snapshot,
    order.rider_name,
    order.branch_name,
    order.notes,
  ].join(' ').toLowerCase()
}

function StatCard({ title, value, hint, icon, tone = 'teal' }: { title: string; value: string | number; hint?: string; icon: string; tone?: 'teal' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    teal: 'border-[#008E92]/20 bg-[#EAF8F8] text-[#008E92]',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    red: 'border-rose-100 bg-rose-50 text-rose-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    blue: 'border-sky-100 bg-sky-50 text-sky-700',
  }
  return (
    <div className={`rounded-3xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl shadow-sm">{icon}</span>
        <div>
          <p className="text-xs font-black text-slate-500">{title}</p>
          <p className="text-2xl font-black">{value}</p>
          {hint && <p className="text-xs font-bold text-slate-500">{hint}</p>}
        </div>
      </div>
    </div>
  )
}

export default function HourlyDeliveryAnalytics() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const initialPreset = (params.get('preset') as Preset) || 'today'
  const initialRange = initialPreset === 'custom'
    ? { from: params.get('from') || localIsoDate(), to: params.get('to') || localIsoDate(), label: 'فترة مخصصة' }
    : rangeForPreset(initialPreset)

  const [preset, setPreset] = useState<Preset>(initialPreset)
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [branchId, setBranchId] = useState(params.get('branch') || 'all')
  const [riderId, setRiderId] = useState(params.get('rider') || 'all')
  const [status, setStatus] = useState(params.get('status') || 'all')
  const [search, setSearch] = useState('')
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [orders, setOrders] = useState<EnrichedOrder[]>([])
  const [riders, setRiders] = useState<RiderLite[]>([])
  const [branches, setBranches] = useState<BranchLite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { void loadData() }, [from, to])

  function applyPreset(nextPreset: Preset) {
    setPreset(nextPreset)
    if (nextPreset !== 'custom') {
      const next = rangeForPreset(nextPreset)
      setFrom(next.from)
      setTo(next.to)
      setParams({ preset: nextPreset, from: next.from, to: next.to })
    } else {
      setParams({ preset: 'custom', from, to })
    }
  }

  function applyCustomRange(nextFrom: string, nextTo: string) {
    setPreset('custom')
    setFrom(nextFrom)
    setTo(nextTo)
    setParams({ preset: 'custom', from: nextFrom, to: nextTo })
  }

  async function loadData() {
    setLoading(true)
    try {
      const editFrom = `${from}T00:00:00`
      const editTo = `${to}T23:59:59`
      const [riderResult, branchResult, byDeliveryDate, byWorkDate, editLogs] = await Promise.allSettled([
        getRiders(),
        getBranches(),
        supabase.from('delivery_orders').select('*').gte('delivery_date', from).lte('delivery_date', to).limit(50000),
        supabase.from('delivery_orders').select('*').gte('work_date', from).lte('work_date', to).limit(50000),
        supabase.from('delivery_order_edit_logs').select('*').gte('created_at', editFrom).lte('created_at', editTo).limit(50000),
      ])

      const riderRows = riderResult.status === 'fulfilled' ? (riderResult.value as RiderLite[]) : []
      const branchRows = branchResult.status === 'fulfilled' ? (branchResult.value as BranchLite[]) : []
      const rawOrders = [byDeliveryDate, byWorkDate].flatMap((result: any) => result.status === 'fulfilled' && !result.value.error ? (result.value.data || []) : [])
      const rows = uniqueById(rawOrders).filter(row => inRange(pickDate(row), from, to))
      const logRows = editLogs.status === 'fulfilled' && !(editLogs.value as any).error ? ((editLogs.value as any).data || []) : []
      const editedOrderIds = new Set(logRows.map((log: any) => String(log.delivery_order_id || log.order_id || log.orderId || '')).filter(Boolean))
      const invoiceCounts = rows.reduce((map, row) => {
        const key = String(row.invoice_number || '').trim()
        if (key) map.set(key, (map.get(key) || 0) + 1)
        return map
      }, new Map<string, number>())

      setRiders(riderRows)
      setBranches(branchRows)
      setOrders(rows.map(row => {
        const rider = riderRows.find(r => r.id === row.rider_id)
        const branch = branchRows.find(b => b.id === row.branch_id)
        const minutes = deliveryMinutes(row)
        const delivered = isDelivered(row)
        const failed = isFailed(row)
        const duplicateByNumber = invoiceCounts.get(String(row.invoice_number || '').trim()) || 0
        return {
          ...row,
          rider_name: rider?.name || rider?.username || row.rider_name || 'غير محدد',
          branch_name: branch?.name || rider?.branch_name || row.branch_name || 'غير محدد',
          analytics_hour: getHour(row.registered_at || row.created_at),
          analytics_minutes: minutes,
          analytics_is_delivered: delivered,
          analytics_is_failed: failed,
          analytics_is_open: !delivered && !failed,
          analytics_is_late: (minutes ?? 0) > LATE_MINUTES || (!delivered && !failed && row.registered_at ? ((Date.now() - new Date(row.registered_at).getTime()) / 60000) > 60 : false),
          analytics_has_edit: editedOrderIds.has(String(row.id)) || Boolean(row.edited_at || row.updated_by_rider_at),
          analytics_is_duplicate: Boolean(row.is_duplicate_invoice || row.duplicate_reason || duplicateByNumber > 1),
        } as EnrichedOrder
      }))
    } catch (error: any) {
      toast.error(error?.message || 'حصلت مشكلة في تحميل تحليل الساعات')
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter(order => {
      if (branchId !== 'all' && order.branch_id !== branchId) return false
      if (riderId !== 'all' && order.rider_id !== riderId) return false
      if (status === 'delivered' && !order.analytics_is_delivered) return false
      if (status === 'failed' && !order.analytics_is_failed) return false
      if (status === 'open' && !order.analytics_is_open) return false
      if (status === 'late' && !order.analytics_is_late) return false
      if (status === 'duplicate' && !order.analytics_is_duplicate) return false
      if (status === 'edited' && !order.analytics_has_edit) return false
      if (q && !orderSearchText(order).includes(q)) return false
      return true
    })
  }, [orders, branchId, riderId, status, search])

  const hourStats = useMemo<HourStat[]>(() => {
    return HOURS.map(hour => {
      const rows = filteredOrders.filter(order => order.analytics_hour === hour)
      const deliveredRows = rows.filter(order => order.analytics_is_delivered)
      const avgSource = deliveredRows.map(order => order.analytics_minutes).filter((value): value is number => typeof value === 'number')
      const riderMap = rows.reduce((map, order) => {
        map.set(order.rider_name, (map.get(order.rider_name) || 0) + 1)
        return map
      }, new Map<string, number>())
      const topRider = Array.from(riderMap.entries()).sort((a, b) => b[1] - a[1])[0]
      return {
        hour,
        orders: rows.length,
        delivered: deliveredRows.length,
        failed: rows.filter(order => order.analytics_is_failed).length,
        open: rows.filter(order => order.analytics_is_open).length,
        late: rows.filter(order => order.analytics_is_late).length,
        duplicates: rows.filter(order => order.analytics_is_duplicate).length,
        edited: rows.filter(order => order.analytics_has_edit).length,
        avgMinutes: avgSource.length ? Math.round(avgSource.reduce((sum, value) => sum + value, 0) / avgSource.length) : 0,
        topRider: topRider ? `${topRider[0]} (${topRider[1]})` : '—',
      }
    })
  }, [filteredOrders])

  const riderMatrix = useMemo<RiderHourStat[]>(() => {
    const map = new Map<string, RiderHourStat>()
    filteredOrders.forEach(order => {
      const key = String(order.rider_id || 'unknown')
      if (!map.has(key)) {
        map.set(key, { riderId: key, rider: order.rider_name, branch: order.branch_name, total: 0, delivered: 0, late: 0, avgMinutes: 0, hours: {} })
      }
      const row = map.get(key)!
      row.total += 1
      row.delivered += order.analytics_is_delivered ? 1 : 0
      row.late += order.analytics_is_late ? 1 : 0
      row.hours[order.analytics_hour] = (row.hours[order.analytics_hour] || 0) + 1
    })
    return Array.from(map.values()).map(row => {
      const riderOrders = filteredOrders.filter(order => String(order.rider_id || 'unknown') === row.riderId && typeof order.analytics_minutes === 'number')
      const totalMinutes = riderOrders.reduce((sum, order) => sum + Number(order.analytics_minutes || 0), 0)
      return { ...row, avgMinutes: riderOrders.length ? Math.round(totalMinutes / riderOrders.length) : 0 }
    }).sort((a, b) => b.total - a.total)
  }, [filteredOrders])

  const totals = useMemo(() => {
    const delivered = filteredOrders.filter(order => order.analytics_is_delivered).length
    const failed = filteredOrders.filter(order => order.analytics_is_failed).length
    const late = filteredOrders.filter(order => order.analytics_is_late).length
    const duplicates = filteredOrders.filter(order => order.analytics_is_duplicate).length
    const edited = filteredOrders.filter(order => order.analytics_has_edit).length
    const amounts = filteredOrders.reduce((sum, order) => sum + num(order.invoice_amount), 0)
    const minutesRows = filteredOrders.map(order => order.analytics_minutes).filter((value): value is number => typeof value === 'number')
    const avgMinutes = minutesRows.length ? Math.round(minutesRows.reduce((sum, value) => sum + value, 0) / minutesRows.length) : 0
    const peak = [...hourStats].sort((a, b) => b.orders - a.orders)[0]
    return { delivered, failed, open: filteredOrders.length - delivered - failed, late, duplicates, edited, amounts, avgMinutes, peak }
  }, [filteredOrders, hourStats])

  const maxHourOrders = Math.max(...hourStats.map(stat => stat.orders), 1)
  const selectedOrders = filteredOrders
    .filter(order => selectedHour === null || order.analytics_hour === selectedHour)
    .sort((a, b) => String(b.registered_at || '').localeCompare(String(a.registered_at || '')))

  return (
    <div className="min-h-screen bg-[#F3F7F8]" dir="rtl">
      <header className="sticky top-0 z-20 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <button onClick={() => navigate('/admin')} className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-200 active:scale-95">
            <ArrowLeft size={16} /> رجوع
          </button>
          <div className="text-center">
            <h1 className="text-lg font-black text-[#061827]">⏱️ تحليل الدليفري بالساعات</h1>
            <p className="text-xs font-bold text-slate-400">تفاصيل الأوردرات، الضغط، التأخير، التكرار والتعديلات من {from} إلى {to}</p>
          </div>
          <button onClick={loadData} disabled={loading} className="rounded-2xl border bg-white p-2 text-slate-600 transition hover:bg-slate-50 active:scale-95">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <section className="rounded-[28px] border bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs font-black text-slate-500">الفترة</label>
              <select value={preset} onChange={event => applyPreset(event.target.value as Preset)} className="w-full rounded-2xl border px-3 py-2.5 text-sm font-black outline-none focus:border-[#008E92]">
                <option value="today">اليوم</option>
                <option value="yesterday">أمس</option>
                <option value="last7">آخر 7 أيام</option>
                <option value="cycle">الدورة الحالية 26 → 25</option>
                <option value="custom">فترة مخصصة</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-500">من</label>
              <input type="date" value={from} onChange={event => applyCustomRange(event.target.value, to)} className="w-full rounded-2xl border px-3 py-2.5 text-sm font-black outline-none focus:border-[#008E92]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-500">إلى</label>
              <input type="date" value={to} onChange={event => applyCustomRange(from, event.target.value)} className="w-full rounded-2xl border px-3 py-2.5 text-sm font-black outline-none focus:border-[#008E92]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-500">الفرع</label>
              <select value={branchId} onChange={event => setBranchId(event.target.value)} className="w-full rounded-2xl border px-3 py-2.5 text-sm font-black outline-none focus:border-[#008E92]">
                <option value="all">كل الفروع</option>
                {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name || branch.code || branch.id}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-500">الدليفري</label>
              <select value={riderId} onChange={event => setRiderId(event.target.value)} className="w-full rounded-2xl border px-3 py-2.5 text-sm font-black outline-none focus:border-[#008E92]">
                <option value="all">كل المناديب</option>
                {riders.map(rider => <option key={rider.id} value={rider.id}>{rider.name || rider.username || rider.id}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-500">الحالة</label>
              <select value={status} onChange={event => setStatus(event.target.value)} className="w-full rounded-2xl border px-3 py-2.5 text-sm font-black outline-none focus:border-[#008E92]">
                <option value="all">كل الحالات</option>
                <option value="delivered">تم التسليم</option>
                <option value="open">لم يتم التسليم</option>
                <option value="failed">فشل / ملغي</option>
                <option value="late">متأخر</option>
                <option value="duplicate">فاتورة مكررة</option>
                <option value="edited">تم تعديله</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-2xl border bg-slate-50 px-3 py-2">
            <Search size={16} className="text-slate-400" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث برقم الفاتورة، اسم العميل، الكود، الهاتف، العنوان أو الدليفري" className="w-full bg-transparent text-sm font-bold outline-none" />
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="إجمالي الأوردرات" value={filteredOrders.length} icon="📦" hint={loading ? 'جاري التحميل...' : 'حسب الفلاتر الحالية'} tone="blue" />
          <StatCard title="تم التسليم" value={totals.delivered} icon="✅" hint={`${filteredOrders.length ? Math.round((totals.delivered / filteredOrders.length) * 100) : 0}% من الأوردرات`} tone="green" />
          <StatCard title="متوسط وقت التسليم" value={totals.avgMinutes ? `${totals.avgMinutes} د` : '—'} icon="⏳" hint={`التأخير محسوب بعد ${LATE_MINUTES} دقيقة`} tone="teal" />
          <StatCard title="أعلى ساعة ضغط" value={totals.peak?.orders ? formatHour(totals.peak.hour) : '—'} icon="🔥" hint={totals.peak?.orders ? `${totals.peak.orders} أوردر` : 'لا توجد بيانات'} tone="amber" />
          <StatCard title="متأخر" value={totals.late} icon="⚠️" hint="تسليم طويل أو أوردر مفتوح أكثر من ساعة" tone="red" />
          <StatCard title="لم يتم التسليم" value={totals.open} icon="🕒" hint="أوردرات ما زالت مفتوحة" tone="amber" />
          <StatCard title="فواتير مكررة" value={totals.duplicates} icon="🔁" hint="حسب العلامة أو تكرار رقم الفاتورة" tone="red" />
          <StatCard title="قيمة الفواتير" value={formatMoney(totals.amounts)} icon="💰" hint="إجمالي مبالغ الأوردرات المتاحة" tone="green" />
        </section>

        <section className="rounded-[28px] border bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black text-[#061827]">الرسم البياني بالساعات</h2>
              <p className="text-xs font-bold text-slate-400">اضغط على أي ساعة لعرض تفاصيل أوردراتها فقط.</p>
            </div>
            {selectedHour !== null && <button onClick={() => setSelectedHour(null)} className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">عرض كل الساعات</button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {hourStats.map(stat => (
              <button key={stat.hour} onClick={() => setSelectedHour(stat.hour)} className={`rounded-2xl border p-3 text-right transition hover:-translate-y-0.5 hover:shadow-md ${selectedHour === stat.hour ? 'border-[#008E92] bg-[#EAF8F8]' : 'bg-white'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-[#061827]"><Clock size={14} className="inline" /> {formatHour(stat.hour)}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600">{stat.orders}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#008E92]" style={{ width: `${Math.max(3, (stat.orders / maxHourOrders) * 100)}%` }} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px] font-black">
                  <span className="rounded-xl bg-emerald-50 py-1 text-emerald-700">تم {stat.delivered}</span>
                  <span className="rounded-xl bg-amber-50 py-1 text-amber-700">مفتوح {stat.open}</span>
                  <span className="rounded-xl bg-rose-50 py-1 text-rose-700">متأخر {stat.late}</span>
                </div>
                <p className="mt-2 truncate text-[11px] font-bold text-slate-400">الأكثر نشاطًا: {stat.topRider}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden rounded-[28px] border bg-white shadow-sm">
            <div className="border-b p-4">
              <h2 className="text-lg font-black text-[#061827]">جدول الساعات</h2>
              <p className="text-xs font-bold text-slate-400">يوضح حجم الضغط، التسليم، المتأخرات، التكرار والتعديلات لكل ساعة.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="p-3 text-right">الساعة</th>
                    <th className="p-3 text-center">الأوردرات</th>
                    <th className="p-3 text-center">تم</th>
                    <th className="p-3 text-center">مفتوح</th>
                    <th className="p-3 text-center">فشل</th>
                    <th className="p-3 text-center">متأخر</th>
                    <th className="p-3 text-center">متوسط التسليم</th>
                    <th className="p-3 text-center">مكرر</th>
                    <th className="p-3 text-center">تعديل</th>
                    <th className="p-3 text-right">أعلى دليفري</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hourStats.filter(stat => stat.orders > 0).map(stat => (
                    <tr key={stat.hour} onClick={() => setSelectedHour(stat.hour)} className="cursor-pointer hover:bg-[#F1FBFB]">
                      <td className="p-3 font-black text-[#061827]">{formatHour(stat.hour)}</td>
                      <td className="p-3 text-center font-black text-[#008E92]">{stat.orders}</td>
                      <td className="p-3 text-center font-bold text-emerald-700">{stat.delivered}</td>
                      <td className="p-3 text-center font-bold text-amber-700">{stat.open}</td>
                      <td className="p-3 text-center font-bold text-rose-700">{stat.failed}</td>
                      <td className="p-3 text-center font-bold text-rose-700">{stat.late}</td>
                      <td className="p-3 text-center font-bold">{stat.avgMinutes ? `${stat.avgMinutes} د` : '—'}</td>
                      <td className="p-3 text-center font-bold">{stat.duplicates}</td>
                      <td className="p-3 text-center font-bold">{stat.edited}</td>
                      <td className="p-3 font-bold text-slate-600">{stat.topRider}</td>
                    </tr>
                  ))}
                  {!loading && hourStats.every(stat => stat.orders === 0) && <tr><td colSpan={10} className="p-8 text-center font-black text-slate-400">لا توجد أوردرات في الفترة المحددة</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border bg-white shadow-sm">
            <div className="border-b p-4">
              <h2 className="text-lg font-black text-[#061827]">مقارنة المناديب بالساعات</h2>
              <p className="text-xs font-bold text-slate-400">مين شايل الضغط في كل فترة.</p>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-2 text-right">الدليفري</th>
                    <th className="p-2 text-center">الإجمالي</th>
                    <th className="p-2 text-center">تم</th>
                    <th className="p-2 text-center">متأخر</th>
                    <th className="p-2 text-center">متوسط</th>
                    {HOURS.filter(hour => hourStats[hour]?.orders > 0).map(hour => <th key={hour} className="p-2 text-center">{hour}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {riderMatrix.map(row => (
                    <tr key={row.riderId} className="hover:bg-slate-50">
                      <td className="p-2 font-black text-[#061827]"><button onClick={() => setRiderId(row.riderId)} className="hover:text-[#008E92]">{row.rider}</button><p className="text-[10px] font-bold text-slate-400">{row.branch}</p></td>
                      <td className="p-2 text-center font-black text-[#008E92]">{row.total}</td>
                      <td className="p-2 text-center font-bold text-emerald-700">{row.delivered}</td>
                      <td className="p-2 text-center font-bold text-rose-700">{row.late}</td>
                      <td className="p-2 text-center font-bold">{row.avgMinutes ? `${row.avgMinutes} د` : '—'}</td>
                      {HOURS.filter(hour => hourStats[hour]?.orders > 0).map(hour => <td key={hour} className="p-2 text-center font-bold">{row.hours[hour] || '—'}</td>)}
                    </tr>
                  ))}
                  {!loading && riderMatrix.length === 0 && <tr><td colSpan={29} className="p-8 text-center font-black text-slate-400">لا توجد بيانات للمناديب حسب الفلاتر الحالية</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border bg-white shadow-sm">
          <button onClick={() => setSelectedHour(selectedHour)} className="flex w-full items-center justify-between border-b p-4 text-right">
            <span>
              <h2 className="text-lg font-black text-[#061827]">تفاصيل الأوردرات {selectedHour !== null ? `في ساعة ${formatHour(selectedHour)}` : 'لكل الساعات'}</h2>
              <p className="text-xs font-bold text-slate-400">رقم الفاتورة، العميل، الدليفري، وقت التسجيل، وقت التسليم، المدة والحالة.</p>
            </span>
            <ChevronDown size={18} className="text-slate-400" />
          </button>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-3 text-right">الفاتورة</th>
                  <th className="p-3 text-right">العميل / الكود</th>
                  <th className="p-3 text-right">الهاتف / العنوان</th>
                  <th className="p-3 text-right">الدليفري</th>
                  <th className="p-3 text-right">الفرع</th>
                  <th className="p-3 text-center">الساعة</th>
                  <th className="p-3 text-center">وقت التسجيل</th>
                  <th className="p-3 text-center">وقت التسليم</th>
                  <th className="p-3 text-center">المدة</th>
                  <th className="p-3 text-center">القيمة</th>
                  <th className="p-3 text-center">الحالة</th>
                  <th className="p-3 text-center">ملاحظات رقابية</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selectedOrders.slice(0, 500).map(order => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="p-3 font-black text-[#061827]">{order.invoice_number || '—'}</td>
                    <td className="p-3"><p className="font-black text-slate-700">{order.customer_name_snapshot || 'عميل غير محدد'}</p><p className="text-xs font-bold text-slate-400">{order.customer_code_snapshot || 'بدون كود'}</p></td>
                    <td className="p-3"><p className="font-bold text-slate-600">{order.customer_phone_snapshot || '—'}</p><p className="max-w-[260px] truncate text-xs font-bold text-slate-400">{order.customer_address_snapshot || '—'}</p></td>
                    <td className="p-3 font-black text-[#008E92]">{order.rider_name}</td>
                    <td className="p-3 font-bold text-slate-600">{order.branch_name}</td>
                    <td className="p-3 text-center font-black">{formatHour(order.analytics_hour)}</td>
                    <td className="p-3 text-center font-bold">{formatDateTime(order.registered_at || order.created_at)}</td>
                    <td className="p-3 text-center font-bold">{formatDateTime(order.delivered_at)}</td>
                    <td className={`p-3 text-center font-black ${order.analytics_is_late ? 'text-rose-700' : 'text-slate-700'}`}>{order.analytics_minutes ? `${order.analytics_minutes} د` : '—'}</td>
                    <td className="p-3 text-center font-bold">{formatMoney(num(order.invoice_amount))}</td>
                    <td className="p-3 text-center">
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${order.analytics_is_delivered ? 'bg-emerald-50 text-emerald-700' : order.analytics_is_failed ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{order.analytics_is_delivered ? 'تم التسليم' : order.analytics_is_failed ? 'فشل / ملغي' : 'مفتوح'}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {order.analytics_is_late && <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-700">متأخر</span>}
                        {order.analytics_is_duplicate && <span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] font-black text-orange-700">مكرر</span>}
                        {order.analytics_has_edit && <span className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-black text-sky-700">تم تعديله</span>}
                        {order.needs_review && <span className="rounded-full bg-purple-50 px-2 py-1 text-[11px] font-black text-purple-700">مراجعة</span>}
                        {!order.analytics_is_late && !order.analytics_is_duplicate && !order.analytics_has_edit && !order.needs_review && <span className="text-xs font-bold text-slate-400">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && selectedOrders.length === 0 && <tr><td colSpan={12} className="p-8 text-center font-black text-slate-400">لا توجد أوردرات مطابقة</td></tr>}
              </tbody>
            </table>
          </div>
          {selectedOrders.length > 500 && <p className="border-t bg-amber-50 p-3 text-center text-xs font-black text-amber-700">تم عرض أول 500 أوردر فقط للحفاظ على سرعة الصفحة. استخدم الفلاتر لتضييق النتائج.</p>}
        </section>
      </main>
    </div>
  )
}
