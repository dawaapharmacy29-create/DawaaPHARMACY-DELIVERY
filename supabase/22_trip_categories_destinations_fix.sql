-- ============================================================
-- Migration 22: Rider trip categories and destination fields
-- Safe: no DROP tables, no DELETE, no TRUNCATE
-- Purpose:
-- - Support trip types: branch_to_branch, warehouse, supplies,
--   pharmacy, shipment_pickup, accessories, other
-- - Ensure internal_trips has all columns used by rider app
-- - Keep current PIN/local session app flow working without auth.uid
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.internal_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  trip_date DATE DEFAULT CURRENT_DATE,
  trip_type TEXT DEFAULT 'branch_to_branch',
  from_label TEXT,
  to_label TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending_approval',
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  has_invoice_reference BOOLEAN DEFAULT FALSE,
  related_invoice_number TEXT,
  trip_rate NUMERIC DEFAULT 0,
  trip_multiplier NUMERIC DEFAULT 1,
  trip_earning NUMERIC DEFAULT 0,
  needs_review BOOLEAN DEFAULT FALSE,
  review_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS trip_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS trip_type TEXT DEFAULT 'branch_to_branch';
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS from_label TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS to_label TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_approval';
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS has_invoice_reference BOOLEAN DEFAULT FALSE;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS related_invoice_number TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS trip_rate NUMERIC DEFAULT 0;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS trip_multiplier NUMERIC DEFAULT 1;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS trip_earning NUMERIC DEFAULT 0;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- If an old CHECK constraint limits trip_type, this block removes only the
-- constraint that actually references trip_type and allows the new values.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.internal_trips'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%trip_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.internal_trips DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.internal_trips
ADD CONSTRAINT internal_trips_trip_type_check
CHECK (
  trip_type IN (
    'branch_to_branch',
    'warehouse',
    'supplies',
    'pharmacy',
    'shipment_pickup',
    'accessories',
    'purchase_missing_item',
    'supplier',
    'returns',
    'collection',
    'visit_again',
    'customer_second_visit',
    'other'
  )
);

CREATE INDEX IF NOT EXISTS idx_internal_trips_rider_id ON public.internal_trips(rider_id);
CREATE INDEX IF NOT EXISTS idx_internal_trips_trip_date ON public.internal_trips(trip_date);
CREATE INDEX IF NOT EXISTS idx_internal_trips_trip_type ON public.internal_trips(trip_type);
CREATE INDEX IF NOT EXISTS idx_internal_trips_status ON public.internal_trips(status);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_internal_trips_updated_at'
  ) THEN
    CREATE TRIGGER set_internal_trips_updated_at
      BEFORE UPDATE ON public.internal_trips
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.internal_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal_trips_anon_all" ON public.internal_trips;
DROP POLICY IF EXISTS "Rider reads own trips" ON public.internal_trips;
DROP POLICY IF EXISTS "Rider inserts own trips" ON public.internal_trips;
DROP POLICY IF EXISTS "Rider updates own trips" ON public.internal_trips;

CREATE POLICY "internal_trips_anon_all"
ON public.internal_trips
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
