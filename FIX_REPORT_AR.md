# تقرير إصلاح تطبيق Dawaa Delivery Control

## المشكلة الأساسية
صفحة `/login` كانت تتعامل مع كل محاولات الدخول من خلال Supabase Auth (`auth.users`) حتى لو المستخدم دليفري يدخل بـ `username + PIN`. لذلك كان التطبيق يرفض كل حسابات الدليفري رغم أن جدول `rider_accounts` ودالة `rider_pin_login` يعملان بنجاح.

## ما تم إصلاحه

### 1) إصلاح صفحة الدخول `/login`
تم تعديل `src/pages/Login.tsx` بحيث:
- إذا كان المدخل يحتوي على `@` يتم اعتباره دخول إدارة بالإيميل وكلمة السر عبر Supabase Auth.
- إذا لم يحتوي على `@` يتم اعتباره دخول دليفري باستخدام `username + PIN`.
- دخول الدليفري الآن يستدعي:

```ts
supabase.rpc('rider_pin_login', {
  p_username: username.trim().toUpperCase(),
  p_pin: pin.trim()
})
```

- يتم التعامل مع نتيجة الدالة كـ object أو array بأمان.
- عند نجاح الدخول يتم حفظ جلسة الدليفري في `localStorage` تحت المفتاح:

```text
dawaa_rider_session
```

- يتم حفظ `rider_id`, `account_id`, `username`, `rider_name`, `branch_id`, `branch_name`, `role`, `must_change_pin`.
- بعد النجاح يتم التحويل إلى `/rider`.

### 2) إصلاح حماية الصفحات
تم تعديل `src/components/ProtectedRoute.tsx` بحيث:
- صفحة `/rider` تعتمد على جلسة الدليفري المحلية.
- صفحات `/admin` تقبل Supabase Auth session أو جلسة موجودة؛ حتى لا يتم طرد المدير بعد تسجيل الدخول.

### 3) إصلاح TypeScript
تم تنظيف imports غير مستخدمة في `src/pages/rider/RiderDashboard.tsx` حتى ينجح `npm run typecheck`.

### 4) إصلاح ملفات RLS التي كانت تفشل
تم تعديل:
- `supabase/18_rls_auth_uid_riders.sql`
- `supabase/19_rls_clean_rebuild.sql`

حتى لا تفشل عند عدم وجود جداول مثل `attendance`, `delivery_orders`, `internal_trips`، ولتتناسب مع النظام الحالي الذي يستخدم `rider_accounts + PIN` بدل `auth.uid()`.

## الاختبارات التي تمت
تم تشغيل:

```bash
npm run typecheck
npm run build
```

والنتيجة: نجح الاثنان بدون أخطاء.

## بيانات اختبار مقترحة بعد الرفع
حسب آخر اختبار Supabase لديك:

```text
Username: AHMD.ALBTL
PIN: 1234
```

لو كنت غيّرت الرقم بعد ذلك، استخدم الرقم الظاهر في صفحة `/admin/rider-accounts` أو في `rider_accounts_view.pin_plain`.

## خطوات الرفع على GitHub

1. انسخ الملفات المعدلة فوق مشروعك المحلي.
2. افتح PowerShell داخل المشروع.
3. شغّل:

```bash
git status
git add src/pages/Login.tsx src/components/ProtectedRoute.tsx src/pages/rider/RiderDashboard.tsx supabase/18_rls_auth_uid_riders.sql supabase/19_rls_clean_rebuild.sql package-lock.json
git commit -m "fix: repair rider PIN login session flow"
git push origin main
```

4. انتظر Vercel Deployment حتى يظهر `Ready`.
5. افتح نافذة Incognito وجرب الدخول.

## ملاحظات مهمة
- لا تستخدم `auth.uid()` للدليفري حاليًا لأن `riders.auth_user_id` عندك فارغ.
- النظام الحالي الصحيح للدليفري هو `rider_accounts.username + pin_plain` عبر RPC `rider_pin_login`.
- عند الانتقال لاحقًا إلى Supabase Auth للدليفري، لازم تعمل إنشاء `auth.users` وربط `riders.auth_user_id` فعليًا، وهذا يحتاج flow مستقل.
