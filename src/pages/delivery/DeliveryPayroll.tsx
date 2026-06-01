import AppLayout from '@/components/layout/AppLayout';
import { Wallet } from 'lucide-react';

export default function DeliveryPayroll() {
  return (
    <AppLayout title="الرواتب والحوافز" subtitle="حساب رواتب المندوبين والحوافز">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50">
          <Wallet size={32} className="text-violet-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">الرواتب والحوافز</h2>
        <p className="mt-2 text-sm text-slate-500">هذه الصفحة قيد التطوير</p>
      </div>
    </AppLayout>
  );
}
