import AppLayout from '@/components/layout/AppLayout';
import { useInvoices, useUpdateInvoiceStatus } from '@/hooks/useSupabaseData';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle, XCircle, Edit } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function PendingReview() {
  const { data: invoices = [], isLoading } = useInvoices();
  const updateStatus = useUpdateInvoiceStatus();
  const { user } = useAuth();

  const pending = invoices.filter(i =>
    i.review_status === 'انتظار مراجعة' || i.review_status === 'يحتاج تعديل'
  );

  const handleAction = (id: string, status: string, enteredBy: string) => {
    updateStatus.mutate({ id, review_status: status, entered_by: enteredBy });
  };

  return (
    <AppLayout title="انتظار المراجعة">
      <div className="flex items-center justify-between mb-6">
        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold">
          {pending.length}
        </div>
        <h2 className="text-right text-gray-500 text-sm">إجمالي الفواتير في انتظار المراجعة</h2>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse h-28" />)}
        </div>
      ) : pending.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">لا توجد فواتير في انتظار المراجعة</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map(inv => {
            const isSameUser = inv.entered_by === user?.id;
            return (
              <div key={inv.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.review_status === 'يحتاج تعديل' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
                      {inv.review_status === 'يحتاج تعديل' ? 'يحتاج تعديل' : 'آجل'}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">{inv.invoice_no}</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {inv.supplierName} • {inv.branchName} • {new Date(inv.date).toLocaleDateString('ar-EG')}
                    </div>
                    {inv.enteredByName && (
                      <div className="text-xs text-gray-400 mt-0.5">أدخلها: {inv.enteredByName}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isSameUser ? (
                      <div className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">
                        لا يمكنك مراجعة فاتورة أدخلتها بنفسك
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleAction(inv.id, 'معتمد', inv.entered_by)}
                          disabled={updateStatus.isPending}
                          className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                        >
                          <CheckCircle size={14} /> اعتماد الفاتورة
                        </button>
                        <button
                          onClick={() => handleAction(inv.id, 'مرفوض', inv.entered_by)}
                          disabled={updateStatus.isPending}
                          className="flex items-center gap-1.5 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                          <XCircle size={14} /> رفض
                        </button>
                        <button
                          onClick={() => handleAction(inv.id, 'يحتاج تعديل', inv.entered_by)}
                          disabled={updateStatus.isPending}
                          className="flex items-center gap-1.5 border border-orange-200 text-orange-600 text-sm px-3 py-2 rounded-lg hover:bg-orange-50 disabled:opacity-50"
                        >
                          <Edit size={14} /> طلب تعديل
                        </button>
                      </>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-gray-900">{fmt(inv.value)}</div>
                    <div className="text-xs text-gray-500">متبقي: {fmt(inv.remaining)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
