-- ============================================================
-- Migration 21: Customer search + delivery_orders runtime fix
-- Safe: no DROP tables, no DELETE, no TRUNCATE
-- Purpose:
-- - Allow rider order form to save manual or selected customers.
-- - Prevent NOT NULL customer_name failures.
-- - Prepare customers table for import from Excel/CSV.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Customers table used by the rider customer search.
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT,
  code TEXT,
  customer_name TEXT,
  name TEXT,
  customer_phone TEXT,
  phone TEXT,
  mobile TEXT,
  customer_address TEXT,
  address TEXT,
  branch_name TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON public.customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_customer_name ON public.customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_customer_phone ON public.customers(customer_phone);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers(mobile);

-- Delivery orders columns used by the rider app.
CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  customer_id UUID,
  customer_code TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  delivery_date DATE DEFAULT CURRENT_DATE,
  invoice_number TEXT,
  invoice_no TEXT,
  invoice_amount NUMERIC DEFAULT 0,
  invoice_value NUMERIC DEFAULT 0,
  customer_code_snapshot TEXT,
  customer_name_snapshot TEXT,
  customer_phone_snapshot TEXT,
  customer_address_snapshot TEXT,
  status TEXT DEFAULT 'registered',
  notes TEXT,
  source TEXT DEFAULT 'rider_app',
  registered_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS delivery_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_value NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_code_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_address_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'registered';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'rider_app';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Existing projects may have customer_name as NOT NULL. The app now always sends it,
-- but this makes manual/fallback records safe too.
ALTER TABLE public.delivery_orders ALTER COLUMN customer_name DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.delivery_orders_fill_customer_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.customer_name = COALESCE(
    NULLIF(NEW.customer_name, ''),
    NULLIF(NEW.customer_name_snapshot, ''),
    NULLIF(NEW.customer_code, ''),
    NULLIF(NEW.customer_phone, ''),
    'عميل غير مسجل'
  );

  NEW.customer_code = COALESCE(NULLIF(NEW.customer_code, ''), NULLIF(NEW.customer_code_snapshot, ''));
  NEW.customer_phone = COALESCE(NULLIF(NEW.customer_phone, ''), NULLIF(NEW.customer_phone_snapshot, ''));
  NEW.customer_address = COALESCE(NULLIF(NEW.customer_address, ''), NULLIF(NEW.customer_address_snapshot, ''));
  NEW.invoice_no = COALESCE(NULLIF(NEW.invoice_no, ''), NULLIF(NEW.invoice_number, ''));
  NEW.invoice_value = COALESCE(NEW.invoice_value, NEW.invoice_amount, 0);
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_orders_fill_customer_fields ON public.delivery_orders;
CREATE TRIGGER trg_delivery_orders_fill_customer_fields
BEFORE INSERT OR UPDATE ON public.delivery_orders
FOR EACH ROW
EXECUTE FUNCTION public.delivery_orders_fill_customer_fields();

CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider_date ON public.delivery_orders(rider_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_number ON public.delivery_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_customer_id ON public.delivery_orders(customer_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_public_select" ON public.customers;
CREATE POLICY "customers_public_select"
ON public.customers
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "delivery_orders_public_all" ON public.delivery_orders;
CREATE POLICY "delivery_orders_public_all"
ON public.delivery_orders
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
