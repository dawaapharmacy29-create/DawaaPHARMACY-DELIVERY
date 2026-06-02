import { useMemo, useState } from 'react';
import { Settings, ShieldCheck, Clock3 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { deliveryMonthRange } from '@/hooks/useDeliveryData';

export default function DeliverySettings() {
  const [anchor, setAnchor] = useState(new Date());
  const range = useMemo(() => deliveryMonthRange(anchor), [anchor]);

  return (
    <AppLayout title="الإعدادات" subtitle="إعدادات نظام الدليفري">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm text-right">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Settings size={24} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">الإعدادات العامة</h3>
              <p className="text-sm text-slate-500">تعرض هذه الصفحة مفاتيح النظام والوقت الحالي لحساب الدليفري.</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">فترة الحساب الحالية</div>
              <div className="mt-2 font-semibold text-slate-900">{range.label}</div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">الوقت الآن</div>
              <div className="mt-2 font-semibold text-slate-900">{new Date().toLocaleString('ar-EG')}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button onClick={() => setAnchor(new Date())} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              تحديث الفترة إلى الآن
            </button>
            <button onClick={() => setAnchor(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, prev.getDate()))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900">
              عرض الفترة السابقة
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm text-right">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">أمان وسياسة</h3>
              <p className="text-sm text-slate-500">تُدار أذونات الدليفري وقواعد RLS من قاعدة البيانات وSupabase functions.</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">طريقة تسجيل الدخول</div>
              <div className="mt-2 font-semibold text-slate-900">PKCE + جلسة مثبتة</div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">سجل تدقيق الدليفري</div>
              <div className="mt-2 font-semibold text-slate-900">يُسجل تلقائيًا لكل إجراء رئيسي</div>
            </div>
          </div>

          <div className="mt-6 text-sm text-slate-500">
            يمكنك تعديل إعدادات الدليفري المتقدمة في ملف SQL من خلال `supabase/new-project/10_product_upgrade.sql`.
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
