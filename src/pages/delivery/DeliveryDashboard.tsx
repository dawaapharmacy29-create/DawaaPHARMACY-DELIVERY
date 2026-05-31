import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import { Bike, CheckCircle2, ClipboardList, Route } from 'lucide-react';
import { useDeliveryDashboard } from '@/hooks/useDeliveryData';

export default function DeliveryDashboard() {
  const { data, isLoading } = useDeliveryDashboard();

  return (
    <AppLayout title="Dawaa Delivery" subtitle="متابعة تشغيل الدليفري للشهر الحالي">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="الخروجات" value={isLoading ? '...' : data?.trips || 0} icon={<Bike size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <StatCard label="أوردرات مسلمة" value={isLoading ? '...' : data?.deliveredOrders || 0} icon={<CheckCircle2 size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
        <StatCard label="بانتظار مراجعة" value={isLoading ? '...' : data?.reviewTrips || 0} icon={<ClipboardList size={18} className="text-amber-600" />} iconBg="bg-amber-100" />
        <StatCard label="مشاوير داخلية" value={isLoading ? '...' : data?.internalTrips || 0} icon={<Route size={18} className="text-violet-600" />} iconBg="bg-violet-100" />
      </div>

      <div className="mt-5 bg-white border border-gray-200 rounded-lg p-4 text-right">
        <div className="text-sm text-gray-500">فترة الحساب الحالية</div>
        <div className="text-lg font-bold text-gray-900 mt-1">{data?.range.label || '...'}</div>
      </div>
    </AppLayout>
  );
}
