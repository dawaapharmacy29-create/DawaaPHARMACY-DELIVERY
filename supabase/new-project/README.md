# Dawaa Delivery Supabase Setup

## المطلوب

- مشروع Supabase جديد مستقل.
- استخدم `anon` فقط في الواجهة.
- لا تعتمد على جداول قديمة.
- لا تستخدم `service_role` في الواجهة.
- البيانات التجريبية مستقلة في ملف `05_seed_demo_data.sql`.

## خطوات الإعداد

1. أنشئ مشروع Supabase جديد.
   - Project URL: `https://qlugjplnnkjzxcbhwopg.supabase.co`
   - تأكد من تفعيل `Email` في إعدادات Auth.

2. ضَع المتغيرات التالية في Vercel وملف `.env.local`:
   - `VITE_SUPABASE_URL=https://qlugjplnnkjzxcbhwopg.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY`

3. نفّذ SQL بالترتيب التالي من داخل لوحة Supabase أو عبر CLI:
   1. `supabase/new-project/01_core_schema.sql`
   2. `supabase/new-project/02_functions.sql`
   3. `supabase/new-project/03_rls_policies.sql`

4. أنشئ مستخدم Auth في Supabase Dashboard:
   - Email: `dr.moaz@dawaa-delivery.local`
   - Password: `9493`
   - Confirm email: enabled

5. شغّل ملف seed admin:
   - افتح `supabase/new-project/04_seed_admin.sql`
   - استبدل `<auth-user-id>` بقيمة `user id` التي حصلت عليها بعد إنشاء المستخدم
   - نفّذ الملف.

6. اختياري: شغّل بيانات العرض من `supabase/new-project/05_seed_demo_data.sql`.
   - هذا الملف يضيف فرعين، 3 مندوبين، و10 عملاء للتجربة.

7. جرب تسجيل الدخول من التطبيق:
   - Username: `DR.MOAZ`
   - Password: `9493`

## ملاحظات مهمة

- تم تعديل واجهة تسجيل الدخول لتستخدم `delivery_resolve_login` بدلاً من البحث المباشر في `user_profiles`.
- لا تستخدم `service_role` في الكود أو في متغيرات بيئة Vercel.
- الحساب الأول يُربط إلى `user_profiles` و `delivery_login_aliases` لدعم اسم المستخدم.

## نظام الأداء والحوافز والتنبيهات (جديد)

هذا المشروع يتضمن الآن نظامًا متكاملًا لتقييم أداء مندوبين التوصيل وحساب الحوافز وتنبيه المشكلات تلقائيًا.

- جداول جديدة: `delivery_performance_scores`, `delivery_incentive_rules`, `delivery_incentive_events`, `delivery_notifications`, `delivery_leaderboard_snapshots`.
- دوال: `delivery_compute_monthly_score`, `calculate_rider_incentive`, plus triggers to auto-create incidents/notifications.
- قواعد RLS محدثة: `rider` يرى بياناته فقط، `shift_manager` يرى فرعه، `admin` يرى الكل.

الخطوات لتشغيل النظام الإضافي:

1. شغّل SQL بالترتيب السابق (01..03)، ثم:
   - `supabase/new-project/06_performance_schema.sql`
   - `supabase/new-project/07_triggers_functions.sql`
   - `supabase/new-project/08_seed_incentive_rules.sql`

2. تأكد من إنشاء حساب `dr.moaz@dawaa-delivery.local` كما في الخطوات السابقة ثم شغل `04_seed_admin.sql` بعد استبدال `<auth-user-id>`.

ملاحظات تشغيل:
- لا تُستخدم مفاتيح `service_role` في الواجهة.
- جميع القواعد التحسسية والإشعارات تُنشأ كسجلات في قواعد البيانات ويمكن عرضها داخل التطبيق.
- راجع جدول `delivery_incentive_rules` لإضافة/تعديل قواعد المكافآت والخصومات.

للمزيد من التفاصيل حول طريقة الحساب والواجهات، راجع قسم README الأساسي للتطبيق.
