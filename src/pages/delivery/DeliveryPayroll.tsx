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
                <th className="p-2 text-right">ساعات العمل</th>
                <th className="p-2 text-right">الأوردرات</th>
                <th className="p-2 text-right">حافز شهري</th>
                <th className="p-2 text-right">بدلات</th>
                <th className="p-2 text-right">خصومات</th>
                <th className="p-2 text-right">الصافي</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.rider_id} className="border-t">
                  <td className="p-2 font-medium">{row.rider_name || row.rider_id}</td>
                  <td className="p-2">{row.total_work_hours}</td>
                  <td className="p-2">{row.delivered_orders}</td>
                  <td className="p-2">{row.monthly_incentive}</td>
                  <td className="p-2">{row.bonuses}</td>
                  <td className="p-2">{row.penalties}</td>
                  <td className="p-2 font-bold">{row.net_pay}</td>
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
