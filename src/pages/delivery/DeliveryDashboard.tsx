import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Bike, CheckCircle2, ClipboardList, Plus, Route, ShieldAlert, Trophy, Wallet, Bell } from 'lucide-react';
import { useDeliveryDashboard } from '@/hooks/useDeliveryData';

function MetricCard({ label, value, icon, tone, hint }: { label: string; value: number | string; icon: ReactNode; tone: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>{icon}</div>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-4xl font-black text-slate-950">{value}</div>
      {hint && <div className="mt-2 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function EmptyPanel({ icon, title, body, actionTo, actionLabel }: { icon: ReactNode; title: string; body: string; actionTo: string; actionLabel: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-right shadow-sm">
      <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-600">{icon}</div>
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">{body}</p>
      <Link to={actionTo} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
        {actionLabel}
      </Link>
    </div>
  );
}

export default function DeliveryDashboard() {
  const { data, isLoading, isError } = useDeliveryDashboard();
  const value = (next?: number) => isLoading ? '...' : next || 0;

  return (
    <AppLayout title="Dawaa Delivery" subtitle="لوحة إدارة الدليفري والتوصيل">
      {isError && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">حدث خطأ في بعض إحصائيات الداشبورد، لكن التطبيق سيظل يعمل. راجع إعدادات Supabase لاحقًا.</div>}

      <div className="mb-5 overflow-hidden rounded-[2rem] bg-gradient-to-l from-[#071824] via-[#083645] to-[#0f766e] p-6 text-white shadow-xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <img src="/brand/dawaa-logo.jpeg" alt="Dawaa Delivery" className="h-20 w-20 rounded-3xl bg-white object-contain p-2" />
            <div>
              <div className="text-sm font-semibold text-emerald-200">دليفري صيدليات دواء</div>
              <div className="text-3xl font-black">مركز قيادة الدليفري</div>
              <div className="mt-1 text-sm text-white/70">متابعة مباشرة، أوردرات، مشاوير، مستحقات وحوافز.</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/delivery/rider" className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950">فتح شاشة المندوب</Link>
            <Link to="/delivery/orders" className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white">متابعة الأوردرات</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="الدليفري المتاحين الآن" value={value(data?.availableRiders)} icon={<Bike size={24} />} tone="bg-emerald-50 text-emerald-700" hint="المندوبون النشطون في النظام" />
        <MetricCard label="الخارجين الآن" value={value(data?.activeRuns)} icon={<Route size={24} />} tone="bg-cyan-50 text-cyan-700" hint="خروجات مفتوحة تحتاج متابعة" />
        <MetricCard label="أوردرات اليوم" value={value(data?.todayOrders)} icon={<ClipboardList size={24} />} tone="bg-blue-50 text-blue-700" hint="كل ما تم تسجيله اليوم" />
        <MetricCard label="مشاوير اليوم" value={value(data?.todayInternalTrips)} icon={<CheckCircle2 size={24} />} tone="bg-violet-50 text-violet-700" hint="مشاوير داخلية وفرع/مخزن" />
        <MetricCard label="تحتاج مراجعة" value={value(data?.reviewTrips)} icon={<ShieldAlert size={24} />} tone="bg-amber-50 text-amber-700" hint="GPS/رجوع يدوي/تأخير" />
        <MetricCard label="أوردرات الشهر المسلمة" value={value(data?.deliveredOrders)} icon={<Wallet size={24} />} tone="bg-slate-100 text-slate-700" hint="من يوم 26 حتى الآن" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <EmptyPanel icon={<Route size={22} />} title="الحركة المباشرة" body="عند بدء أول خروجة من شاشة المندوب ستظهر هنا حالة المندوب ومدة الخروج وعدد الأوردرات." actionTo="/delivery/rider" actionLabel="ابدأ تجربة خروجة" />
        <EmptyPanel icon={<Bell size={22} />} title="تنبيهات اليوم" body="أي تأخير، رجوع يدوي، GPS ضعيف أو مشوار يحتاج اعتماد سيظهر هنا فورًا." actionTo="/delivery/notifications" actionLabel="مركز التنبيهات" />
        <EmptyPanel icon={<Trophy size={22} />} title="ترتيب الدليفري" body="بعد تسجيل الأوردرات والمشاوير سنعرض أفضل أداء وحافز كل مندوب المتوقع." actionTo="/delivery/leaderboard" actionLabel="عرض الترتيب" />
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 text-right shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">فترة الحساب الحالية</div>
            <div className="mt-1 text-lg font-bold text-slate-950">{data?.range.label || '...'}</div>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">تبدأ يوم 26</div>
        </div>
      </div>
    </AppLayout>
  );
}
