-- Safe Migration for Dawaa Delivery Control
-- Phase 2: Database Schema for Real Delivery Operations
-- This migration preserves all existing data and uses IF NOT EXISTS patterns

-- ============================================
-- 1. branches
-- ============================================
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  address TEXT,
  active BOOLEAN DEFAULT true,
  delivery_order_multiplier_enabled BOOLEAN DEFAULT false,
  default_order_rate NUMERIC DEFAULT 10,
  default_trip_rate NUMERIC DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns if they don't exist
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

-- Seed branches if they don't exist
INSERT INTO branches (name, code, address, active, delivery_order_multiplier_enabled, default_order_rate, default_trip_rate)
VALUES 
  ('فرع الشامي', 'SHAMI', NULL, true, false, 10, 10),
  ('فرع أبو العزم', 'ABOULAZM', NULL, true, false, 10, 10),
  ('فرع شكري', 'SHOKRY', NULL, true, true, 10, 10)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 2. riders
-- ============================================
CREATE TABLE IF NOT EXISTS riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID,
  auth_user_id UUID,
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  phone TEXT,
  branch_id UUID,
  branch_name TEXT,
  level TEXT DEFAULT 'junior',
  hourly_rate NUMERIC DEFAULT 19.25,
  order_rate NUMERIC DEFAULT 10,
  trip_rate NUMERIC DEFAULT 10,
  monthly_incentive_base NUMERIC DEFAULT 750,
  quarterly_incentive_base NUMERIC DEFAULT 750,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'branch_name') THEN
    ALTER TABLE riders ADD COLUMN branch_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'quarterly_incentive_base') THEN
    ALTER TABLE riders ADD COLUMN quarterly_incentive_base NUMERIC DEFAULT 750;
  END IF;
END $$;

-- Seed riders if they don't exist
INSERT INTO riders (name, username, phone, branch_id, level, hourly_rate, order_rate, trip_rate, monthly_incentive_base, quarterly_incentive_base, status)
SELECT 
  rider_data.name,
  rider_data.username,
  rider_data.phone,
  (SELECT id FROM branches WHERE code = rider_data.branch_code LIMIT 1),
  'junior',
  19.25,
  10,
  10,
  750,
  750,
  'active'
FROM (VALUES
  ('أحمد وجيه', 'AHMED.WAGIH', NULL, 'SHAMI'),
  ('محمود', 'MAHMOUD', NULL, 'SHAMI'),
  ('أحمد البطل', 'AHMED.ELBATAL', NULL, 'SHAMI'),
  ('إسلام', 'ESLAM', NULL, 'SHAMI'),
  ('محمد حافظ', 'MOHAMED.HAFEZ', NULL, 'SHAMI'),
  ('يوسف عصام', 'YOUSSEF.ESSAM', NULL, 'SHAMI'),
  ('مدحت', 'MEDHAT', NULL, 'ABOULAZM'),
  ('حسين', 'HUSSEIN', NULL, 'ABOULAZM'),
  ('عم محمد سالم', 'MOHAMED.SALEM', NULL, 'ABOULAZM'),
  ('يوسف ماهر', 'YOUSSEF.MAHER', NULL, 'ABOULAZM'),
  ('يوسف عيد', 'YOUSSEF.EID', NULL, 'ABOULAZM'),
  ('مصطفى', 'MOSTAFA', NULL, 'ABOULAZM'),
  ('محمد شماتة', 'MOHAMED.SHEMATA', NULL, 'ABOULAZM')
) AS rider_data(name, username, phone, branch_code)
ON CONFLICT (username) DO NOTHING;

-- ============================================
-- 3. customers
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT,
  customer_name TEXT,
  phone TEXT,
  address TEXT,
  branch_id UUID,
  branch_name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'branch_name') THEN
    ALTER TABLE customers ADD COLUMN branch_name TEXT;
  END IF;
END $$;

-- ============================================
-- 4. attendance
-- ============================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  branch_id UUID,
  work_date DATE DEFAULT current_date,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  planned_shift_start TIMESTAMPTZ,
  planned_shift_end TIMESTAMPTZ,
  late_minutes INTEGER DEFAULT 0,
  early_leave_minutes INTEGER DEFAULT 0,
  total_minutes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance' AND column_name = 'early_leave_minutes') THEN
    ALTER TABLE attendance ADD COLUMN early_leave_minutes INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- 5. delivery_orders
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  branch_id UUID,
  branch_name TEXT,
  customer_id UUID,
  delivery_date DATE DEFAULT current_date,
  invoice_number TEXT NOT NULL,
  invoice_amount NUMERIC DEFAULT 0,
  customer_code_snapshot TEXT,
  customer_name_snapshot TEXT,
  customer_phone_snapshot TEXT,
  customer_address_snapshot TEXT,
  status TEXT DEFAULT 'registered',
  registered_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  failed_reason TEXT,
  notes TEXT,
  source TEXT DEFAULT 'rider_app',
  
  -- Duplicate invoice prevention fields
  is_duplicate_invoice BOOLEAN DEFAULT false,
  duplicate_reason TEXT,
  duplicate_note TEXT,
  original_order_id UUID,
  duplicate_review_status TEXT DEFAULT 'not_required',
  duplicate_reviewed_by UUID,
  duplicate_reviewed_at TIMESTAMPTZ,
  needs_review BOOLEAN DEFAULT false,
  review_reason TEXT,
  
  -- Earnings calculation fields
  order_multiplier NUMERIC DEFAULT 1,
  order_rate NUMERIC DEFAULT 10,
  order_earning NUMERIC DEFAULT 10,
  multiplier_reason TEXT,
  
  -- B-Connect reconciliation fields
  bconnect_match_status TEXT DEFAULT 'pending',
  bconnect_invoice_id UUID,
  matched_at TIMESTAMPTZ,
  matched_amount NUMERIC DEFAULT 0,
  reconciliation_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns if they don't exist
DO $$
BEGIN
  -- Duplicate invoice fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'is_duplicate_invoice') THEN
    ALTER TABLE delivery_orders ADD COLUMN is_duplicate_invoice BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'duplicate_reason') THEN
    ALTER TABLE delivery_orders ADD COLUMN duplicate_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'duplicate_note') THEN
    ALTER TABLE delivery_orders ADD COLUMN duplicate_note TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'original_order_id') THEN
    ALTER TABLE delivery_orders ADD COLUMN original_order_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'duplicate_review_status') THEN
    ALTER TABLE delivery_orders ADD COLUMN duplicate_review_status TEXT DEFAULT 'not_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'duplicate_reviewed_by') THEN
    ALTER TABLE delivery_orders ADD COLUMN duplicate_reviewed_by UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'duplicate_reviewed_at') THEN
    ALTER TABLE delivery_orders ADD COLUMN duplicate_reviewed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'needs_review') THEN
    ALTER TABLE delivery_orders ADD COLUMN needs_review BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'review_reason') THEN
    ALTER TABLE delivery_orders ADD COLUMN review_reason TEXT;
  END IF;
  
  -- Earnings fields
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
  
  -- B-Connect fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'bconnect_match_status') THEN
    ALTER TABLE delivery_orders ADD COLUMN bconnect_match_status TEXT DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'bconnect_invoice_id') THEN
    ALTER TABLE delivery_orders ADD COLUMN bconnect_invoice_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'matched_at') THEN
    ALTER TABLE delivery_orders ADD COLUMN matched_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'matched_amount') THEN
    ALTER TABLE delivery_orders ADD COLUMN matched_amount NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'reconciliation_notes') THEN
    ALTER TABLE delivery_orders ADD COLUMN reconciliation_notes TEXT;
  END IF;
END $$;

-- ============================================
-- 6. internal_trips
-- ============================================
CREATE TABLE IF NOT EXISTS internal_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  branch_id UUID,
  branch_name TEXT,
  trip_date DATE DEFAULT current_date,
  trip_type TEXT,
  from_label TEXT,
  to_label TEXT,
  reason TEXT NOT NULL,
  related_invoice_number TEXT,
  status TEXT DEFAULT 'pending_approval',
  registered_at TIMESTAMPTZ DEFAULT now(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  trip_rate NUMERIC DEFAULT 10,
  trip_multiplier NUMERIC DEFAULT 1,
  trip_earning NUMERIC DEFAULT 10,
  needs_review BOOLEAN DEFAULT false,
  review_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'internal_trips' AND column_name = 'related_invoice_number') THEN
    ALTER TABLE internal_trips ADD COLUMN related_invoice_number TEXT;
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
END $$;

-- ============================================
-- 7. rider_schedule_templates
-- ============================================
CREATE TABLE IF NOT EXISTS rider_schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  branch_id UUID,
  branch_name TEXT,
  day_of_week INTEGER,
  day_name_ar TEXT,
  is_day_off BOOLEAN DEFAULT false,
  shift_start TIME,
  shift_end TIME,
  planned_hours NUMERIC,
  crosses_midnight BOOLEAN DEFAULT false,
  effective_from DATE DEFAULT current_date,
  effective_to DATE,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rider_schedule_templates' AND column_name = 'branch_name') THEN
    ALTER TABLE rider_schedule_templates ADD COLUMN branch_name TEXT;
  END IF;
END $$;

-- ============================================
-- 8. rider_schedule_exceptions
-- ============================================
CREATE TABLE IF NOT EXISTS rider_schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  branch_id UUID,
  branch_name TEXT,
  exception_date DATE,
  exception_type TEXT,
  original_shift_start TIME,
  original_shift_end TIME,
  new_shift_start TIME,
  new_shift_end TIME,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  requested_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rider_schedule_exceptions' AND column_name = 'branch_name') THEN
    ALTER TABLE rider_schedule_exceptions ADD COLUMN branch_name TEXT;
  END IF;
END $$;

-- ============================================
-- 9. bconnect_sales_invoices
-- ============================================
CREATE TABLE IF NOT EXISTS bconnect_sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID,
  invoice_number TEXT NOT NULL,
  invoice_date DATE,
  customer_code TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  branch_id UUID,
  branch_name TEXT,
  invoice_amount NUMERIC DEFAULT 0,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 10. bconnect_import_batches
-- ============================================
CREATE TABLE IF NOT EXISTS bconnect_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT,
  period_start DATE,
  period_end DATE,
  uploaded_by UUID,
  rows_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 11. delivery_reconciliation_results
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_reconciliation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rider_id UUID,
  branch_id UUID,
  rider_name TEXT,
  branch_name TEXT,
  total_registered_orders INTEGER DEFAULT 0,
  matched_orders INTEGER DEFAULT 0,
  not_found_orders INTEGER DEFAULT 0,
  duplicate_orders INTEGER DEFAULT 0,
  approved_duplicate_orders INTEGER DEFAULT 0,
  pending_duplicate_orders INTEGER DEFAULT 0,
  amount_mismatch_orders INTEGER DEFAULT 0,
  total_trips INTEGER DEFAULT 0,
  approved_trips INTEGER DEFAULT 0,
  registered_order_earnings NUMERIC DEFAULT 0,
  matched_order_earnings NUMERIC DEFAULT 0,
  trip_earnings NUMERIC DEFAULT 0,
  total_earnings NUMERIC DEFAULT 0,
  score NUMERIC DEFAULT 100,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 12. rider_performance_daily
-- ============================================
CREATE TABLE IF NOT EXISTS rider_performance_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  branch_id UUID,
  performance_date DATE,
  orders_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  internal_trips_count INTEGER DEFAULT 0,
  approved_trips_count INTEGER DEFAULT 0,
  duplicate_invoices_count INTEGER DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  absence_count INTEGER DEFAULT 0,
  incidents_count INTEGER DEFAULT 0,
  rewards_amount NUMERIC DEFAULT 0,
  penalties_amount NUMERIC DEFAULT 0,
  estimated_earnings NUMERIC DEFAULT 0,
  performance_score NUMERIC DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 13. delivery_audit_log
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
-- Indexes
-- ============================================

-- Branches
CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);

-- Riders
CREATE INDEX IF NOT EXISTS idx_riders_username ON riders(username);
CREATE INDEX IF NOT EXISTS idx_riders_branch_id ON riders(branch_id);

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_customer_name ON customers(customer_name);

-- Delivery Orders
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_number ON delivery_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_delivery_date ON delivery_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider_id ON delivery_orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_branch_id ON delivery_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_is_duplicate_invoice ON delivery_orders(is_duplicate_invoice);

-- Internal Trips
CREATE INDEX IF NOT EXISTS idx_internal_trips_rider_id ON internal_trips(rider_id);
CREATE INDEX IF NOT EXISTS idx_internal_trips_trip_date ON internal_trips(trip_date);

-- B-Connect Sales Invoices
CREATE INDEX IF NOT EXISTS idx_bconnect_sales_invoices_invoice_number ON bconnect_sales_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_bconnect_sales_invoices_batch_id ON bconnect_sales_invoices(batch_id);

-- Delivery Reconciliation Results
CREATE INDEX IF NOT EXISTS idx_delivery_reconciliation_results_rider_period ON delivery_reconciliation_results(rider_id, period_start, period_end);

-- Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_rider_work_date ON attendance(rider_id, work_date);

-- Rider Schedule Templates
CREATE INDEX IF NOT EXISTS idx_rider_schedule_templates_rider_id ON rider_schedule_templates(rider_id);

-- Rider Schedule Exceptions
CREATE INDEX IF NOT EXISTS idx_rider_schedule_exceptions_rider_exception_date ON rider_schedule_exceptions(rider_id, exception_date);

-- Rider Performance Daily
CREATE INDEX IF NOT EXISTS idx_rider_performance_daily_rider_performance_date ON rider_performance_daily(rider_id, performance_date);

-- ============================================
-- Notify PostgREST to reload schema
-- ============================================
NOTIFY pgrst, 'reload schema';
