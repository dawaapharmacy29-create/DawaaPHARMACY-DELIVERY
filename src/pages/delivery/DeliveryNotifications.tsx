import { useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { useDeliveryNotifications, useMarkDeliveryNotificationRead } from '@/hooks/useDeliveryData';

export default function DeliveryNotifications() {
  const { data, isLoading } = useDeliveryNotifications();
  const markRead = useMarkDeliveryNotificationRead();
  const unreadCount = useMemo(() => data?.filter((n: any) => !n.is_read).length || 0, [data]);

  return (
    <AppLayout title="التنبيهات" subtitle="جميع التنبيهات">
      <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-gray-200 bg-white p-4 text-right shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm text-slate-500">عدد التنبيهات غير المقروءة</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{unreadCount}</div>
        </div>
        <button
          onClick={() => data?.filter((n: any) => !n.is_read).forEach(n => markRead.mutate(n.id))}
          disabled={unreadCount === 0 || markRead.isPending}
          className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          تعليم الكل كمقروء
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 text-right">
        {isLoading && <div>جاري التحميل...</div>}
        {!isLoading && data && data.length === 0 && <div className="text-gray-400">لا توجد تنبيهات</div>}
        <div className="space-y-3">
          {data?.map((n: any) => (
            <div key={n.id} className={`rounded-2xl border p-4 transition ${n.is_read ? 'border-slate-200 bg-slate-50' : 'border-emerald-300 bg-emerald-50'}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900">{n.category || 'تنبيه'}</div>
                  <div className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{JSON.stringify(n.payload)}</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{new Date(n.created_at).toLocaleString('ar-EG')}</span>
                  {!n.is_read && (
                    <button
                      onClick={() => markRead.mutate(n.id)}
                      disabled={markRead.isPending}
                      className="rounded-full border border-emerald-600 bg-white px-3 py-1 text-emerald-700"
                    >
                      تعليم كمقروء
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
