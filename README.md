# Dawaa Delivery

دليفري صيدليات دواء هو تطبيق React/Vite مرتبط بـ Supabase لإدارة الدليفري، الخروجات، الأوردرات، المشاوير، والمستحقات. التطبيق موجود حاليًا داخل نفس المشروع، لكن جزء الدليفري مفصول منطقيًا عبر routes وhooks وجداول تبدأ بـ `delivery_`.

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

- `/login`: تسجيل الدخول.
- `/delivery`: لوحة الإدارة.
- `/delivery/rider`: شاشة المندوب.
- `/delivery/orders`: أوردرات الدليفري.
- `/delivery/payroll`: المستحقات.
- `/delivery/settings`: إعدادات الدليفري.

## Environment

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

لا تستخدم `service_role` في الواجهة أو في Vercel client env.

## Supabase Setup

1. شغّل `supabase/schema.sql`.
2. شغّل `supabase/seed.sql`.
3. أنشئ مستخدمي Supabase Auth من لوحة Supabase.
4. اربط كل مستخدم بصف في `user_profiles`.

## أول حساب Admin

التطبيق يستخدم Supabase Auth لتسجيل الدخول. كلمة المرور لا تحفظ في جدول عام. اسم المستخدم `admin` يتحول إلى email عبر جدول `delivery_login_aliases`.

لتفعيل الدخول التجريبي:

- username: `admin`
- password: `admin123`

نفذ الخطوات:

1. Supabase Dashboard > Authentication > Users.
2. أنشئ user:
   - email: `admin@dawaa-delivery.local`
   - password: `admin123`
   - email confirmed: enabled
3. انسخ `user id`.
4. شغّل SQL التالي بعد استبدال `<auth-user-id>`:

```sql
insert into user_profiles (id, email, username, display_name, role, status)
values (
  '<auth-user-id>',
  'admin@dawaa-delivery.local',
  'admin',
  'Admin',
  'admin',
  'active'
)
on conflict (id) do update
set email = excluded.email,
    username = excluded.username,
    display_name = excluded.display_name,
    role = excluded.role,
    status = excluded.status;

insert into delivery_login_aliases (username, email, role, status)
values ('admin', 'admin@dawaa-delivery.local', 'admin', 'active')
on conflict (username) do update
set email = excluded.email,
    role = excluded.role,
    status = excluded.status;
```

بعد أول دخول، غيّر كلمة المرور من Supabase Dashboard.

## ربط Rider

1. أنشئ Supabase Auth user للمندوب.
2. أنشئ/حدّث `user_profiles` بنفس `auth.users.id` واجعل:
   - `role = 'rider'`
   - `status = 'active'`
3. أضف صفًا في `delivery_riders`:

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

لو دخل حساب غير مربوط بـ `delivery_riders` ستظهر رسالة واضحة للمندوب.

## جداول الدليفري

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
- `delivery_login_aliases`

`delivery_trips` تمثل الخروجة / Delivery Run. الخروجة الواحدة تحتوي أكثر من أوردر عبر `delivery_orders.trip_id`. يوجد unique partial index يمنع فتح أكثر من خروجة `active` لنفس المندوب.

## بحث العملاء

البحث يتم عبر RPC:

```sql
delivery_search_customers(search_text text)
```

القواعد:

- أقل من حرفين لا يبحث.
- limit 20.
- يرجع فقط `id`, `name`, `customer_code`, `phone`, `address`.
- لا يحمل جدول العملاء كاملًا في الواجهة.
- الأوردر يحفظ snapshot لبيانات العميل وقت الإضافة.

## GPS / Geofence

الإعدادات في `delivery_settings`:

- `branch_lat`
- `branch_lng`
- `geofence_radius_meters`
- `gps_accuracy_threshold_meters`
- `max_normal_trip_minutes`
- `manual_return_requires_review`

GPS مرفوض، GPS ضعيف، الرجوع خارج النطاق، أو مدة خروجة طويلة تدخل review.

## Payroll

- الشهر يبدأ يوم 26 وينتهي يوم 25.
- الأوردرات المحسوبة: `delivered` فقط.
- المشاوير المحسوبة: `approved` أو `completed` فقط.
- الأسعار snapshot.
- `net_total = hours + orders + trips + bonuses - deductions`.

## اختبار RLS

- rider يرى خروجاته وأوردراته فقط.
- rider لا يدخل صفحات الإدارة.
- shift_manager يرى فرعه فقط.
- admin يرى الكل ويدير settings/payroll.

اختبر من جلسات مستخدمين حقيقية، وليس من service role.

## Vercel

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Pilot

ابدأ بفرع واحد ومندوب أو اثنين. اضبط geofence أولًا، ثم راقب `delivery_audit_log` وحالات review قبل اعتماد المستحقات.
