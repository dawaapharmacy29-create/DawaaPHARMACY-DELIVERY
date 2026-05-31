# Dawaa Pharmacy Bills + Dawaa Delivery

تطبيق React/Vite لإدارة فواتير صيدليات دواء، مع إضافة مستقلة لتشغيل الدليفري مرتبطة بـ Supabase.

## التشغيل المحلي

```sh
npm install
npm run dev
```

للفحص قبل النشر:

```sh
npm run typecheck
npm run lint
npm run build
```

> ملاحظة: سكريبت البناء يستخدم `scripts/build.mjs` لأنه يستدعي Vite بإعداد inline لتفادي مشكلة Windows/OneDrive مع تحميل ملف `vite.config`.

## متغيرات البيئة

أنشئ ملف `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

لا تضع `service_role` في الواجهة أو في Vercel client env. مفتاح الخدمة يستخدم فقط من بيئة server آمنة عند الحاجة.

## إعداد Supabase

1. افتح Supabase SQL Editor.
2. شغّل `supabase/schema.sql`.
3. شغّل `supabase/seed.sql` للإعدادات الافتراضية.
4. فعّل Authentication بالبريد وكلمة المرور أو OTP حسب طريقة التشغيل.
5. تأكد من وجود صف في `user_profiles` لكل مستخدم مسجل.

جداول الدليفري المضافة:

- `delivery_riders`
- `delivery_customers`
- `delivery_attendance`
- `delivery_trips`
- `delivery_orders`
- `delivery_internal_trips`
- `delivery_payroll_adjustments`
- `delivery_payroll_runs`
- `delivery_settings`

كل جداول `delivery_` عليها RLS. السياسات تقسم الوصول كالتالي:

- `admin` يرى كل الفروع.
- `shift_manager` يرى فرعه فقط.
- `rider` يرى بياناته وخروجاته وأوردراته فقط.

## إنشاء أول Admin

1. سجّل أول مستخدم من صفحة الدخول.
2. من Supabase SQL Editor حدّث صفه في `user_profiles`:

```sql
update user_profiles
set role = 'admin', status = 'نشط'
where email = 'admin@example.com';
```

3. اربط المستخدم بفرع عند الحاجة عبر `branch_id`.

## إعداد Vercel

1. اربط المستودع بمشروع Vercel.
2. أضف المتغيرات:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Build command:

```sh
npm run build
```

4. Output directory:

```sh
dist
```

## اختبار Flow كامل للدليفري

1. أنشئ مستخدم admin ومستخدم rider في Supabase Auth.
2. أضف صفًا للمندوب في `delivery_riders` مربوطًا بـ `user_profiles.id`.
3. أضف عملاء حقيقيين في `delivery_customers` مع `customer_code`, `phone`, `address`.
4. ادخل كمندوب وافتح `كونسول المندوب`.
5. سجّل الحضور.
6. ابدأ خروجة.
7. أضف أوردر برقم فاتورة إلزامي وعميل حقيقي.
8. سلّم الأوردر.
9. أضف أكثر من أوردر لنفس الخروجة للتأكد من عدم غلقها بعد أول أوردر.
10. جرّب بدء خروجة ثانية قبل إنهاء الأولى؛ يجب أن يمنعها القيد `delivery_one_active_trip_per_rider`.
11. أنهِ الخروجة بسبب رجوع يدوي؛ يجب أن تدخل `review`.
12. سجّل مشوار داخلي؛ حالته تعتمد على `delivery_settings.internal_trip_requires_approval`.
13. افتح حساب الدليفري وتأكد أن الفترة من يوم 26 إلى يوم 25.

## الحساب الشهري

الفئات الافتراضية محفوظة في `delivery_settings` و`delivery_riders`:

- senior: الساعة 23، الأوردر 10، المشوار الداخلي 4
- mid: الساعة 21.5، الأوردر 8، المشوار الداخلي 4
- junior: الساعة 19.25، الأوردر 6، المشوار الداخلي 3

دالة `delivery_calculate_payroll` تحتسب:

- الشهر من 26 إلى 25.
- الأوردرات بحالة `delivered` فقط.
- المشاوير الداخلية بحالة `approved` أو `completed` فقط.
- أسعار snapshot من وقت تسجيل الحضور/الأوردر/المشوار.
- المكافآت والخصومات من `delivery_payroll_adjustments` ضمن `net_total`.
