# تقرير إصلاح ربط سجل الأوردر ببيانات العملاء

## ما تم تعديله

### 1) صفحة الدليفري `/rider`
تم تعديل ملف:

`src/pages/rider/RiderDashboard.tsx`

التعديلات:

- تحويل حقل العميل في مودال **سجل أوردر** إلى بحث ذكي في جدول `customers`.
- البحث يدعم أكثر من اسم عمود حتى لو قاعدة البيانات مختلفة:
  - `customer_code`, `code`, `customer_id`, `client_code`, `cust_code`
  - `customer_name`, `name`, `client_name`, `cust_name`, `full_name`
  - `phone`, `mobile`, `customer_phone`, `telephone`, `tel`, `phone_number`
  - `address`, `customer_address`, `area`, `location`, `delivery_address`
- إضافة دالة `normalizeCustomer` لتوحيد بيانات العميل في شكل واحد:
  - `id`
  - `code`
  - `name`
  - `phone`
  - `address`
  - `branch_name`
- عند اختيار العميل تظهر بياناته بوضوح:
  - اسم العميل
  - الكود
  - رقم الهاتف
  - العنوان
- عند حفظ الأوردر يتم حفظ Snapshot لبيانات العميل داخل `delivery_orders`:
  - `customer_id`
  - `customer_code_snapshot`
  - `customer_name_snapshot`
  - `customer_phone_snapshot`
  - `customer_address_snapshot`
- إذا لم يظهر العميل في البحث، يمكن كتابة بياناته يدويًا وحفظ الأوردر كعميل غير مسجل بدل تعطيل الدليفري.
- إضافة Debounce للبحث 300ms.
- إضافة حالة Loading أثناء البحث.
- إضافة رسالة واضحة عند عدم وجود نتائج.

### 2) Migration SQL داعم
تمت إضافة ملف:

`supabase/20_customer_linked_rider_orders.sql`

مهمته:

- تجهيز جدول `customers` بالأعمدة الشائعة إن كانت ناقصة.
- تجهيز جدول `delivery_orders` بكل الأعمدة التي يستخدمها تطبيق الدليفري.
- إضافة Indexes مهمة للبحث والحفظ.
- إضافة RLS مؤقت مناسب لنظام الدليفري الحالي المعتمد على `username + PIN + localStorage` وليس `auth.uid()`.

## الاختبارات التي تم تشغيلها

تم تشغيل:

```bash
npm run typecheck
npm run build
```

والنتيجة: نجح الاثنان بدون أخطاء.

## خطوات التشغيل بعد رفع التعديل

1. انسخ الملفات المعدلة إلى مشروع GitHub.
2. شغل ملف SQL التالي في Supabase:

`supabase/20_customer_linked_rider_orders.sql`

3. اعمل Commit و Push.
4. انتظر Vercel حتى يظهر `Ready`.
5. جرّب:
   - دخول دليفري: `AHMD.ALBTL / 1234`
   - افتح `/rider`
   - اضغط **سجل أوردر**
   - ابحث عن عميل بالاسم أو الكود أو الموبايل
   - اختار العميل
   - تأكد أن الاسم والكود والهاتف والعنوان ظهروا
   - احفظ الأوردر

## ملاحظات مهمة

- التطبيق ما زال يستخدم جدول `delivery_orders` للأوردرات، وليس `trips`.
- لا تعتمد صفحة الدليفري حاليًا على `auth.uid()`، لأنها تعمل بنظام PIN والجلسة المحلية.
- في حالة ظهور خطأ أعمدة ناقصة، شغّل Migration رقم 20 من Supabase.
