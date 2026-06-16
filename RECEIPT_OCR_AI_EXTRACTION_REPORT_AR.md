# تقرير تطوير OCR/AI لقراءة الريسيت

## هل كان منفذًا قبل هذه النسخة؟
قبل هذه النسخة كان التطبيق يحفظ صورة الريسيت كإثبات فقط، ويخزن حالة `pending_ocr`، لكنه لم يكن يستخرج البيانات تلقائيًا.

## ما الذي تم تنفيذه الآن؟
تمت إضافة مسار كامل لاستخراج بيانات الريسيت بالذكاء:

1. زر داخل سجل الأوردر باسم **استخراج بيانات الريسيت بالذكاء**.
2. عند الضغط عليه يتم رفع الصورة إلى Supabase Storage إذا لم تكن مرفوعة.
3. يتم استدعاء Supabase Edge Function:
   `extract-receipt-ocr`
4. الدالة ترسل الصورة إلى OpenAI Vision وتستخرج:
   - رقم الفاتورة
   - كود العميل
   - اسم العميل
   - رقم التليفون
   - عنوان العميل
   - اسم الدكتور/البائع
   - قيمة الفاتورة
   - تاريخ الفاتورة
   - درجة الثقة والتنبيهات
5. التطبيق يملأ الخانات تلقائيًا بالبيانات المقروءة مع ترك إمكانية التعديل اليدوي قبل الحفظ.
6. عند حفظ الأوردر يتم تخزين بيانات OCR داخل `delivery_orders` للمراجعة.

## ملفات تمت إضافتها
- `supabase/functions/extract-receipt-ocr/index.ts`
- `supabase/28_receipt_ocr_ai_extraction.sql`

## المطلوب لتفعيل OCR فعليًا
يجب نشر Edge Function وإضافة مفتاح OpenAI في Supabase:

```bash
supabase functions deploy extract-receipt-ocr
supabase secrets set OPENAI_API_KEY=sk-...
```

اختياريًا:

```bash
supabase secrets set OCR_MODEL=gpt-4o-mini
```

ثم شغّل SQL:

```text
supabase/28_receipt_ocr_ai_extraction.sql
```

## ملاحظة مهمة
بدون نشر Edge Function وبدون `OPENAI_API_KEY` ستظل الصورة محفوظة كإثبات، لكن استخراج البيانات لن يعمل.
