import { toast } from 'sonner'
import RiderOperatingDashboard from '../../components/rider/RiderOperatingDashboard'
import type { Attendance, DeliveryOrder, InternalTrip, Rider } from '../../lib/types'

const previewRider = {
  id: 'preview-rider',
  name: 'مندوب تجريبي',
  branch_name: 'فرع الشامي',
  branch_id: 'preview-branch',
  order_rate: 0,
  trip_rate: 0,
  hourly_rate: 0,
} as unknown as Rider

const previewAttendance = {
  id: 'preview-attendance',
  rider_id: 'preview-rider',
  work_date: new Date().toISOString().slice(0, 10),
  check_in_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  check_out_at: null,
} as unknown as Attendance

const previewOrders = [
  {
    id: 'order-1',
    invoice_number: '15421',
    customer_name_snapshot: 'عميل تجريبي',
    customer_address_snapshot: 'عنوان قريب من الفرع',
    status: 'registered',
    registered_at: new Date(Date.now() - 52 * 60 * 1000).toISOString(),
  },
  {
    id: 'order-2',
    invoice_number: '15422',
    customer_name_snapshot: 'عميل تم التسليم',
    status: 'delivered',
    registered_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  },
  {
    id: 'order-3',
    invoice_number: '15423',
    customer_name_snapshot: 'عميل لم يرد',
    status: 'failed',
    registered_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
  },
] as unknown as DeliveryOrder[]

const previewTrips = [
  {
    id: 'trip-1',
    rider_id: 'preview-rider',
    trip_type: 'branch_to_branch',
    from_label: 'فرع الشامي',
    to_label: 'فرع شكري',
    status: 'pending_approval',
    registered_at: new Date().toISOString(),
  },
] as unknown as InternalTrip[]

export default function RiderOperatingPreview() {
  const notify = (message: string) => toast.info(`${message} — صفحة معاينة فقط، الداشبورد الحقيقي لم يتأثر.`)

  return (
    <RiderOperatingDashboard
      rider={previewRider}
      branchName="فرع الشامي"
      attendance={previewAttendance}
      orders={previewOrders}
      trips={previewTrips}
      pendingSyncCount={1}
      device={{
        batteryPercent: 76,
        batterySupported: true,
        isCharging: false,
        online: true,
        gpsAccuracy: 38,
        lastSyncText: 'آخر مزامنة منذ دقيقة',
      }}
      onCheckInOut={() => notify('تسجيل حضور/انصراف')}
      onNewOrder={() => notify('تسجيل أوردر سريع')}
      onOpenOrders={() => notify('فتح الأوردرات المفتوحة')}
      onNewTrip={() => notify('تسجيل مشوار')}
      onRefresh={() => notify('تحديث البيانات')}
      onLogout={() => notify('تسجيل خروج')}
    >
      <section className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm" dir="rtl">
        <h2 className="text-lg font-black text-[#061827]">ملاحظات المعاينة</h2>
        <div className="mt-3 space-y-2 text-sm font-bold text-slate-600">
          <p>✅ هذه الصفحة لا تغيّر بيانات حقيقية ولا تستدعي RPC.</p>
          <p>✅ الهدف منها مراجعة التصميم الجديد قبل دمجه داخل الداشبورد الحقيقي.</p>
          <p>✅ بعد الموافقة، يتم تركيب هذا المكوّن داخل RiderDashboard الحالي وربطه بنفس الدوال الموجودة.</p>
        </div>
      </section>
    </RiderOperatingDashboard>
  )
}
