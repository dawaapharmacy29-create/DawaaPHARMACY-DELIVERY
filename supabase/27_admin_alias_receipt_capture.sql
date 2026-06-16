-- ============================================================
-- Migration 27: Admin alias login + receipt image capture fields
-- Safe: no DROP tables, no DELETE, no TRUNCATE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) login aliases table and admin alias dr.moaz -> email
CREATE TABLE IF NOT EXISTS public.login_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.login_aliases ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.login_aliases ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.login_aliases ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.login_aliases ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.login_aliases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

INSERT INTO public.login_aliases (username, email, active)
VALUES
  ('dr.moaz', 'dr.moaz@dawaa-delivery.local', TRUE),
  ('DR.MOAZ', 'dr.moaz@dawaa-delivery.local', TRUE)
ON CONFLICT (username) DO UPDATE SET
  email = EXCLUDED.email,
  active = TRUE,
  updated_at = NOW();

ALTER TABLE public.login_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "login_aliases_public_read" ON public.login_aliases;
CREATE POLICY "login_aliases_public_read"
ON public.login_aliases
FOR SELECT
TO anon, authenticated
USING (active = TRUE);

-- 2) receipt image proof fields for delivery orders
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_image_path TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_image_url TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_file_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_file_size BIGINT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_mime_type TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_status TEXT DEFAULT 'not_uploaded';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_note TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_invoice_no TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_code TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_phone TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_address TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_doctor_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_review_status TEXT DEFAULT 'not_required';

CREATE INDEX IF NOT EXISTS idx_delivery_orders_receipt_ocr_status
ON public.delivery_orders(receipt_ocr_status);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_receipt_review_status
ON public.delivery_orders(receipt_review_status);

-- 3) receipt proof fields for internal trips too
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS proof_image_path TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS proof_image_url TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS proof_ocr_status TEXT DEFAULT 'not_uploaded';
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS proof_review_status TEXT DEFAULT 'pending';

-- 4) Supabase Storage bucket for receipt photos
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

DROP POLICY IF EXISTS "delivery_receipts_public_read" ON storage.objects;
CREATE POLICY "delivery_receipts_public_read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'delivery-receipts');

DROP POLICY IF EXISTS "delivery_receipts_public_insert" ON storage.objects;
CREATE POLICY "delivery_receipts_public_insert"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'delivery-receipts');

NOTIFY pgrst, 'reload schema';
