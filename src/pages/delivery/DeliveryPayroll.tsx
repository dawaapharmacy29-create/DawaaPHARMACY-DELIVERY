import { useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { useDeliveryPayroll } from '@/hooks/useDeliveryData';

export default function DeliveryPayroll() {
  const { data, isLoading } = useDeliveryPayroll();
  const rows = data?.rows || [];
  const totals = useMemo(
    () => rows.reduce(
      (acc, row) => ({
        totalHours: acc.totalHours + (row.total_work_hours || 0),
        totalOrders: acc.totalOrders + (row.delivered_orders || 0),
        totalIncentives: acc.totalIncentives + (row.monthly_incentive || 0),
        totalBonuses: acc.totalBonuses + (row.bonuses || 0),
        totalPenalties: acc.totalPenalties + (row.penalties || 0),
        totalNet: acc.totalNet + (row.net_pay || 0),
      }),
      { totalHours: 0, totalOrders: 0, totalIncentives: 0, totalBonuses: 0, totalPenalties: 0, totalNet: 0 },
    ),
    [rows],
  );

  return (
    <AppLayout title="حساب شهر الدليفري" subtitle="الشهر يبدأ يوم 26 وينتهي يوم 25">
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-right">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-500">الفترة: {data?.range.label || '...'}</div>
          <div className="text-sm text-slate-700">إجمالي الصفوف: {rows.length}</div>
        </div>
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
        {rows.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right text-sm text-slate-700">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>الساعات الإجمالية: <span className="font-bold">{totals.totalHours}</span></div>
              <div>أوردرات محققة: <span className="font-bold">{totals.totalOrders}</span></div>
              <div>حافز شهري: <span className="font-bold">{totals.totalIncentives}</span></div>
              <div>بدلات: <span className="font-bold">{totals.totalBonuses}</span></div>
              <div>خصومات: <span className="font-bold">{totals.totalPenalties}</span></div>
              <div>صافي الدفع: <span className="font-bold">{totals.totalNet}</span></div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
