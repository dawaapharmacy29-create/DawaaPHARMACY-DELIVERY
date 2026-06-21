import { ReactNode } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import type { Attendance, DeliveryOrder, InternalTrip, Rider } from '../../lib/types'
import { formatTime } from '../../lib/helpers'

type DeviceSnapshot = {
  batteryPercent?: number | null
  batterySupported?: boolean
  isCharging?: boolean | null
  online?: boolean
  gpsAccuracy?: number | null
  lastSyncText?: string | null
}

type Props = {
  rider: Rider
  branchName?: string | null
  attendance?: Attendance | null
  orders?: DeliveryOrder[]
  trips?: InternalTrip[]
  device?: DeviceSnapshot
  saving?: boolean
  pendingSyncCount?: number
  children?: ReactNode
  onCheckInOut: () => void
  onNewOrder: () => void
  onOpenOrders: () => void
  onNewTrip: () => void
  onRefresh?: () => void
  onLogout?: () => void
}

function isDelivered(order: DeliveryOrder) {
  return ['delivered', 'تم التسليم'].includes(String(order.status || '').toLowerCase())
}

function isFailed(order: DeliveryOrder) {
  return ['failed', 'فشل', 'failed_delivery'].includes(String(order.status || '').toLowerCase())
}

function isOpen(order: DeliveryOrder) {
  return !isDelivered(order) && !isFailed(order)
}

function minutesSince(value?: string | null) {
  if (!value) return 0
  const diff = Date.now() - new Date(value).getTime()
  return Math.max(0, Math.round(diff / 60000))
}

function StatusPill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'green' | 'red' | 'amber' | 'teal' | 'slate' }) {
  const styles = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    red: 'bg-rose-50 text-rose-700 border-rose-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    teal: 'bg-teal-50 text-teal-700 border-teal-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  }
  return <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${styles[tone]}`}>{children}</span>
}

function ActionButton({ title, subtitle, icon, onClick, tone = 'teal', disabled }: { title: string; subtitle: string; icon: string; onClick: () => void; tone?: 'teal' | 'blue' | 'amber'; disabled?: boolean }) {
  const styles = {
    teal: 'from-[#008E92] to-[#006A70] text-white',
    blue: 'from-sky-600 to-blue-700 text-white',
    amber: 'from-amber-500 to-orange-600 text-white',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[118px] rounded-[30px] bg-gradient-to-l p-5 text-right shadow-lg transition active:scale-[0.98] disabled:opacity-50 ${styles[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/18 text-3xl shadow-inner">{icon}</span>
        <div className="flex-1">
          <p className="text-xl font-black leading-7">{title}</p>
          <p className="mt-2 text-xs font-bold opacity-85">{subtitle}</p>
        </div>
      </div>
    </button>
  )
}

function Metric({ label, value, hint, tone = 'slate' }: { label: string; value: string | number; hint?: string; tone?: 'green' | 'red' | 'amber' | 'teal' | 'slate' }) {
  const styles = {
    green: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    red: 'bg-rose-50 text-rose-800 border-rose-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
    teal: 'bg-teal-50 text-teal-800 border-teal-100',
    slate: 'bg-white text-slate-800 border-slate-100',
  }
  return (
    <div className={`rounded-3xl border p-4 shadow-sm ${styles[tone]}`}>
      <p className="text-xs font-black opacity-70">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      {hint ? <p className="mt-1 text-[11px] font-bold opacity-65">{hint}</p> : null}
    </div>
  )
}

export default function RiderOperatingDashboard({
  rider,
  branchName,
  attendance,
  orders = [],
  trips = [],
  device,
  saving,
  pendingSyncCount = 0,
  children,
  onCheckInOut,
  onNewOrder,
  onOpenOrders,
  onNewTrip,
  onRefresh,
  onLogout,
}: Props) {
  const shiftOpen = Boolean(attendance?.check_in_at && !attendance?.check_out_at)
  const shiftClosed = Boolean(attendance?.check_in_at && attendance?.check_out_at)
  const openOrders = orders.filter(isOpen)
  const deliveredOrders = orders.filter(isDelivered)
  const failedOrders = orders.filter(isFailed)
  const oldestOpenMinutes = openOrders.reduce((max, order: any) => Math.max(max, minutesSince(order.registered_at || order.created_at || order.prepared_at)), 0)
  const batteryText = device?.batterySupported === false || device?.batteryPercent == null ? 'غير مدعومة' : `${device.batteryPercent}%`
  const batteryTone = device?.batterySupported === false || device?.batteryPercent == null ? 'slate' : device.batteryPercent <= 15 ? 'red' : device.batteryPercent <= 35 ? 'amber' : 'green'
  const gpsTone = device?.gpsAccuracy == null ? 'slate' : device.gpsAccuracy > 300 ? 'red' : device.gpsAccuracy > 100 ? 'amber' : 'green'
  const shiftLabel = !attendance?.check_in_at ? 'لم يبدأ الشيفت' : shiftOpen ? `حاضر من ${formatTime(attendance.check_in_at)}` : `تم الانصراف ${formatTime(attendance.check_out_at)}`

  return (
    <div className="min-h-screen bg-[#F6FAFB] pb-24" dir="rtl">
      <header className="relative overflow-hidden rounded-b-[38px] bg-[#061827] px-4 pb-10 pt-5 text-white shadow-[0_20px_55px_rgba(6,24,39,0.28)]">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 18% 20%, white 0 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div className="relative mx-auto max-w-[980px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              {onLogout ? <button type="button" onClick={onLogout} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><LogOut size={18} /></button> : null}
              {onRefresh ? <button type="button" onClick={onRefresh} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><RefreshCw size={18} /></button> : null}
            </div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-xs font-bold text-teal-50/80">Dawaa Delivery</p>
                <h1 className="mt-1 text-2xl font-black">{rider.name}</h1>
                <p className="mt-1 text-xs font-black text-teal-50/90">{branchName || rider.branch_name || 'بدون فرع محدد'}</p>
              </div>
              <img src="/logo.png" alt="Dawaa" className="h-16 w-16 rounded-3xl border-2 border-white/70 bg-white object-contain p-1 shadow-xl" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatusPill tone={shiftOpen ? 'green' : shiftClosed ? 'slate' : 'red'}>{shiftLabel}</StatusPill>
            <StatusPill tone={batteryTone}>🔋 {batteryText}{device?.isCharging ? ' · شحن' : ''}</StatusPill>
            <StatusPill tone={device?.online === false ? 'red' : 'green'}>{device?.online === false ? 'Offline' : 'Online'}</StatusPill>
            <StatusPill tone={gpsTone}>📍 GPS {device?.gpsAccuracy == null ? '—' : `${device.gpsAccuracy}م`}</StatusPill>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto -mt-7 max-w-[980px] space-y-4 px-4">
        {pendingSyncCount > 0 ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800 shadow-sm">
            يوجد {pendingSyncCount} عملية محفوظة على الجهاز ولم تتم مزامنتها بعد. لا يتم اعتمادها نهائيًا إلا بعد الرفع.
          </div>
        ) : null}

        <section className="rounded-[30px] border border-teal-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black text-slate-400">وضع التشغيل اليومي</p>
              <h2 className="mt-1 text-xl font-black text-[#061827]">ابدأ الشيفت، سجل الأوردر، وأنهِ التسليم من نفس الشاشة</h2>
            </div>
            <button type="button" onClick={onCheckInOut} disabled={saving || shiftClosed} className="rounded-2xl bg-[#EAF8F8] px-5 py-3 text-sm font-black text-[#008E92] transition active:scale-95 disabled:opacity-50">
              {saving ? 'جاري الحفظ...' : shiftOpen ? 'إنهاء الشيفت' : shiftClosed ? 'تم إنهاء الشيفت' : 'بدء الشيفت'}
            </button>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <ActionButton title="تسجيل أوردر سريع" subtitle={shiftOpen ? 'يسجل على الشيفت المفتوح الآن' : 'سيسجل للمراجعة لو الشيفت غير مفتوح'} icon="🛍️" onClick={onNewOrder} />
          <ActionButton title="الأوردرات المفتوحة" subtitle={openOrders.length ? `${openOrders.length} أوردر تحت التسليم` : 'لا توجد أوردرات مفتوحة'} icon="📦" tone="blue" onClick={onOpenOrders} />
          <ActionButton title="تسجيل مشوار" subtitle="مخزن، فرع، تحصيل، مرتجع أو مأمورية" icon="🛵" tone="amber" onClick={onNewTrip} />
        </section>

        {openOrders.length > 0 ? (
          <section className={`rounded-[30px] border p-4 shadow-sm ${oldestOpenMinutes >= 90 ? 'border-rose-200 bg-rose-50' : oldestOpenMinutes >= 45 ? 'border-amber-200 bg-amber-50' : 'border-sky-100 bg-white'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-slate-500">متابعة عاجلة</p>
                <p className="mt-1 text-3xl font-black text-[#061827]">{openOrders.length}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">أقدم أوردر مفتوح منذ {oldestOpenMinutes} دقيقة</p>
              </div>
              <button type="button" onClick={onOpenOrders} className="rounded-2xl bg-[#008E92] px-5 py-3 text-sm font-black text-white">افتح المتابعة</button>
            </div>
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="أوردرات اليوم" value={orders.length} hint="كل المسجل" tone="teal" />
          <Metric label="تم التسليم" value={deliveredOrders.length} hint="مكتملة" tone="green" />
          <Metric label="قيد التسليم" value={openOrders.length} hint="تحتاج متابعة" tone={openOrders.length ? 'amber' : 'slate'} />
          <Metric label="فشل التسليم" value={failedOrders.length} hint="لا تحتسب" tone={failedOrders.length ? 'red' : 'slate'} />
          <Metric label="المشاوير" value={trips.length} hint="اليوم" tone="slate" />
          <Metric label="أقدم مفتوح" value={`${oldestOpenMinutes}د`} hint="زمن الانتظار" tone={oldestOpenMinutes >= 45 ? 'amber' : 'slate'} />
          <Metric label="المزامنة" value={pendingSyncCount} hint="عمليات معلقة" tone={pendingSyncCount ? 'amber' : 'green'} />
          <Metric label="حالة الجهاز" value={device?.online === false ? 'Offline' : 'Online'} hint={device?.lastSyncText || 'مباشر'} tone={device?.online === false ? 'red' : 'green'} />
        </section>

        {children}
      </main>
    </div>
  )
}
