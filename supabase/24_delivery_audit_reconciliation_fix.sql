-- ============================================================
-- Migration 24: Delivery audit + BConnect reconciliation support
-- الهدف: الفاشل لا يحتسب، التكرار يحتاج مراجعة، وأوردرات ×1.5 تظهر للإدارة فقط
-- Safe: no DROP TABLE, no DELETE, no TRUNCATE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- delivery_orders audit fields
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_countable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS final_count_status TEXT DEFAULT 'pending_reconciliation';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS count_exclusion_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS failed_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS preparing_doctor_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_warning BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_review_status TEXT DEFAULT 'not_required';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS bconnect_match_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS matched_amount NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reconciliation_notes TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_multiplier_order BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_multiplier NUMERIC DEFAULT 1;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS multiplier_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_value NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS created_source TEXT DEFAULT 'rider_app';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure failed orders are never countable
UPDATE public.delivery_orders
SET
  is_countable = FALSE,
  final_count_status = 'excluded_failed',
  count_exclusion_reason = COALESCE(count_exclusion_reason, 'failed_order'),
  order_earning = 0,
  updated_at = NOW()
WHERE status = 'failed';

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_delivery_orders_delivery_date ON public.delivery_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_number ON public.delivery_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider_id ON public.delivery_orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON public.delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_bconnect_match_status ON public.delivery_orders(bconnect_match_status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_final_count_status ON public.delivery_orders(final_count_status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_is_countable ON public.delivery_orders(is_countable);

-- Optional BConnect import archive table for future server-side reconciliation
CREATE TABLE IF NOT EXISTS public.bconnect_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL,
  customer_code TEXT,
  customer_name TEXT,
  phone TEXT,
  address TEXT,
  branch_name TEXT,
  invoice_date TIMESTAMPTZ,
  invoice_amount NUMERIC DEFAULT 0,
  import_period_start DATE,
  import_period_end DATE,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bconnect_invoices_invoice_number ON public.bconnect_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_bconnect_invoices_period ON public.bconnect_invoices(import_period_start, import_period_end);

-- RLS for current PIN/local-session app model
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bconnect_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_orders_public_all" ON public.delivery_orders;
CREATE POLICY "delivery_orders_public_all"
ON public.delivery_orders
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "bconnect_invoices_public_all" ON public.bconnect_invoices;
CREATE POLICY "bconnect_invoices_public_all"
ON public.bconnect_invoices
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
