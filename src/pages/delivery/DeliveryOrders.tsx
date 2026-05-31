import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { useDeliveryOrders } from '@/hooks/useDeliveryData';
import type { OrderStatus } from '@/types/delivery';

export default function DeliveryOrders() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const { data, isLoading } = useDeliveryOrders(page, status);
  const rows = data?.rows || [];

  return (
    <AppLayout title="أوردرات الدليفري" subtitle="قائمة مقسمة بصفحات وفلاتر بسيطة">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap gap-2 justify-end mb-3">
          {(['delivered', 'pending', 'returned', 'cancelled'] as OrderStatus[]).map(item => (
            <button key={item} onClick={() => { setStatus(item); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-sm ${status === item ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{item}</button>
          ))}
          <button onClick={() => setStatus(undefined)} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700">الكل</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-500">
              <tr><th className="p-2">الفاتورة</th><th className="p-2">العميل</th><th className="p-2">التليفون</th><th className="p-2">العنوان</th><th className="p-2">الحالة</th></tr>
            </thead>
            <tbody>
              {rows.map((order: any) => (
                <tr key={order.id} className="border-t">
                  <td className="p-2 font-medium">{order.invoice_no}</td>
                  <td className="p-2">{order.customer_code_snapshot} - {order.customer_name_snapshot}</td>
                  <td className="p-2">{order.customer_phone_snapshot}</td>
                  <td className="p-2">{order.customer_address_snapshot}</td>
                  <td className="p-2">{order.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && rows.length === 0 && <div className="text-center text-gray-400 py-6">لا توجد نتائج</div>}
        </div>
        <div className="flex justify-between items-center mt-3 text-sm">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg bg-gray-100 disabled:text-gray-300">السابق</button>
          <span className="text-gray-500">صفحة {page + 1}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={rows.length < (data?.pageSize || 25)} className="px-3 py-1.5 rounded-lg bg-gray-100 disabled:text-gray-300">التالي</button>
        </div>
      </div>
    </AppLayout>
  );
}
