import AppLayout from '@/components/layout/AppLayout';

export default function DeliverySettings() {
  return (
    <AppLayout title="إعدادات الدليفري" subtitle="إعدادات التشغيل محفوظة في Supabase">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-950">GPS و Geofence</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            اضبط إحداثيات الفرع ونطاق السماح من جدول delivery_settings. أي GPS ضعيف أو خارج النطاق يدخل review تلقائيًا.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-950">أسعار المستحقات</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            أسعار الفئات محفوظة في قاعدة البيانات وتؤخذ snapshot وقت العملية حتى لا تتغير الحسابات القديمة.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
