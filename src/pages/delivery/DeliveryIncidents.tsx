import AppLayout from '@/components/layout/AppLayout';
import { useDeliveryIncidents } from '@/hooks/useDeliveryData';

export default function DeliveryIncidents() {
  const { data, isLoading } = useDeliveryIncidents();

  return (
    <AppLayout title="الأخطاء والمراجعات" subtitle="قائمة الحوادث والمراجعات">
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-right">
        {isLoading && <div>جاري التحميل...</div>}
        {!isLoading && data && data.length === 0 && <div className="text-gray-400">لا توجد حوادث</div>}
        <div className="space-y-3">
          {data?.map((inc: any) => (
            <div key={inc.id} className="border rounded-lg p-3">
              <div className="font-bold">{inc.category} - {inc.severity}</div>
              <div className="text-sm text-gray-500">{inc.description}</div>
              <div className="text-xs text-gray-400">{inc.status}</div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
