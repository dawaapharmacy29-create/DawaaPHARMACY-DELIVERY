-- ============================================================
-- Migration 28: Receipt OCR/AI extraction fields + review support
-- Safe: no DROP tables, no DELETE, no TRUNCATE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_json JSONB;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_confidence NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_invoice_no TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_code TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_phone TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_address TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_doctor_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_review_status TEXT DEFAULT 'not_required';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_status TEXT DEFAULT 'not_uploaded';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_note TEXT;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_receipt_ocr_status
ON public.delivery_orders(receipt_ocr_status);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_receipt_review_status
ON public.delivery_orders(receipt_review_status);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_receipt_extracted_invoice
ON public.delivery_orders(receipt_extracted_invoice_no);

CREATE TABLE IF NOT EXISTS public.receipt_ocr_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id UUID,
  rider_id UUID,
  receipt_image_path TEXT,
  extracted_json JSONB,
  confidence NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'extracted',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.receipt_ocr_audit_log ADD COLUMN IF NOT EXISTS delivery_order_id UUID;
ALTER TABLE public.receipt_ocr_audit_log ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.receipt_ocr_audit_log ADD COLUMN IF NOT EXISTS receipt_image_path TEXT;
ALTER TABLE public.receipt_ocr_audit_log ADD COLUMN IF NOT EXISTS extracted_json JSONB;
ALTER TABLE public.receipt_ocr_audit_log ADD COLUMN IF NOT EXISTS confidence NUMERIC DEFAULT 0;
ALTER TABLE public.receipt_ocr_audit_log ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'extracted';
ALTER TABLE public.receipt_ocr_audit_log ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.receipt_ocr_audit_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.receipt_ocr_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "receipt_ocr_audit_log_public_all" ON public.receipt_ocr_audit_log;
CREATE POLICY "receipt_ocr_audit_log_public_all"
ON public.receipt_ocr_audit_log
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Keep bucket available for camera receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'delivery-receipts',
  'delivery-receipts',
  TRUE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

NOTIFY pgrst, 'reload schema';
