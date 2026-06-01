import AppLayout from '@/components/layout/AppLayout';
import { Bike } from 'lucide-react';

export default function RiderConsole() {
  return (
    <AppLayout title="كونسول المندوب" subtitle="واجهة المندوب الميداني">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
          <Bike size={32} className="text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">كونسول المندوب</h2>
        <p className="mt-2 text-sm text-slate-500">هذه الصفحة قيد التطوير</p>
      </div>
    </AppLayout>
  );
}
