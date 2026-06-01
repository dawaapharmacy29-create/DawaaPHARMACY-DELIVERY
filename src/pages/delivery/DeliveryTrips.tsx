import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { usePendingDeliveryTrips, useApproveTrip, useRejectTrip } from '@/hooks/useDeliveryData';

export default function DeliveryTrips() {
  const { data: trips, isLoading } = usePendingDeliveryTrips();
  const approve = useApproveTrip();
  const reject = useRejectTrip();
  const [rejectReason, setRejectReason] = useState('');

  return (
    <AppLayout title="مشاوير - إدارة" subtitle="اعتمد أو رفض المشاوير المعلقة">
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-right">
        <h2 className="font-bold mb-3">المشاوير المعلقة للموافقة</h2>
        {isLoading && <div>جاري التحميل...</div>}
        {!isLoading && trips && trips.length === 0 && <div className="text-gray-400">لا توجد مشاوير معلقة</div>}
        <div className="space-y-3">
          {trips?.map((t: any) => (
            <div key={t.id} className="border rounded-lg p-3">
              <div className="flex justify-between items-start gap-3">
                <div className="text-right">
                  <div className="font-bold">{t.trip_type} - {t.rider_id}</div>
                  <div className="text-sm text-gray-500">من: {t.origin ? JSON.stringify(t.origin) : '-'} إلى: {t.destination ? JSON.stringify(t.destination) : '-'}</div>
                  <div className="text-xs text-gray-400">{t.reason}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => approve.mutate(t.id)} disabled={approve.isPending} className="bg-emerald-600 text-white px-3 py-2 rounded">اعتماد</button>
                  <button onClick={() => {
                    const reason = prompt('سبب الرفض (اختياري)') || '';
                    reject.mutate({ id: t.id, reason });
                  }} disabled={reject.isPending} className="bg-red-500 text-white px-3 py-2 rounded">رفض</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
