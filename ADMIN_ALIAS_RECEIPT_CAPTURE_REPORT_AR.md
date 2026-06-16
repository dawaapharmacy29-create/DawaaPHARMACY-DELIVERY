# تقرير تحديث دخول الإدارة وتصوير الريسيت

## 1) دخول المدير العام المختصر
تم تعديل صفحة الدخول بحيث يمكن للمدير الدخول باستخدام:

- Username: `dr.moaz`
- Password: `9493`

مع استمرار دعم الدخول القديم بالإيميل:

- `dr.moaz@dawaa-delivery.local`

> مهم: لازم يكون مستخدم Supabase Auth موجود بالفعل بالإيميل `dr.moaz@dawaa-delivery.local` وكلمة السر `9493`.

## 2) تصوير الريسيت داخل سجل الأوردر
تمت إضافة حقل تصوير/رفع صورة الريسيت في نموذج سجل الأوردر من صفحة الدليفري.

الصورة يتم رفعها إلى Supabase Storage bucket باسم:

`delivery-receipts`

ويتم حفظ بياناتها في جدول `delivery_orders`:

- `receipt_image_path`
- `receipt_image_url`
- `receipt_file_name`
- `receipt_file_size`
- `receipt_mime_type`
- `receipt_ocr_status`
- `receipt_ocr_note`

## 3) هل يتم استخراج بيانات الريسيت تلقائيًا؟
النسخة الحالية تحفظ الصورة كإثبات قوي للمراجعة، وتجهز أعمدة OCR، لكنها لا تستخرج البيانات تلقائيًا من الصورة داخل المتصفح.

الاستخراج التلقائي ممكن في المرحلة التالية باستخدام:

- Supabase Edge Function
- OpenAI Vision أو Google Vision OCR
- مراجعة بشرية قبل اعتماد البيانات المستخرجة

الحقول المجهزة للاستخراج لاحقًا:

- `receipt_extracted_invoice_no`
- `receipt_extracted_customer_code`
- `receipt_extracted_customer_name`
- `receipt_extracted_customer_phone`
- `receipt_extracted_address`
- `receipt_extracted_doctor_name`

## 4) المطلوب بعد رفع النسخة
شغّل SQL:

`supabase/27_admin_alias_receipt_capture.sql`

ثم جرّب:

1. دخول الإدارة بـ `dr.moaz / 9493`.
2. دخول الدليفري.
3. تسجيل أوردر مع تصوير الريسيت.
4. التأكد من ظهور الصورة في Supabase Storage.
