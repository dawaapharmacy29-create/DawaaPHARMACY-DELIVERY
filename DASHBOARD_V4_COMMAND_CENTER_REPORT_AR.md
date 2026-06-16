# تحديث Dawaa Delivery V4 Command Center

هذه النسخة تعالج مشاكل الداشبورد والبناء التي ظهرت في نسخة V3.

## أهم التعديلات

1. إعادة بناء صفحة `/admin/executive` لتقرأ من View واحد رسمي:
   - `delivery_rider_cycle_scorecard`

2. إضافة مؤشرات واضحة:
   - إجمالي أوردرات الدورة
   - نسبة التشغيل
   - نسبة التسليم
   - نسبة الدقة
   - مؤشر الخطر
   - مستني مطابقة
   - مراجعة فعلية
   - مكرر
   - فاشل
   - غير محتسب
   - أوردرات ×1.5

3. فصل معنى Pending:
   - `pending_reconciliation_orders` = مستني مطابقة عادي
   - `review_orders` = مشكلة فعلية أو تكرار يحتاج قرار إداري

4. إصلاح منطق `is_countable`:
   - الأوردر العادي registered/delivered يحسب مبدئيًا
   - الأوردر failed لا يحسب

5. إصلاح منطق `needs_review`:
   - pending العادي لا يظهر كمراجعة فعلية
   - المكرر يظل تحت مراجعة إدارية

6. تحسين جودة بيانات الفروع:
   - منع ظهور `shkri`
   - توحيد `فرع شكري` و `فرع الشامي`

7. إصلاح إعدادات البناء:
   - استخدام `@vitejs/plugin-react` بدل `@vitejs/plugin-react-swc`
   - حذف الاعتماد على `@swc/core`
   - السماح فقط لـ `esbuild` داخل pnpm
   - تثبيت `build = vite build`

## ملفات مهمة

- `src/pages/admin/ExecutiveDashboard.tsx`
- `supabase/54_delivery_command_center_upgrade.sql`
- `package.json`
- `pnpm-workspace.yaml`
- `vite.config.ts`

## خطوات التشغيل

1. انسخ محتوى النسخة فوق المشروع الحالي.
2. شغّل في Supabase:
   - `supabase/53_rider_compensation_profiles.sql`
   - `supabase/54_delivery_command_center_upgrade.sql`
3. شغّل محليًا:

```powershell
pnpm install --force
pnpm rebuild esbuild
pnpm run build
```

4. إذا ظهر `✓ built` احذف `dist` قبل الرفع:

```powershell
Remove-Item -Recurse -Force dist
```

5. ارفع على GitHub ثم انتظر Vercel.

## ملاحظات تشغيلية

- مؤشر التشغيل هو الأهم في نظامك الحالي لأن الأوردر يبدأ `registered` ثم يتم مطابقته لاحقًا.
- مؤشر التسليم مساعد فقط إذا كان التطبيق يحول الحالة إلى `delivered`.
- الأوردر المكرر الصحيح يجب اعتماده إداريًا من صفحة المراجعة أو عبر SQL، ولا يتم تنظيفه تلقائيًا.
