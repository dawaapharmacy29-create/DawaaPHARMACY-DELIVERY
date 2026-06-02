import { useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { useDeliveryOrders } from '@/hooks/useDeliveryData';
import type { OrderStatus } from '@/types/delivery';

const STATUSES: Array<{ label: string; value?: OrderStatus }> = [
  { label: 'الكل', value: undefined },
  { label: 'قيد التنفيذ', value: 'pending' },
  { label: 'تم التسليم', value: 'delivered' },
  { label: 'مرتجع', value: 'returned' },
  { label: 'ملغى', value: 'cancelled' },
];

export default function DeliveryOrders() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const { data, isLoading } = useDeliveryOrders(page, status);
  const rows = data?.rows || [];
  const pageCount = Math.ceil((data?.count || 0) / (data?.pageSize || 25));

  return (
    <AppLayout title="الأوردرات" subtitle="إدارة أوردرات التوصيل">
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm">
          <div className="text-sm text-slate-500">يمكنك تصفية الأوردرات حسب الحالة والملاحة بين الصفحات.</div>
        </div>
        <div className="flex flex-col gap-2 text-right">
          <label className="text-sm font-medium text-slate-700">حالة الأوردر</label>
          <select
            value={status ?? ''}
            onChange={e => {
              setStatus(e.target.value ? (e.target.value as OrderStatus) : undefined);
              setPage(0);
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-right text-sm"
          >
            {STATUSES.map(item => (
              <option key={item.label} value={item.value ?? ''}>{item.label}</option>
            ))}
          </select>
        </div>
      </div>

      {data?.error && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-right text-sm text-amber-800">تعذر تحميل الأوردرات من Supabase: {data.error}</div>}

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm text-right">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">الفاتورة</th>
              <th className="px-4 py-3">العميل</th>
              <th className="px-4 py-3">المبلغ</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">جاري التحميل...</td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">لا توجد أوردرات حتى الآن. ابدأ من شاشة المندوب وسجل أول خروجة.</td>
              </tr>
            )}
            {rows.map(order => (
              <tr key={order.id} className="border-b last:border-b-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{order.invoice_no}</td>
                <td className="px-4 py-3 text-slate-600">{order.customer_name_snapshot}</td>
                <td className="px-4 py-3 text-slate-600">{order.amount?.toLocaleString('ar-EG')} ج</td>
                <td className="px-4 py-3 capitalize text-slate-700">{order.status}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(order.created_at).toLocaleString('ar-EG')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-slate-500">إجمالي الأوردرات: {data?.count ?? '...'}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(prev => Math.max(prev - 1, 0))}
            disabled={page === 0 || isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft size={16} /> السابق
          </button>
          <button
            onClick={() => setPage(prev => Math.min(prev + 1, Math.max(pageCount - 1, 0)))}
            disabled={page >= pageCount - 1 || isLoading || pageCount === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            التالي <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
