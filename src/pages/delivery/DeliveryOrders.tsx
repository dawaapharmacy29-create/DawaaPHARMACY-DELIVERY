import AppLayout from '@/components/layout/AppLayout';
import { ClipboardList } from 'lucide-react';

export default function DeliveryOrders() {
  return (
    <AppLayout title="الأوردرات" subtitle="إدارة أوردرات التوصيل">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
          <ClipboardList size={32} className="text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">الأوردرات</h2>
        <p className="mt-2 text-sm text-slate-500">هذه الصفحة قيد التطوير</p>
      </div>
    </AppLayout>
  );
}
