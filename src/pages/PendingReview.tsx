import AppLayout from '@/components/layout/AppLayout';
import { invoices } from '@/data/mockData';
import { Clock, CheckCircle, XCircle, Flag, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function PendingReview() {
  const pending = invoices.filter(i => i.reviewStatus === 'انتظار مراجعة' || i.reviewStatus === 'يحتاج تعديل');

  return (
    <AppLayout title="انتظار المراجعة">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
          <Clock size={16} className="text-amber-600" />
        </div>
        <span className="text-2xl font-bold text-gray-800">انتظار المراجعة</span>
        <span className="bg-amber-100 text-amber-700 text-sm font-bold px-2.5 py-0.5 rounded-full">{pending.length}</span>
      </div>

      <div className="space-y-4">
        {pending.map(inv => (
          <div key={inv.id} className={`bg-white rounded-xl border shadow-sm p-5 ${inv.reviewStatus === 'يحتاج تعديل' ? 'border-orange-200' : 'border-gray-100'}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {inv.reviewStatus === 'يحتاج تعديل' && (
                  <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">يحتاج تعديل</span>
                )}
                {inv.reviewStatus === 'انتظار مراجعة' && (
                  <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">آجل</span>
                )}
              </div>
              <div className="text-right">
                <div className="font-bold text-gray-900 text-base">{inv.invoiceNo}</div>
                <div className="text-sm text-gray-500">{inv.supplier} • {inv.branch} • {inv.date}</div>
                <div className="text-xs text-gray-400 mt-0.5">أدخلها: {inv.enteredBy}</div>
              </div>
            </div>

            <div className="flex items-end justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toast.success(`تم اعتماد ${inv.invoiceNo}`)}
                  className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600"
                >
                  <CheckCircle size={15} /> اعتماد الفاتورة
                </button>
                <button
                  onClick={() => toast.error(`تم رفض ${inv.invoiceNo}`)}
                  className="flex items-center gap-1.5 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg hover:bg-red-50"
                >
                  <XCircle size={15} /> رفض
                </button>
                <button
                  onClick={() => toast.info('تم إرسال طلب التعديل')}
                  className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
                >
                  <Flag size={15} /> طلب تعديل
                </button>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{fmt(inv.value)}</div>
                <div className="text-sm text-gray-500">متبقي: {fmt(inv.remaining)}</div>
              </div>
            </div>
          </div>
        ))}

        {pending.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <CheckCircle size={48} className="text-emerald-400 mx-auto mb-3" />
            <p className="text-gray-500">لا توجد فواتير تنتظر المراجعة</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
