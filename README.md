# Dawaa Delivery — دليفري صيدليات دواء

نسخة مطورة ومركزة على تشغيل تطبيق الدليفري فقط، مع إصلاحات مهمة في:
- تسجيل الدخول باسم مستخدم ورقم سري.
- منع التعليق على شاشة “جاري الدخول”.
- ربط Supabase Project جديد مستقل.
- تحسين تصميم صفحة الدخول باستخدام لوجو صيدليات دواء.
- توجيه التطبيق افتراضيًا إلى صفحات الدليفري بدل صفحات المشتريات.
- دعم Vercel SPA routing عبر `vercel.json`.

## بيانات الدخول التجريبية

بعد تجهيز Supabase الجديد وإنشاء المستخدم:

```text
Username: DR.MOAZ
Password: 9493
Internal Email: dr.moaz@dawaa-delivery.local
```

يوجد alias إضافي مؤقت:

```text
admin -> dr.moaz@dawaa-delivery.local
```

وكلمة المرور له هي نفس كلمة مرور المستخدم الداخلي، أي `9493`، وليس `admin123`.

## تشغيل Supabase الجديد

1. افتح Supabase Project الجديد.
2. من Authentication → Users → Add user:
   - Email: `dr.moaz@dawaa-delivery.local`
   - Password: `9493`
   - اجعل المستخدم Confirmed.
3. افتح SQL Editor.
4. شغّل الملف:

```text
supabase/new-project/00_minimal_bootstrap.sql
```

5. بعد تشغيل الملف وإنشاء Auth user، نفّذ:

```sql
select public.delivery_link_admin_profile();
```

6. اختبر:

```sql
select public.delivery_resolve_login('DR.MOAZ') as resolved_email;
```

المفروض يرجع:

```text
dr.moaz@dawaa-delivery.local
```

## إعداد Vercel

في Vercel → Project → Settings → Environment Variables:

```env
VITE_SUPABASE_URL=https://qlugjplnnkjzxcbhwopg.supabase.co
VITE_SUPABASE_ANON_KEY=anon_public_key_from_new_supabase_project
```

لا تستخدم `service_role` داخل Vercel أو الكود.

بعد تعديل env اعمل Redeploy.

## المسارات المهمة

```text
/login
/delivery
/delivery/rider
/delivery/orders
/delivery/payroll
/delivery/settings
```

## إصلاحات مهمة تمت في هذه النسخة

### Auth
- `AuthContext` أصبح يمنع التعليق النهائي.
- كل عمليات auth/profile لها timeout.
- `login()` يعمل بـ username alias من RPC `delivery_resolve_login`.
- يجلب profile من `user_profiles.auth_user_id` بدل `id` فقط.
- يعرض أخطاء واضحة عند:
  - اسم مستخدم غير موجود.
  - كلمة مرور خطأ.
  - profile غير مربوط.
  - Supabase غير مجهز.

### Login
- تم تغيير الدخول السريع إلى `DR.MOAZ / 9493`.
- تم استخدام لوجو صيدليات دواء.
- تم حذف نص “نظام المشتريات” من صفحة الدخول.
- بعد الدخول يتم التوجيه إلى:
  - `/delivery` للمدير.
  - `/delivery/rider` للمندوب.

### Delivery
- تم جعل التطبيق يفتح صفحات الدليفري افتراضيًا.
- تم توحيد استخدام الجداول:
  - `delivery_trips` = الخروجة / Delivery Run.
  - `delivery_orders`.
  - `delivery_riders`.
  - `delivery_customers`.
  - `delivery_attendance`.
- تم تجهيز SQL minimal لتشغيل التطبيق فورًا.

## ملاحظات Pilot

ابدأ بتجربة صغيرة:

1. أدخل بحساب `DR.MOAZ / 9493`.
2. افتح `/delivery/rider`.
3. جرّب تسجيل حضور.
4. جرّب بدء خروجة.
5. ابحث عن عميل تجربة مثل `عميل` أو `CUST`.
6. أضف أوردر برقم فاتورة.
7. علّم الأوردر “تم التسليم”.
8. أنهِ الخروجة.
9. راجع `/delivery` و `/delivery/payroll`.

## أوامر محلية

```bash
npm install
npm run typecheck
npm run lint
npm run build
npm run dev
```

## ملاحظات مهمة

- هذه النسخة تستخدم Supabase الجديد فقط عبر env.
- الجداول الأساسية موجودة في `00_minimal_bootstrap.sql`.
- نظام الحوافز والتنبيهات المتقدم يتم إضافته بعد التأكد أن الدخول والخروجة والأوردرات تعمل.
