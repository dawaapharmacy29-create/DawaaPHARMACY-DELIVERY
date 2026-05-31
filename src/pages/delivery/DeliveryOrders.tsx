import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { useDeliveryOrders } from '@/hooks/useDeliveryData';
import type { OrderStatus } from '@/types/delivery';

const statuses: { value?: OrderStatus; label: string }[] = [
  { label: 'الكل' },
  { value: 'pending', label: 'قيد التوصيل' },
  { value: 'delivered', label: 'تم التسليم' },
  { value: 'returned', label: 'مرتجع' },
  { value: 'cancelled', label: 'ملغي' },
];

export default function DeliveryOrders() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const { data, isLoading, isError } = useDeliveryOrders(page, status);
  const rows = data?.rows || [];

  return (
    <AppLayout title="أوردرات الدليفري" subtitle="متابعة الأوردرات بصفحات وفلاتر">
      <div className="mb-4 flex flex-wrap gap-2">
        {statuses.map(item => (
          <button
            key={item.label}
            onClick={() => { setStatus(item.value); setPage(0); }}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${status === item.value ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">تعذر تحميل الأوردرات.</div>}
      {isLoading && <div className="rounded-2xl bg-white p-5 text-slate-500 shadow-sm">جاري التحميل...</div>}

      <div className="grid gap-3 lg:hidden">
        {rows.map((order: any) => (
          <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold text-slate-950">{order.invoice_no}</div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{order.status}</div>
            </div>
            <div className="mt-2 text-sm text-slate-600">{order.customer_code_snapshot} - {order.customer_name_snapshot}</div>
            <div className="mt-1 text-xs text-slate-400">{order.customer_phone_snapshot} - {order.customer_address_snapshot}</div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 text-slate-500">
            <tr><th className="p-3">الفاتورة</th><th className="p-3">العميل</th><th className="p-3">الهاتف</th><th className="p-3">العنوان</th><th className="p-3">الحالة</th></tr>
          </thead>
          <tbody>
            {rows.map((order: any) => (
              <tr key={order.id} className="border-t border-slate-100">
                <td className="p-3 font-bold">{order.invoice_no}</td>
                <td className="p-3">{order.customer_code_snapshot} - {order.customer_name_snapshot}</td>
                <td className="p-3">{order.customer_phone_snapshot}</td>
                <td className="p-3">{order.customer_address_snapshot}</td>
                <td className="p-3">{order.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isLoading && rows.length === 0 && <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">لا توجد أوردرات لهذا الفلتر.</div>}

      <div className="mt-4 flex items-center justify-between text-sm">
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold disabled:text-slate-300">السابق</button>
        <span className="text-slate-500">صفحة {page + 1}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={rows.length < (data?.pageSize || 25)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold disabled:text-slate-300">التالي</button>
      </div>
    </AppLayout>
  );
}
