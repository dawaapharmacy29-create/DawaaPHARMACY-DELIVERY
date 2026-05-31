import AppLayout from '@/components/layout/AppLayout';

export default function DeliverySettings() {
  return (
    <AppLayout title="إعدادات الدليفري" subtitle="تدار من جدول delivery_settings في Supabase">
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-right text-sm text-gray-700">
        إعدادات الاعتماد وأسعار الفئات محفوظة في قاعدة البيانات حتى تكون الأسعار snapshot وقت الحساب، ولا تعتمد على قيم ثابتة في الواجهة.
      </div>
    </AppLayout>
  );
}
