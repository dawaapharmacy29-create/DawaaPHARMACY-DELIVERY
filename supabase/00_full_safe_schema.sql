-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  address TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  display_name TEXT,
  role TEXT CHECK (role IN ('admin', 'shift_manager', 'rider')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Login aliases table for username to email resolution
CREATE TABLE IF NOT EXISTS login_aliases (
  username TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Riders table
CREATE TABLE IF NOT EXISTS riders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID UNIQUE REFERENCES user_profiles(id) ON DELETE SET NULL,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  phone TEXT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  level TEXT CHECK (level IN ('junior', 'mid', 'senior')),
  hourly_rate NUMERIC,
  order_rate NUMERIC,
  trip_rate NUMERIC,
  monthly_incentive_base NUMERIC,
  quarterly_incentive_base NUMERIC,
  shift_start TIME,
  shift_end TIME,
  weekly_day_off TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_code TEXT,
  customer_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  total_minutes INTEGER,
  status TEXT DEFAULT 'present' CHECK (status IN ('present', 'missing_checkout', 'needs_review')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rider_id, work_date)
);

-- Delivery orders table
CREATE TABLE IF NOT EXISTS delivery_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  delivery_date DATE DEFAULT CURRENT_DATE,
  invoice_number TEXT NOT NULL,
  invoice_amount NUMERIC,
  customer_code_snapshot TEXT,
  customer_name_snapshot TEXT,
  customer_phone_snapshot TEXT,
  customer_address_snapshot TEXT,
  status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'delivered', 'failed', 'cancelled', 'needs_review')),
  bconnect_match_status TEXT DEFAULT 'pending' CHECK (bconnect_match_status IN ('pending', 'matched', 'invoice_not_found', 'customer_mismatch', 'branch_mismatch', 'manually_approved')),
  bconnect_invoice_id UUID,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  failed_reason TEXT,
  notes TEXT,
  source TEXT DEFAULT 'rider_app',
  is_duplicate_invoice BOOLEAN DEFAULT false,
  duplicate_reason TEXT,
  duplicate_note TEXT,
  original_order_id UUID REFERENCES delivery_orders(id) ON DELETE SET NULL,
  duplicate_review_status TEXT DEFAULT 'not_required' CHECK (duplicate_review_status IN ('not_required', 'pending', 'approved', 'rejected')),
  duplicate_reviewed_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  duplicate_reviewed_at TIMESTAMPTZ,
  needs_review BOOLEAN DEFAULT false,
  review_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Internal trips table
CREATE TABLE IF NOT EXISTS internal_trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  trip_date DATE DEFAULT CURRENT_DATE,
  trip_type TEXT CHECK (trip_type IN ('branch_to_branch', 'warehouse', 'purchase_missing_item', 'supplier', 'returns', 'collection', 'other')),
  from_label TEXT,
  to_label TEXT,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'completed', 'cancelled')),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES riders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'success', 'warning', 'danger')),
  status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'resolved')),
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rider import batches table
CREATE TABLE IF NOT EXISTS rider_import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name TEXT NOT NULL,
  imported_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  rows_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rider import errors table
CREATE TABLE IF NOT EXISTS rider_import_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES rider_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER,
  rider_name TEXT,
  error_message TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import batches table (for B-Connect)
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name TEXT NOT NULL,
  imported_by UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rows_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- B-Connect invoices table
CREATE TABLE IF NOT EXISTS bconnect_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  customer_code TEXT,
  customer_name TEXT,
  phone TEXT,
  address TEXT,
  branch_code TEXT,
  invoice_date DATE,
  invoice_amount NUMERIC,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reconciliation results table
CREATE TABLE IF NOT EXISTS reconciliation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  delivery_order_id UUID REFERENCES delivery_orders(id) ON DELETE SET NULL,
  bconnect_invoice_id UUID REFERENCES bconnect_invoices(id) ON DELETE SET NULL,
  rider_id UUID REFERENCES riders(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  match_status TEXT CHECK (match_status IN ('matched', 'invoice_not_found', 'not_registered_by_rider', 'customer_mismatch', 'branch_mismatch', 'pending')),
  match_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly payroll table
CREATE TABLE IF NOT EXISTS monthly_payroll (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  level_snapshot TEXT NOT NULL,
  hourly_rate_snapshot NUMERIC NOT NULL,
  order_rate_snapshot NUMERIC NOT NULL,
  trip_rate_snapshot NUMERIC NOT NULL,
  monthly_incentive_base_snapshot NUMERIC NOT NULL,
  total_work_minutes INTEGER NOT NULL DEFAULT 0,
  total_work_hours NUMERIC NOT NULL DEFAULT 0,
  delivered_orders_count INTEGER NOT NULL DEFAULT 0,
  matched_orders_count INTEGER NOT NULL DEFAULT 0,
  approved_trips_count INTEGER NOT NULL DEFAULT 0,
  hours_amount NUMERIC NOT NULL DEFAULT 0,
  orders_amount NUMERIC NOT NULL DEFAULT 0,
  trips_amount NUMERIC NOT NULL DEFAULT 0,
  incentive_amount NUMERIC NOT NULL DEFAULT 0,
  bonuses_amount NUMERIC NOT NULL DEFAULT 0,
  penalties_amount NUMERIC NOT NULL DEFAULT 0,
  net_total NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rider_id, period_start, period_end)
);

-- Incidents table
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  order_id UUID REFERENCES delivery_orders(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES internal_trips(id) ON DELETE SET NULL,
  incident_date DATE NOT NULL,
  incident_type TEXT CHECK (incident_type IN ('late_order', 'missing_order_registration', 'wrong_customer_code', 'wrong_invoice_number', 'customer_complaint', 'unjustified_trip', 'late_return', 'bad_behavior', 'other')),
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  created_by UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ
);

-- Performance scores table
CREATE TABLE IF NOT EXISTS performance_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  invoice_match_score NUMERIC NOT NULL DEFAULT 0,
  registration_score NUMERIC NOT NULL DEFAULT 0,
  timing_score NUMERIC NOT NULL DEFAULT 0,
  trips_score NUMERIC NOT NULL DEFAULT 0,
  behavior_score NUMERIC NOT NULL DEFAULT 0,
  attendance_score NUMERIC NOT NULL DEFAULT 0,
  total_score NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rider_id, period_start, period_end)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_customer_name ON customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_number ON delivery_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_delivery_date ON delivery_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider_id ON delivery_orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_is_duplicate_invoice ON delivery_orders(is_duplicate_invoice);
CREATE INDEX IF NOT EXISTS idx_internal_trips_rider_id ON internal_trips(rider_id);
CREATE INDEX IF NOT EXISTS idx_internal_trips_trip_date ON internal_trips(trip_date);
CREATE INDEX IF NOT EXISTS idx_riders_username ON riders(username);
CREATE INDEX IF NOT EXISTS idx_riders_branch_id ON riders(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_rider_date ON attendance(rider_id, work_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_internal_trips_status ON internal_trips(status);
CREATE INDEX IF NOT EXISTS idx_bconnect_invoices_batch ON bconnect_invoices(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_bconnect_invoices_invoice ON bconnect_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_reconciliation_rider_period ON reconciliation_results(rider_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_monthly_payroll_rider_period ON monthly_payroll(rider_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_incidents_rider_date ON incidents(rider_id, incident_date);
CREATE INDEX IF NOT EXISTS idx_performance_scores_rider_period ON performance_scores(rider_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_profile_id, created_at);

-- Add missing columns to riders table if they don't exist
DO $$
BEGIN
  -- Add shift_start
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'shift_start'
  ) THEN
    ALTER TABLE riders ADD COLUMN shift_start TIME;
  END IF;

  -- Add shift_end
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'shift_end'
  ) THEN
    ALTER TABLE riders ADD COLUMN shift_end TIME;
  END IF;

  -- Add weekly_day_off
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'weekly_day_off'
  ) THEN
    ALTER TABLE riders ADD COLUMN weekly_day_off TEXT;
  END IF;

  -- Add notes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'notes'
  ) THEN
    ALTER TABLE riders ADD COLUMN notes TEXT;
  END IF;
END $$;

-- Add missing columns to delivery_orders table if they don't exist
DO $$
BEGIN
  -- Add source
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_orders' AND column_name = 'source'
  ) THEN
    ALTER TABLE delivery_orders ADD COLUMN source TEXT DEFAULT 'rider_app';
  END IF;

  -- Add is_duplicate_invoice
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_orders' AND column_name = 'is_duplicate_invoice'
  ) THEN
    ALTER TABLE delivery_orders ADD COLUMN is_duplicate_invoice BOOLEAN DEFAULT false;
  END IF;

  -- Add duplicate_reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_orders' AND column_name = 'duplicate_reason'
  ) THEN
    ALTER TABLE delivery_orders ADD COLUMN duplicate_reason TEXT;
  END IF;

  -- Add duplicate_note
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_orders' AND column_name = 'duplicate_note'
  ) THEN
    ALTER TABLE delivery_orders ADD COLUMN duplicate_note TEXT;
  END IF;

  -- Add original_order_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_orders' AND column_name = 'original_order_id'
  ) THEN
    ALTER TABLE delivery_orders ADD COLUMN original_order_id UUID REFERENCES delivery_orders(id) ON DELETE SET NULL;
  END IF;

  -- Add duplicate_review_status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_orders' AND column_name = 'duplicate_review_status'
  ) THEN
    ALTER TABLE delivery_orders ADD COLUMN duplicate_review_status TEXT DEFAULT 'not_required' CHECK (duplicate_review_status IN ('not_required', 'pending', 'approved', 'rejected'));
  END IF;

  -- Add duplicate_reviewed_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_orders' AND column_name = 'duplicate_reviewed_by'
  ) THEN
    ALTER TABLE delivery_orders ADD COLUMN duplicate_reviewed_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;
  END IF;

  -- Add duplicate_reviewed_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_orders' AND column_name = 'duplicate_reviewed_at'
  ) THEN
    ALTER TABLE delivery_orders ADD COLUMN duplicate_reviewed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers to all tables that have updated_at
DROP TRIGGER IF EXISTS update_branches_updated_at ON branches;
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_login_aliases_updated_at ON login_aliases;
CREATE TRIGGER update_login_aliases_updated_at BEFORE UPDATE ON login_aliases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_riders_updated_at ON riders;
CREATE TRIGGER update_riders_updated_at BEFORE UPDATE ON riders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_attendance_updated_at ON attendance;
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_delivery_orders_updated_at ON delivery_orders;
CREATE TRIGGER update_delivery_orders_updated_at BEFORE UPDATE ON delivery_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_internal_trips_updated_at ON internal_trips;
CREATE TRIGGER update_internal_trips_updated_at BEFORE UPDATE ON internal_trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reconciliation_results_updated_at ON reconciliation_results;
CREATE TRIGGER update_reconciliation_results_updated_at BEFORE UPDATE ON reconciliation_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_monthly_payroll_updated_at ON monthly_payroll;
CREATE TRIGGER update_monthly_payroll_updated_at BEFORE UPDATE ON monthly_payroll
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_performance_scores_updated_at ON performance_scores;
CREATE TRIGGER update_performance_scores_updated_at BEFORE UPDATE ON performance_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Rider schedule templates table
CREATE TABLE IF NOT EXISTS rider_schedule_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  day_name_ar TEXT NOT NULL,
  is_day_off BOOLEAN DEFAULT false,
  shift_start TIME,
  shift_end TIME,
  planned_hours NUMERIC DEFAULT 8,
  crosses_midnight BOOLEAN DEFAULT false,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rider schedule exceptions table
CREATE TABLE IF NOT EXISTS rider_schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  exception_type TEXT CHECK (exception_type IN ('leave', 'permission', 'sick_leave', 'absence', 'schedule_change', 'holiday', 'emergency')),
  original_shift_start TIME,
  original_shift_end TIME,
  new_shift_start TIME,
  new_shift_end TIME,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rider performance daily table
CREATE TABLE IF NOT EXISTS rider_performance_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  performance_date DATE NOT NULL,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rider_id, performance_date)
);

-- Rider rewards and penalties table
CREATE TABLE IF NOT EXISTS rider_rewards_penalties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  event_date DATE DEFAULT CURRENT_DATE,
  type TEXT CHECK (type IN ('reward', 'penalty')),
  category TEXT CHECK (category IN ('late', 'absence', 'duplicate_invoice', 'customer_complaint', 'excellent_performance', 'high_orders', 'approved_extra_trip', 'manual')),
  amount NUMERIC DEFAULT 0,
  points INTEGER DEFAULT 0,
  reason TEXT NOT NULL,
  related_order_id UUID REFERENCES delivery_orders(id) ON DELETE SET NULL,
  related_trip_id UUID REFERENCES internal_trips(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to attendance table if they don't exist
DO $$
BEGIN
  -- Add planned_shift_start
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance' AND column_name = 'planned_shift_start'
  ) THEN
    ALTER TABLE attendance ADD COLUMN planned_shift_start TIMESTAMPTZ;
  END IF;

  -- Add planned_shift_end
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance' AND column_name = 'planned_shift_end'
  ) THEN
    ALTER TABLE attendance ADD COLUMN planned_shift_end TIMESTAMPTZ;
  END IF;

  -- Add late_minutes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance' AND column_name = 'late_minutes'
  ) THEN
    ALTER TABLE attendance ADD COLUMN late_minutes INTEGER DEFAULT 0;
  END IF;

  -- Add early_leave_minutes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance' AND column_name = 'early_leave_minutes'
  ) THEN
    ALTER TABLE attendance ADD COLUMN early_leave_minutes INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add missing columns to rider_import_batches if they don't exist
DO $$
BEGIN
  -- Add update_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rider_import_batches' AND column_name = 'update_count'
  ) THEN
    ALTER TABLE rider_import_batches ADD COLUMN update_count INTEGER DEFAULT 0;
  END IF;

  -- Add warning_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rider_import_batches' AND column_name = 'warning_count'
  ) THEN
    ALTER TABLE rider_import_batches ADD COLUMN warning_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Create indexes for rider schedule tables
CREATE INDEX IF NOT EXISTS idx_rider_schedule_templates_rider_id ON rider_schedule_templates(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_schedule_templates_branch_id ON rider_schedule_templates(branch_id);
CREATE INDEX IF NOT EXISTS idx_rider_schedule_exceptions_rider_date ON rider_schedule_exceptions(rider_id, exception_date);
CREATE INDEX IF NOT EXISTS idx_rider_performance_daily_rider_date ON rider_performance_daily(rider_id, performance_date);
CREATE INDEX IF NOT EXISTS idx_rider_rewards_penalties_rider_date ON rider_rewards_penalties(rider_id, event_date);

-- Add updated_at triggers for new tables
DROP TRIGGER IF EXISTS update_rider_schedule_templates_updated_at ON rider_schedule_templates;
CREATE TRIGGER update_rider_schedule_templates_updated_at BEFORE UPDATE ON rider_schedule_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rider_schedule_exceptions_updated_at ON rider_schedule_exceptions;
CREATE TRIGGER update_rider_schedule_exceptions_updated_at BEFORE UPDATE ON rider_schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rider_performance_daily_updated_at ON rider_performance_daily;
CREATE TRIGGER update_rider_performance_daily_updated_at BEFORE UPDATE ON rider_performance_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rider_rewards_penalties_updated_at ON rider_rewards_penalties;
CREATE TRIGGER update_rider_rewards_penalties_updated_at BEFORE UPDATE ON rider_rewards_penalties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create RPC function for username resolution
CREATE OR REPLACE FUNCTION resolve_login_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Try to find email from login_aliases
  SELECT email INTO v_email
  FROM login_aliases
  WHERE username = p_username AND active = true
  LIMIT 1;

  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  -- If not found, return the username as-is (assuming it's an email)
  RETURN p_username;
END;
$$;

-- Seed branches
INSERT INTO branches (name, code, address, active)
VALUES 
  ('فرع الشامي', 'SHAMI', 'الشامي', true),
  ('فرع شكري', 'SHOKRY', 'شكري', true),
  ('فرع أبو العزم', 'ABO_ELAZM', 'أبو العزم', true),
  ('فرع تجريبي', 'TEST', 'تجريبي', true)
ON CONFLICT (code) DO NOTHING;

-- Seed login aliases
INSERT INTO login_aliases (username, email, active)
VALUES 
  ('DR.MOAZ', 'dr.moaz@dawaa-delivery.local', true),
  ('dr.moaz', 'dr.moaz@dawaa-delivery.local', true)
ON CONFLICT (username) DO NOTHING;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
