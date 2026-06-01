import AppLayout from '@/components/layout/AppLayout';
import { useIncentives } from '@/hooks/useDeliveryData';

export default function DeliveryIncentives() {
  const { data, isLoading } = useIncentives();

  return (
    <AppLayout title="الحوافز" subtitle="عرض الحوافز المتوقعة لكل مندوب">
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-right">
        {isLoading && <div>جاري التحميل...</div>}
        {!isLoading && data && data.length === 0 && <div className="text-gray-400">لا توجد سجلات حاليًا</div>}
        <div className="space-y-3">
          {data?.map((r: any) => (
            <div key={r.id} className="border rounded-lg p-3 flex justify-between items-center">
              <div>
                <div className="font-bold">{r.delivery_riders?.name || r.rider_name || r.rider_id}</div>
                <div className="text-sm text-gray-500">Score: {r.score_total ?? 0}</div>
              </div>
              <div className="text-green-700 font-bold">{r.expected_monthly_incentive || 0} ج</div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
