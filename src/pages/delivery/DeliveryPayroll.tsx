import AppLayout from '@/components/layout/AppLayout';
import { useDeliveryPayroll } from '@/hooks/useDeliveryData';

export default function DeliveryPayroll() {
  const { data, isLoading } = useDeliveryPayroll();
  const rows = data?.rows || [];

  return (
    <AppLayout title="حساب شهر الدليفري" subtitle="الشهر يبدأ يوم 26 وينتهي يوم 25">
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-right">
        <div className="text-sm text-gray-500 mb-3">الفترة: {data?.range.label || '...'}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="p-2 text-right">المندوب</th>
                <th className="p-2 text-right">الفئة</th>
                <th className="p-2 text-right">ساعات</th>
                <th className="p-2 text-right">أوردرات</th>
                <th className="p-2 text-right">مشاوير</th>
                <th className="p-2 text-right">إجمالي</th>
                <th className="p-2 text-right">صافي</th>
                <th className="p-2 text-right">Review</th>
                <th className="p-2 text-right">غير معتمد</th>
                <th className="p-2 text-right">فشل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.rider_id} className="border-t">
                  <td className="p-2 font-medium">{row.rider_name}</td>
                  <td className="p-2">{row.tier}</td>
                  <td className="p-2">{row.hours_count}</td>
                  <td className="p-2">{row.delivered_orders_count}</td>
                  <td className="p-2">{row.internal_trips_count}</td>
                  <td className="p-2">{row.gross_total}</td>
                  <td className="p-2 font-bold">{row.net_total}</td>
                  <td className="p-2">{row.pending_review_count}</td>
                  <td className="p-2">{row.unapproved_trips_count}</td>
                  <td className="p-2">{row.failed_orders_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && rows.length === 0 && <div className="text-center text-gray-400 py-6">لا توجد بيانات حساب للفترة</div>}
        </div>
      </div>
    </AppLayout>
  );
}
