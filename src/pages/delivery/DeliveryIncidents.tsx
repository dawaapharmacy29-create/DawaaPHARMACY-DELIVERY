import AppLayout from '@/components/layout/AppLayout';
import { useDeliveryIncidents, useUpdateDeliveryIncidentStatus } from '@/hooks/useDeliveryData';

const statusClasses: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800',
  under_review: 'bg-sky-100 text-sky-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  dismissed: 'bg-slate-100 text-slate-800',
};

export default function DeliveryIncidents() {
  const { data, isLoading } = useDeliveryIncidents();
  const updateStatus = useUpdateDeliveryIncidentStatus();

  return (
    <AppLayout title="الأخطاء والمراجعات" subtitle="قائمة الحوادث والمراجعات">
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-right">
        {isLoading && <div>جاري التحميل...</div>}
        {!isLoading && data && data.length === 0 && <div className="text-gray-400">لا توجد حوادث</div>}
        <div className="space-y-3">
          {data?.map((inc: any) => (
            <div key={inc.id} className="rounded-3xl border border-slate-200 p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-bold text-slate-900">{inc.category || 'حادثة'}</div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[inc.status] ?? 'bg-slate-100 text-slate-800'}`}>{inc.status || 'open'}</span>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{inc.description}</div>
                  <div className="mt-2 text-xs text-slate-500">تاريخ الإبلاغ: {new Date(inc.created_at).toLocaleString('ar-EG')}</div>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <div className="text-xs text-slate-500">شدة: {inc.severity || 'غير محددة'}</div>
                  {inc.status !== 'resolved' && (
                    <button
                      onClick={() => updateStatus.mutate({ id: inc.id, status: inc.status === 'under_review' ? 'resolved' : 'under_review' })}
                      disabled={updateStatus.isPending}
                      className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                      {inc.status === 'under_review' ? 'حل الحادثة' : 'وضع تحت المراجعة'}
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
