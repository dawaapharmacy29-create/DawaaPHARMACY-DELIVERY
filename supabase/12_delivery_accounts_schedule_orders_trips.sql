-- Safe Migration for Dawaa Delivery Control
-- Phase 12: Delivery Accounts, Schedule, Orders, and Trips
-- This migration preserves all existing data and uses IF NOT EXISTS patterns

-- ============================================
-- 1. branches - Add missing columns if not exist
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'delivery_order_multiplier_enabled') THEN
    ALTER TABLE branches ADD COLUMN delivery_order_multiplier_enabled BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'default_order_rate') THEN
    ALTER TABLE branches ADD COLUMN default_order_rate NUMERIC DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'default_trip_rate') THEN
    ALTER TABLE branches ADD COLUMN default_trip_rate NUMERIC DEFAULT 10;
  END IF;
END $$;

-- ============================================
-- 2. riders - Ensure all columns exist
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'profile_id') THEN
    ALTER TABLE riders ADD COLUMN profile_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'auth_user_id') THEN
    ALTER TABLE riders ADD COLUMN auth_user_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'name') THEN
    ALTER TABLE riders ADD COLUMN name TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'username') THEN
    ALTER TABLE riders ADD COLUMN username TEXT UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'phone') THEN
    ALTER TABLE riders ADD COLUMN phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'branch_id') THEN
    ALTER TABLE riders ADD COLUMN branch_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'branch_name') THEN
    ALTER TABLE riders ADD COLUMN branch_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'level') THEN
    ALTER TABLE riders ADD COLUMN level TEXT DEFAULT 'junior';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'hourly_rate') THEN
    ALTER TABLE riders ADD COLUMN hourly_rate NUMERIC DEFAULT 19.25;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'order_rate') THEN
    ALTER TABLE riders ADD COLUMN order_rate NUMERIC DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'trip_rate') THEN
    ALTER TABLE riders ADD COLUMN trip_rate NUMERIC DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'monthly_incentive_base') THEN
    ALTER TABLE riders ADD COLUMN monthly_incentive_base NUMERIC DEFAULT 750;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'quarterly_incentive_base') THEN
    ALTER TABLE riders ADD COLUMN quarterly_incentive_base NUMERIC DEFAULT 750;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'shift_start') THEN
    ALTER TABLE riders ADD COLUMN shift_start TIME;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'shift_end') THEN
    ALTER TABLE riders ADD COLUMN shift_end TIME;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'weekly_day_off') THEN
    ALTER TABLE riders ADD COLUMN weekly_day_off TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'status') THEN
    ALTER TABLE riders ADD COLUMN status TEXT DEFAULT 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'notes') THEN
    ALTER TABLE riders ADD COLUMN notes TEXT;
  END IF;
END $$;

-- ============================================
-- 3. customers - Ensure all columns exist
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'customer_code') THEN
    ALTER TABLE customers ADD COLUMN customer_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'customer_name') THEN
    ALTER TABLE customers ADD COLUMN customer_name TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'phone') THEN
    ALTER TABLE customers ADD COLUMN phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address') THEN
    ALTER TABLE customers ADD COLUMN address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'branch_id') THEN
    ALTER TABLE customers ADD COLUMN branch_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'active') THEN
    ALTER TABLE customers ADD COLUMN active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- ============================================
-- 4. delivery_orders - Ensure all columns exist
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'order_multiplier') THEN
    ALTER TABLE delivery_orders ADD COLUMN order_multiplier NUMERIC DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'order_rate') THEN
    ALTER TABLE delivery_orders ADD COLUMN order_rate NUMERIC DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'order_earning') THEN
    ALTER TABLE delivery_orders ADD COLUMN order_earning NUMERIC DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'multiplier_reason') THEN
    ALTER TABLE delivery_orders ADD COLUMN multiplier_reason TEXT;
  END IF;
END $$;

-- ============================================
-- 5. internal_trips - Add missing columns
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'internal_trips' AND column_name = 'has_invoice_reference') THEN
    ALTER TABLE internal_trips ADD COLUMN has_invoice_reference BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'internal_trips' AND column_name = 'trip_rate') THEN
    ALTER TABLE internal_trips ADD COLUMN trip_rate NUMERIC DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'internal_trips' AND column_name = 'trip_multiplier') THEN
    ALTER TABLE internal_trips ADD COLUMN trip_multiplier NUMERIC DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'internal_trips' AND column_name = 'trip_earning') THEN
    ALTER TABLE internal_trips ADD COLUMN trip_earning NUMERIC DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'internal_trips' AND column_name = 'needs_review') THEN
    ALTER TABLE internal_trips ADD COLUMN needs_review BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'internal_trips' AND column_name = 'review_reason') THEN
    ALTER TABLE internal_trips ADD COLUMN review_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'internal_trips' AND column_name = 'related_invoice_number') THEN
    ALTER TABLE internal_trips ADD COLUMN related_invoice_number TEXT;
  END IF;
END $$;

-- ============================================
-- 6. quick_destinations - Create table
-- ============================================
CREATE TABLE IF NOT EXISTS quick_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quick_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  destination_type TEXT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed quick destinations
INSERT INTO quick_destinations (quick_code, name, destination_type, branch_id, active)
VALUES 
  ('1', 'مخزن المعداوي', 'warehouse', NULL, true),
  ('2', 'مخزن الحياة', 'warehouse', NULL, true),
  ('3', 'مخزن سونيستا', 'warehouse', NULL, true),
  ('4', 'مخزن الهاشم', 'warehouse', NULL, true),
  ('5', 'فرع شكري', 'branch', (SELECT id FROM branches WHERE code = 'SHOKRY' LIMIT 1), true),
  ('6', 'فرع الشامي', 'branch', (SELECT id FROM branches WHERE code = 'SHAMI' LIMIT 1), true),
  ('7', 'فرع أبو العزم', 'branch', (SELECT id FROM branches WHERE code = 'ABOULAZM' LIMIT 1), true)
ON CONFLICT (quick_code) DO NOTHING;

-- ============================================
-- 7. rider_schedule_templates - Ensure columns exist
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rider_schedule_templates' AND column_name = 'branch_name') THEN
    ALTER TABLE rider_schedule_templates ADD COLUMN branch_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rider_schedule_templates' AND column_name = 'planned_hours') THEN
    ALTER TABLE rider_schedule_templates ADD COLUMN planned_hours NUMERIC;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rider_schedule_templates' AND column_name = 'crosses_midnight') THEN
    ALTER TABLE rider_schedule_templates ADD COLUMN crosses_midnight BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ============================================
-- 8. rider_schedule_exceptions - Ensure columns exist
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rider_schedule_exceptions' AND column_name = 'branch_id') THEN
    ALTER TABLE rider_schedule_exceptions ADD COLUMN branch_id UUID;
  END IF;
END $$;

-- ============================================
-- 9. delivery_audit_log - Create table if not exists
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name TEXT,
  action TEXT,
  record_id UUID,
  actor_id UUID,
  actor_name TEXT,
  old_data JSONB,
  new_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 10. Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_riders_username ON riders(username);
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_customer_name ON customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_number ON delivery_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider_id ON delivery_orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_delivery_date ON delivery_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_is_duplicate_invoice ON delivery_orders(is_duplicate_invoice);
CREATE INDEX IF NOT EXISTS idx_internal_trips_rider_id ON internal_trips(rider_id);
CREATE INDEX IF NOT EXISTS idx_internal_trips_trip_date ON internal_trips(trip_date);
CREATE INDEX IF NOT EXISTS idx_internal_trips_has_invoice_reference ON internal_trips(has_invoice_reference);
CREATE INDEX IF NOT EXISTS idx_quick_destinations_quick_code ON quick_destinations(quick_code);
CREATE INDEX IF NOT EXISTS idx_rider_schedule_templates_rider_id ON rider_schedule_templates(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_schedule_exceptions_rider_id_date ON rider_schedule_exceptions(rider_id, exception_date);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
