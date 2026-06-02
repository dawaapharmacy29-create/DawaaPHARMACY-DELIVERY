import AppLayout from '@/components/layout/AppLayout';
import { Settings } from 'lucide-react';

export default function DeliverySettings() {
  return (
    <AppLayout title="الإعدادات" subtitle="إعدادات نظام الدليفري">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <Settings size={32} className="text-slate-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">الإعدادات</h2>
        <p className="mt-2 text-sm text-slate-500">هذه الصفحة قيد التطوير</p>
      </div>
    </AppLayout>
  );
}
