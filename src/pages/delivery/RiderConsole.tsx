import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import {
  useActiveDeliveryTrip,
  useAddDeliveryOrder,
  useCreateInternalTrip,
  useDeliveryCustomers,
  useEndDeliveryTrip,
  useStartAttendance,
  useStartDeliveryTrip,
  useUpdateDeliveryOrderStatus,
} from '@/hooks/useDeliveryData';
import type { DeliveryCustomer } from '@/types/delivery';

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  return online;
}

export default function RiderConsole() {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<DeliveryCustomer | null>(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [amount, setAmount] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [internalReason, setInternalReason] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const online = useOnlineStatus();

  const attendance = useStartAttendance();
  const startTrip = useStartDeliveryTrip();
  const activeTrip = useActiveDeliveryTrip();
  const customers = useDeliveryCustomers(debouncedSearch);
  const addOrder = useAddDeliveryOrder();
  const updateOrder = useUpdateDeliveryOrderStatus();
  const endTrip = useEndDeliveryTrip();
  const internalTrip = useCreateInternalTrip();

  const trip = activeTrip.data;
  const orders = useMemo(() => trip?.delivery_orders || [], [trip]);

  const handleAddOrder = async () => {
    if (!trip || !selectedCustomer || addOrder.isPending) return;
    await addOrder.mutateAsync({
      trip_id: trip.id,
      rider_id: trip.rider_id,
      customer_id: selectedCustomer.id,
      invoice_no: invoiceNo,
      amount: Number(amount || 0),
    });
    setInvoiceNo('');
    setAmount('');
    setSearch('');
    setSelectedCustomer(null);
  };

  return (
    <AppLayout title="كونسول المندوب" subtitle="الحضور، الخروجة، وإضافة الأوردرات">
      {!online && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-right text-sm text-amber-800">
          لا يوجد اتصال بالإنترنت. الحفظ متوقف حتى يعود الاتصال.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-white border border-gray-200 rounded-lg p-4 text-right">
          <h2 className="font-bold text-gray-900 mb-3">الحضور والخروجة</h2>
          <div className="space-y-2">
            <button onClick={() => attendance.mutate()} disabled={!online || attendance.isPending} className="w-full bg-gray-900 disabled:bg-gray-300 text-white rounded-lg px-4 py-4 text-base font-bold">
              تسجيل الحضور
            </button>
            <button onClick={() => startTrip.mutate()} disabled={!online || Boolean(trip) || startTrip.isPending} className="w-full bg-emerald-600 disabled:bg-gray-300 text-white rounded-lg px-4 py-4 text-base font-bold">
              بدء خروجة
            </button>
          </div>
          <div className="mt-4 text-sm text-gray-600">{trip ? 'يوجد خروجة نشطة الآن' : 'لا توجد خروجة نشطة'}</div>
          {trip?.needs_review && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{trip.review_reason || 'تحتاج مراجعة'}</div>}
        </section>

        <section className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-4 text-right">
          <h2 className="font-bold text-gray-900 mb-3">إضافة أوردر</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={search} onChange={e => { setSearch(e.target.value); setSelectedCustomer(null); }} placeholder="ابحث بالكود أو الاسم أو الهاتف" className="border border-gray-200 rounded-lg px-3 py-3 text-base text-right" />
            <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="رقم الفاتورة إجباري" className="border border-gray-200 rounded-lg px-3 py-3 text-base text-right" />
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" placeholder="قيمة اختيارية" className="border border-gray-200 rounded-lg px-3 py-3 text-base text-right" />
          </div>

          {debouncedSearch.trim().length === 1 && <div className="mt-2 text-sm text-gray-500">اكتب حرفين على الأقل للبحث.</div>}
          {customers.isLoading && <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">جاري البحث...</div>}
          {customers.isError && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">تعذر البحث عن العملاء.</div>}

          {customers.data && customers.data.length > 0 && !selectedCustomer && (
            <div className="mt-3 border border-gray-100 rounded-lg divide-y max-h-56 overflow-y-auto">
              {customers.data.map(customer => (
                <button key={customer.id} onClick={() => setSelectedCustomer(customer)} className="w-full p-3 text-right hover:bg-gray-50">
                  <div className="font-medium text-gray-900">{customer.customer_code} - {customer.name}</div>
                  <div className="text-xs text-gray-500">{customer.phone} - {customer.address}</div>
                </button>
              ))}
            </div>
          )}

          {selectedCustomer && (
            <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm">
              <div className="font-bold text-emerald-900">{selectedCustomer.customer_code} - {selectedCustomer.name}</div>
              <div className="text-emerald-800">{selectedCustomer.phone} - {selectedCustomer.address}</div>
            </div>
          )}

          <button onClick={handleAddOrder} disabled={!online || !trip || !selectedCustomer || !invoiceNo.trim() || addOrder.isPending} className="mt-3 w-full md:w-auto bg-emerald-600 disabled:bg-gray-300 text-white rounded-lg px-5 py-4 text-base font-bold">
            إضافة الأوردر للخروجة
          </button>
        </section>
      </div>

      <section className="mt-4 bg-white border border-gray-200 rounded-lg p-4 text-right">
        <h2 className="font-bold text-gray-900 mb-3">أوردرات الخروجة الحالية</h2>
        <div className="space-y-2">
          {orders.map((order: any) => (
            <div key={order.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-gray-900">{order.invoice_no}</div>
                  <div className="text-sm text-gray-500">{order.customer_code_snapshot} - {order.customer_phone_snapshot}</div>
                  <div className="text-xs text-gray-400">{order.customer_address_snapshot}</div>
                </div>
                <button disabled={!online || updateOrder.isPending || order.status === 'delivered'} onClick={() => updateOrder.mutate({ id: order.id, status: 'delivered' })} className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 disabled:text-gray-300">
                  تم التسليم
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">الحالة: {order.status}</div>
            </div>
          ))}
          {orders.length === 0 && <div className="text-center text-gray-400 py-6">لا توجد أوردرات بعد</div>}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-gray-200 rounded-lg p-4 text-right">
          <h2 className="font-bold text-gray-900 mb-3">إنهاء الخروجة</h2>
          <textarea value={manualReason} onChange={e => setManualReason(e.target.value)} placeholder="سبب الرجوع اليدوي إن وجد" className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base text-right" />
          <button onClick={() => trip && endTrip.mutate({ tripId: trip.id, manualReason: manualReason.trim() || undefined })} disabled={!online || !trip || endTrip.isPending} className="mt-2 w-full bg-gray-900 disabled:bg-gray-300 text-white rounded-lg px-4 py-4 text-base font-bold">
            إنهاء الخروجة
          </button>
        </section>
        <section className="bg-white border border-gray-200 rounded-lg p-4 text-right">
          <h2 className="font-bold text-gray-900 mb-3">مشوار داخلي</h2>
          <input value={internalReason} onChange={e => setInternalReason(e.target.value)} placeholder="سبب المشوار" className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base text-right" />
          <button onClick={() => internalTrip.mutate({ reason: internalReason })} disabled={!online || !internalReason.trim() || internalTrip.isPending} className="mt-2 w-full bg-blue-600 disabled:bg-gray-300 text-white rounded-lg px-4 py-4 text-base font-bold">
            تسجيل المشوار
          </button>
        </section>
      </div>
    </AppLayout>
  );
}
