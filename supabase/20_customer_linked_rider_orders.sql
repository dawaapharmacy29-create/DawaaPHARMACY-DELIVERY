-- ============================================================
-- Migration 20: Customer-linked rider order registration support
-- Safe: no DROP tables, no DELETE, no TRUNCATE
-- Purpose:
-- - Let rider order form search customers and save customer snapshots.
-- - Keep compatibility with PIN/localStorage rider sessions (not auth.uid()).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure customers table has common searchable columns if this is a fresh DB.
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT,
  customer_name TEXT,
  name TEXT,
  phone TEXT,
  mobile TEXT,
  address TEXT,
  customer_address TEXT,
  branch_id UUID,
  branch_name TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure delivery_orders has all columns used by the rider app.
CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  branch_id UUID,
  branch_name TEXT,
  customer_id UUID,
  delivery_date DATE DEFAULT CURRENT_DATE,
  invoice_number TEXT,
  invoice_amount NUMERIC DEFAULT 0,
  customer_code_snapshot TEXT,
  customer_name_snapshot TEXT,
  customer_phone_snapshot TEXT,
  customer_address_snapshot TEXT,
  status TEXT DEFAULT 'registered',
  bconnect_match_status TEXT DEFAULT 'pending',
  bconnect_invoice_id UUID,
  registered_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  failed_reason TEXT,
  notes TEXT,
  source TEXT DEFAULT 'rider_app',
  is_duplicate_invoice BOOLEAN DEFAULT false,
  duplicate_reason TEXT,
  duplicate_note TEXT,
  original_order_id UUID,
  duplicate_review_status TEXT DEFAULT 'not_required',
  duplicate_reviewed_by UUID,
  duplicate_reviewed_at TIMESTAMPTZ,
  needs_review BOOLEAN DEFAULT false,
  review_reason TEXT,
  order_multiplier NUMERIC DEFAULT 1,
  order_rate NUMERIC DEFAULT 0,
  order_earning NUMERIC DEFAULT 0,
  multiplier_reason TEXT,
  matched_at TIMESTAMPTZ,
  matched_amount NUMERIC DEFAULT 0,
  reconciliation_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS delivery_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_code_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_address_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'registered';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS bconnect_match_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS bconnect_invoice_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS failed_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'rider_app';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_duplicate_invoice BOOLEAN DEFAULT false;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_note TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS original_order_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_review_status TEXT DEFAULT 'not_required';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_reviewed_by UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_multiplier NUMERIC DEFAULT 1;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_rate NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_earning NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS multiplier_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS matched_amount NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reconciliation_notes TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON public.customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_customer_name ON public.customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers(mobile);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider_date ON public.delivery_orders(rider_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_number ON public.delivery_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_customer_id ON public.delivery_orders(customer_id);

-- The current rider app uses username+PIN and localStorage, not Supabase Auth.
-- Therefore RLS must allow anon/authenticated until a real auth.uid flow is implemented.
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_public_select" ON public.customers;
CREATE POLICY "customers_public_select"
ON public.customers
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "delivery_orders_public_all" ON public.delivery_orders;
DROP POLICY IF EXISTS "trips_public_all" ON public.delivery_orders;
CREATE POLICY "delivery_orders_public_all"
ON public.delivery_orders
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
