-- ============================================================
-- SQL 41: policies + receipt OCR support
-- Safe: no delete, no truncate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Ensure receipt/OCR columns exist on delivery_orders
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_image_path TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_image_url TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_file_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_file_size BIGINT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_mime_type TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_status TEXT DEFAULT 'not_uploaded';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_note TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_json JSONB;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_confidence NUMERIC;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_invoice_no TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_code TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_phone TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_address TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_doctor_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_invoice_date TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_review_status TEXT DEFAULT 'not_required';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS preparing_doctor_name TEXT;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_receipt_ocr_status
ON public.delivery_orders(receipt_ocr_status);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_receipt_review_status
ON public.delivery_orders(receipt_review_status);

-- 2) Create public storage bucket for delivery receipts if missing
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'delivery-receipts',
  'delivery-receipts',
  TRUE,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'];

-- 3) Storage policies for receipt upload/read
DROP POLICY IF EXISTS "delivery_receipts_public_read" ON storage.objects;
CREATE POLICY "delivery_receipts_public_read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'delivery-receipts');

DROP POLICY IF EXISTS "delivery_receipts_authenticated_insert" ON storage.objects;
CREATE POLICY "delivery_receipts_authenticated_insert"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'delivery-receipts');

DROP POLICY IF EXISTS "delivery_receipts_authenticated_update" ON storage.objects;
CREATE POLICY "delivery_receipts_authenticated_update"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'delivery-receipts')
WITH CHECK (bucket_id = 'delivery-receipts');

-- 4) Policy table entries if delivery_policies exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='delivery_policies') THEN
    -- Ensure broad columns used by previous migrations are present
    ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS policy_type TEXT DEFAULT 'general';
    ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';
    ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium';
    ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 100;
    ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS role_scope TEXT DEFAULT 'rider';
    ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
    ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    UPDATE public.delivery_policies
    SET body = COALESCE(body, description, title, '')
    WHERE body IS NULL;

    INSERT INTO public.delivery_policies (policy_type, title, description, body, severity, sort_order, role_scope, is_active)
    VALUES
      ('order_rules', 'رقم الفاتورة إلزامي', 'لا يتم احتساب أي أوردر بدون رقم فاتورة صحيح وواضح.', 'لا يتم احتساب أي أوردر بدون رقم فاتورة صحيح وواضح. اكتب الرقم كما هو ظاهر في برنامج الصيدلية أو الريسيت.', 'high', 10, 'rider', TRUE),
      ('order_rules', 'تصوير أو رفع الريسيت', 'يمكن تصوير الريسيت بالكاميرا أو رفع صورة محفوظة عند الحاجة.', 'الصورة تستخدم كإثبات للمراجعة ومنع التلاعب، وخاصة عند وجود مراجعة أو فاتورة مكررة أو طلب ×1.5.', 'high', 20, 'rider', TRUE),
      ('order_rules', 'استخراج البيانات تلقائياً OCR', 'بعد تصوير أو رفع الريسيت يمكن استخراج البيانات تلقائياً.', 'التطبيق يحاول تعبئة اسم العميل، الكود، الهاتف، العنوان، رقم الفاتورة، القيمة، التاريخ، واسم الدكتور/البائع من الصورة. يجب مراجعة البيانات قبل الحفظ.', 'medium', 30, 'rider', TRUE),
      ('order_rules', 'طلبات ×1.5 تحت المراجعة', 'لا تحتسب طلبات ×1.5 إلا بعد موافقة الإدارة.', 'اختيار ×1.5 هو طلب مراجعة فقط وليس اعتماد نهائي للراتب.', 'high', 40, 'rider', TRUE),
      ('trip_rules', 'المشاوير تحتاج سبب وإثبات', 'كل مشوار يجب أن يحتوي على سبب واضح وجهة خروج وجهة وصول.', 'يفضل ربط المشوار برقم فاتورة أو صورة إثبات عند المشاوير بين الفروع أو المخازن.', 'medium', 50, 'rider', TRUE),
      ('attendance_rules', 'الحضور والانصراف إلزامي', 'يجب تسجيل الحضور في بداية الشيفت والانصراف في نهايته.', 'يتم استخدام الحضور والانصراف لحساب أيام وساعات العمل ومراجعة الالتزام.', 'high', 60, 'rider', TRUE),
      ('security_rules', 'منع التلاعب', 'أي بيانات غير واضحة أو غير مكتملة يتم وضعها تحت المراجعة.', 'الأوردرات الفاشلة والمكررة وطلبات ×1.5 لا تدخل في الحساب النهائي إلا بعد اعتماد الإدارة.', 'high', 70, 'rider', TRUE)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
