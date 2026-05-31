# Dawaa Pharmacy Bills + Dawaa Delivery

تطبيق واحد حاليًا يحتوي نظام فواتير صيدليات دواء، ومعه Dawaa Delivery كجزء منفصل منطقيًا داخل نفس React/Vite app. جزء الدليفري جاهز للفصل لاحقًا كتطبيق مستقل لأن routes والـ SQL والـ hooks الخاصة به مفصولة بأسماء `delivery_`.

## التشغيل

```sh
npm install
npm run dev
```

فحص الإنتاج:

```sh
npm run typecheck
npm run lint
npm run build
```

## Routes

- `/delivery`: لوحة متابعة الدليفري.
- `/delivery/rider`: شاشة المندوب mobile-first.
- `/delivery/orders`: قائمة أوردرات الدليفري بصفحات وفلاتر.
- `/delivery/payroll`: حساب الشهر من يوم 26 إلى يوم 25.
- `/delivery/settings`: مرجع إعدادات الدليفري.

## Environment

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

لا تضع `service_role` في الواجهة أو Vercel client env.

## Supabase Setup

1. شغّل `supabase/schema.sql` من SQL Editor.
2. شغّل `supabase/seed.sql` لإعداد `delivery_settings` الافتراضية.
3. أنشئ المستخدمين من Supabase Auth.
4. تأكد أن كل مستخدم له صف في `user_profiles`.

## Delivery Tables

- `delivery_riders`
- `delivery_customers`
- `delivery_attendance`
- `delivery_trips`
- `delivery_orders`
- `delivery_internal_trips`
- `delivery_payroll_adjustments`
- `delivery_payroll_runs`
- `delivery_settings`
- `delivery_audit_log`

`delivery_trips` تمثل Delivery Run / الخروجة. الخروجة الواحدة تحتوي أكثر من أوردر عبر `delivery_orders.trip_id`. يوجد unique partial index يمنع أكثر من خروجة `active` لنفس المندوب.

## Customers

لا يوجد في هذا المشروع جدول `customers` عام. لذلك `delivery_customers` هو مصدر العملاء الحقيقي للدليفري في مرحلة pilot، وليس نسخة mock أو sync من جدول آخر.

البحث يتم عبر RPC:

```sql
delivery_search_customers(search_text text)
```

القواعد:

- أقل من حرفين يرجع بدون نتائج.
- limit 20.
- البحث في الاسم أو الكود أو الهاتف.
- يرجع `id`, `name`, `customer_code`, `phone`, `address` فقط.
- لا يحمل جدول العملاء كاملًا في الواجهة.
- الأوردر يحفظ snapshot: الاسم، الكود، الهاتف، العنوان.

## GPS / Geofence

عند تسجيل الحضور وبدء/إنهاء الخروجة، الواجهة تطلب GPS وترسله إلى RPC آمنة. الإعدادات في `delivery_settings`:

- `branch_lat`
- `branch_lng`
- `geofence_radius_meters` default 100
- `gps_accuracy_threshold_meters` default 100
- `max_normal_trip_minutes` default 60
- `manual_return_requires_review` default true

إذا GPS مرفوض، ضعيف، خارج النطاق، الفرع غير مضبوط، أو مدة الخروجة أطول من الطبيعي، تدخل الخروجة review.

## Payroll

الفئات الافتراضية:

- senior: ساعة 23، أوردر 10، مشوار 4
- mid: ساعة 21.5، أوردر 8، مشوار 4
- junior: ساعة 19.25، أوردر 6، مشوار 3

القواعد:

- الفترة من يوم 26 إلى يوم 25.
- يوم 1 إلى 25 يتبع فترة بدأت يوم 26 من الشهر السابق.
- يوم 26 إلى آخر الشهر يتبع فترة بدأت يوم 26 من نفس الشهر.
- الأوردرات المحسوبة `delivered` فقط.
- المشاوير الداخلية المحسوبة `approved` أو `completed` فقط.
- الأسعار snapshot.
- `net_total = hours + orders + trips + bonuses - deductions`.
- payroll يعرض pending review / unapproved trips / failed orders، ولا يعتبر قابلًا للاعتماد إذا توجد review أو trips غير معتمدة.

## أول Admin

بعد إنشاء المستخدم:

```sql
update user_profiles
set role = 'admin', status = 'نشط'
where email = 'admin@example.com';
```

## إضافة Rider

أنشئ صفًا في `delivery_riders` مربوطًا بـ `user_profiles.id`:

```sql
insert into delivery_riders (
  user_id,
  branch_id,
  display_name,
  phone,
  tier,
  hourly_rate,
  order_rate,
  internal_trip_rate
)
values (
  '<profile-id>',
  '<branch-id>',
  'اسم المندوب',
  '01000000000',
  'junior',
  19.25,
  6,
  3
);
```

## RLS Test

اختبر بثلاثة مستخدمين:

- rider: يرى خروجاته وأوردراته فقط، ولا يغير settings أو payroll، ويستخدم `delivery_search_customers` بنتائج محدودة.
- shift_manager: يرى ويعتمد بيانات فرعه فقط.
- admin: يرى الكل، يدير settings/payroll، ويرى `delivery_audit_log`.

اختبارات SQL مقترحة:

```sql
select * from delivery_search_customers('01');
select * from delivery_calculate_payroll(delivery_period_start(current_date), delivery_period_end(current_date));
```

نفّذها من جلسات مستخدمين مختلفة عبر التطبيق أو Supabase client وليس service role.

## Flow Pilot

1. Admin يضيف rider ويضبط `delivery_settings.branch_lat/branch_lng`.
2. Rider يسجل دخول.
3. Rider يسجل حضور مع GPS.
4. Rider يبدأ خروجة.
5. Rider يبحث عن عميل ويختاره.
6. يظهر الكود والهاتف والعنوان.
7. Rider يدخل رقم فاتورة.
8. Rider يضيف أوردر.
9. Rider يسجل delivered.
10. Rider يحاول فتح خروجة ثانية، فيتم منعه.
11. Rider يسجل رجوع.
12. إذا GPS خارج النطاق أو ضعيف تدخل الخروجة review.
13. Rider يسجل مشوار داخلي.
14. shift_manager/admin يعتمده.
15. Admin يضيف bonus/deduction.
16. Payroll يعكس `net_total`.
17. `delivery_audit_log` يسجل العمليات الحساسة.

## PWA

يوجد manifest وservice worker وoffline fallback. لا توجد offline writes في هذه المرحلة، حتى لا نخزن عمليات دليفري حساسة في queue غير مصمم.

## Vercel

- Build command: `npm run build`
- Output: `dist`
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Pilot Notes

ابدأ بفرع واحد ومندوب أو اثنين. اضبط geofence للفرع أولًا. راقب `delivery_audit_log` و`review` يوميًا قبل اعتماد payroll.
