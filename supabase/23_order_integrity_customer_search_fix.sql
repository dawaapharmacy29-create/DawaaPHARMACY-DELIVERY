-- ============================================================
-- Migration 23: Order integrity + customer snapshots + multiplier review
-- Safe migration: no DROP TABLE, no DELETE, no TRUNCATE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  branch_id UUID,
  delivery_date DATE DEFAULT CURRENT_DATE,
  invoice_number TEXT,
  customer_name TEXT,
  status TEXT DEFAULT 'registered',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_address TEXT;

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_code_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_address_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS manual_customer BOOLEAN DEFAULT FALSE;

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_value NUMERIC DEFAULT 0;

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS delivery_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_multiplier_order BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_multiplier NUMERIC DEFAULT 1;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS multiplier_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_rate NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_earning NUMERIC DEFAULT 0;

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_duplicate_invoice BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_warning BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_note TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS original_order_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_review_status TEXT DEFAULT 'not_required';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_reviewed_by TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS preparing_doctor_name TEXT;

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS created_source TEXT DEFAULT 'rider_app';

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS bconnect_match_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS bconnect_invoice_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS failed_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'rider_app';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.delivery_orders ALTER COLUMN customer_name DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.delivery_orders_fill_integrity_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.customer_name = COALESCE(NULLIF(NEW.customer_name, ''), NULLIF(NEW.customer_name_snapshot, ''), 'عميل غير مسجل');
  NEW.customer_code = COALESCE(NULLIF(NEW.customer_code, ''), NULLIF(NEW.customer_code_snapshot, ''));
  NEW.customer_phone = COALESCE(NULLIF(NEW.customer_phone, ''), NULLIF(NEW.customer_phone_snapshot, ''));
  NEW.customer_address = COALESCE(NULLIF(NEW.customer_address, ''), NULLIF(NEW.customer_address_snapshot, ''));
  NEW.customer_name_snapshot = COALESCE(NULLIF(NEW.customer_name_snapshot, ''), NEW.customer_name);
  NEW.customer_code_snapshot = COALESCE(NULLIF(NEW.customer_code_snapshot, ''), NEW.customer_code);
  NEW.customer_phone_snapshot = COALESCE(NULLIF(NEW.customer_phone_snapshot, ''), NEW.customer_phone);
  NEW.customer_address_snapshot = COALESCE(NULLIF(NEW.customer_address_snapshot, ''), NEW.customer_address);
  NEW.invoice_no = COALESCE(NULLIF(NEW.invoice_no, ''), NEW.invoice_number);
  NEW.invoice_value = COALESCE(NEW.invoice_value, NEW.invoice_amount, 0);
  NEW.order_multiplier = COALESCE(NEW.order_multiplier, CASE WHEN COALESCE(NEW.is_multiplier_order, false) THEN 1.5 ELSE 1 END);
  NEW.order_earning = 0;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_orders_fill_integrity_fields ON public.delivery_orders;
CREATE TRIGGER trg_delivery_orders_fill_integrity_fields
BEFORE INSERT OR UPDATE ON public.delivery_orders
FOR EACH ROW EXECUTE FUNCTION public.delivery_orders_fill_integrity_fields();

CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_number ON public.delivery_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider_id ON public.delivery_orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_delivery_date ON public.delivery_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_customer_code ON public.delivery_orders(customer_code);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_review_status ON public.delivery_orders(review_status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_multiplier ON public.delivery_orders(is_multiplier_order);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_duplicate ON public.delivery_orders(is_duplicate_invoice);

ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delivery_orders_public_all" ON public.delivery_orders;
CREATE POLICY "delivery_orders_public_all"
ON public.delivery_orders
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Customers search access
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_public_select" ON public.customers;
CREATE POLICY "customers_public_select"
ON public.customers
FOR SELECT
TO anon, authenticated
USING (true);

NOTIFY pgrst, 'reload schema';
