import AppLayout from '@/components/layout/AppLayout';
import { useDeliveryNotifications } from '@/hooks/useDeliveryData';

export default function DeliveryNotifications() {
  const { data, isLoading } = useDeliveryNotifications();

  return (
    <AppLayout title="التنبيهات" subtitle="جميع التنبيهات">
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-right">
        {isLoading && <div>جاري التحميل...</div>}
        {!isLoading && data && data.length === 0 && <div className="text-gray-400">لا توجد تنبيهات</div>}
        <div className="space-y-3">
          {data?.map((n: any) => (
            <div key={n.id} className="border rounded-lg p-3">
              <div className="font-bold">{n.category}</div>
              <div className="text-sm text-gray-500">{JSON.stringify(n.payload)}</div>
              <div className="text-xs text-gray-400">{new Date(n.created_at).toLocaleString('ar-EG')}</div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
