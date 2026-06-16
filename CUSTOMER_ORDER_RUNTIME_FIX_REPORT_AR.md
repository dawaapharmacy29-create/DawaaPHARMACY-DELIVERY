# تقرير إصلاح ربط العملاء وحفظ الأوردر

## المشكلة التي ظهرت
عند حفظ أوردر من صفحة `/rider` ظهرت رسالة:

`null value in column "customer_name" of relation "delivery_orders" violates not-null constraint`

كما أن جدول `customers` كان فارغًا (`COUNT = 0`)، لذلك البحث عن العملاء لم يكن يُظهر نتائج.

## ما تم إصلاحه في الكود
تم تعديل ملف:

`src/pages/rider/RiderDashboard.tsx`

التعديل الأساسي داخل `handleSaveOrder`:

- أصبح التطبيق يرسل الأعمدة القديمة والجديدة معًا عند حفظ الأوردر:
  - `customer_name`
  - `customer_phone`
  - `customer_address`
  - `customer_code`
  - `customer_name_snapshot`
  - `customer_phone_snapshot`
  - `customer_address_snapshot`
  - `customer_code_snapshot`
  - `invoice_no`
  - `invoice_value`
  - `rider_name`

- لو العميل غير موجود في جدول العملاء، يتم حفظ النص المكتوب يدويًا كاسم عميل بدل إرسال `null`.
- تم الحفاظ على البحث والاختيار من جدول `customers` عند توفر العملاء.

## ملف SQL الجديد
تمت إضافة ملف:

`supabase/21_customer_orders_runtime_fix.sql`

وظيفته:

- تجهيز جدول `customers` بأعمدة البحث المطلوبة.
- تجهيز جدول `delivery_orders` بأعمدة العميل المطلوبة.
- إزالة شرط `NOT NULL` من `delivery_orders.customer_name` كحماية إضافية.
- إضافة Trigger يملأ `customer_name` تلقائيًا من snapshot أو يجعلها `عميل غير مسجل` إذا كانت فارغة.
- إضافة RLS policies مناسبة لنظام الدليفري الحالي الذي يستخدم PIN/localStorage.

## ملف العملاء الجاهز للاستيراد
تم تجهيز ملف CSV من ملف Excel المرفوع:

`customers_import_ready.csv`

يحتوي على 15142 عميلًا بالأعمدة:

- customer_code
- code
- customer_name
- name
- customer_phone
- phone
- mobile
- customer_address
- address
- branch_name
- active

## التحقق
تم تشغيل:

```bash
npm run typecheck
npm run build
```

والاثنان نجحا بدون أخطاء.

## خطوات التشغيل المطلوبة
1. شغل SQL:
   `supabase/21_customer_orders_runtime_fix.sql`

2. ارفع ملف العملاء:
   `customers_import_ready.csv`
   إلى جدول `customers` في Supabase.

3. ارفع التعديلات على GitHub ثم انتظر Vercel حتى يصبح Ready.

4. جرب:
   - Login: `AHMD.ALBTL / 1234`
   - افتح `/rider`
   - اضغط `سجل أوردر`
   - ابحث عن عميل بالاسم أو الكود أو الهاتف.
   - احفظ الأوردر.

