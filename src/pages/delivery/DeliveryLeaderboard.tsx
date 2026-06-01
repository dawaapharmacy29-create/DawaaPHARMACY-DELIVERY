import AppLayout from '@/components/layout/AppLayout';
import { useLeaderboard } from '@/hooks/useDeliveryData';

export default function DeliveryLeaderboard() {
  const { data, isLoading } = useLeaderboard();

  return (
    <AppLayout title="ترتيب الفريق" subtitle="أفضل أداء المندوبين">
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-right">
        {isLoading && <div>جاري التحميل...</div>}
        {!isLoading && data && data.length === 0 && <div className="text-gray-400">لا توجد بيانات</div>}
        <div className="space-y-3">
          {data?.map((r: any, idx: number) => (
            <div key={r.rider_id} className="border rounded-lg p-3 flex justify-between items-center">
              <div>
                <div className="font-bold">{idx + 1}. {r.rider_name || r.rider_id}</div>
                <div className="text-sm text-gray-500">أوردرات مسلمة: {r.delivered_orders || 0}</div>
              </div>
              <div className={`font-bold ${r.score_total >= 90 ? 'text-green-600' : r.score_total >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>{r.score_total || 0}</div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
