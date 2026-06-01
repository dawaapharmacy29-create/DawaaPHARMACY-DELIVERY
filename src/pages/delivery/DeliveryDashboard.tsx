import type { ReactNode } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Bike, CheckCircle2, ClipboardList, Route, ShieldAlert, Wallet } from 'lucide-react';
import { useDeliveryDashboard } from '@/hooks/useDeliveryData';

function MetricCard({ label, value, icon, tone }: { label: string; value: number | string; icon: ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

export default function DeliveryDashboard() {
  const { data, isLoading, isError } = useDeliveryDashboard();
  const value = (next?: number) => isLoading ? '...' : next || 0;

  return (
    <AppLayout title="Dawaa Delivery" subtitle="لوحة إدارة الدليفري والتوصيل">
      {isError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">تعذر تحميل بيانات الدليفري.</div>}

      <div className="mb-5 rounded-3xl bg-[#071824] p-5 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <img src="/brand/dawaa-logo.jpeg" alt="Dawaa Delivery" className="h-16 w-16 rounded-2xl bg-white object-contain p-1.5" />
          <div>
            <div className="text-sm text-emerald-200">دليفري صيدليات دواء</div>
            <div className="text-2xl font-bold">نظام إدارة الدليفري والتوصيل</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="الدليفري المتاحين الآن" value={value(data?.availableRiders)} icon={<Bike size={22} />} tone="bg-emerald-50 text-emerald-700" />
        <MetricCard label="الخارجين الآن" value={value(data?.activeRuns)} icon={<Route size={22} />} tone="bg-cyan-50 text-cyan-700" />
        <MetricCard label="أوردرات اليوم" value={value(data?.todayOrders)} icon={<ClipboardList size={22} />} tone="bg-blue-50 text-blue-700" />
        <MetricCard label="مشاوير اليوم" value={value(data?.todayInternalTrips)} icon={<CheckCircle2 size={22} />} tone="bg-violet-50 text-violet-700" />
        <MetricCard label="تحتاج مراجعة" value={value(data?.reviewTrips)} icon={<ShieldAlert size={22} />} tone="bg-amber-50 text-amber-700" />
        <MetricCard label="أوردرات الشهر المسلمة" value={value(data?.deliveredOrders)} icon={<Wallet size={22} />} tone="bg-slate-100 text-slate-700" />
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm">
        <div className="text-sm text-slate-500">فترة الحساب الحالية</div>
        <div className="mt-1 text-lg font-bold text-slate-950">{data?.range.label || '...'}</div>
      </div>
    </AppLayout>
  );
}
