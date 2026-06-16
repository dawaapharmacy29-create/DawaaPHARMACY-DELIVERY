-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'shift_manager', 'rider')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
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
  username TEXT UNIQUE NOT NULL,
  phone TEXT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  level TEXT NOT NULL CHECK (level IN ('junior', 'mid', 'senior')),
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  order_rate NUMERIC NOT NULL DEFAULT 0,
  trip_rate NUMERIC NOT NULL DEFAULT 0,
  monthly_incentive_base NUMERIC NOT NULL DEFAULT 0,
  quarterly_incentive_base NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_code TEXT UNIQUE,
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
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'missing_checkout', 'needs_review')),
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
  delivery_date DATE NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_amount NUMERIC,
  customer_code_snapshot TEXT,
  customer_name_snapshot TEXT,
  customer_phone_snapshot TEXT,
  customer_address_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'delivered', 'failed', 'cancelled', 'needs_review')),
  bconnect_match_status TEXT NOT NULL DEFAULT 'pending' CHECK (bconnect_match_status IN ('pending', 'matched', 'invoice_not_found', 'customer_mismatch', 'branch_mismatch', 'manually_approved')),
  bconnect_invoice_id UUID,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  failed_reason TEXT,
  notes TEXT,
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
  trip_date DATE NOT NULL,
  trip_type TEXT NOT NULL CHECK (trip_type IN ('branch_to_branch', 'warehouse', 'purchase_missing_item', 'supplier', 'returns', 'collection', 'other')),
  from_label TEXT,
  to_label TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'completed', 'cancelled')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import batches table
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
  match_status TEXT NOT NULL CHECK (match_status IN ('matched', 'invoice_not_found', 'not_registered_by_rider', 'customer_mismatch', 'branch_mismatch', 'pending')),
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
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'paid')),
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
  incident_type TEXT NOT NULL CHECK (incident_type IN ('late_order', 'missing_order_registration', 'wrong_customer_code', 'wrong_invoice_number', 'customer_complaint', 'unjustified_trip', 'late_return', 'bad_behavior', 'other')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
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

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES riders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'success', 'warning', 'danger')),
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'resolved')),
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_attendance_rider_date ON attendance(rider_id, work_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider_date ON delivery_orders(rider_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice ON delivery_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_internal_trips_rider_date ON internal_trips(rider_id, trip_date);
CREATE INDEX IF NOT EXISTS idx_internal_trips_status ON internal_trips(status);
CREATE INDEX IF NOT EXISTS idx_bconnect_invoices_batch ON bconnect_invoices(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_bconnect_invoices_invoice ON bconnect_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_reconciliation_rider_period ON reconciliation_results(rider_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_monthly_payroll_rider_period ON monthly_payroll(rider_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_incidents_rider_date ON incidents(rider_id, incident_date);
CREATE INDEX IF NOT EXISTS idx_performance_scores_rider_period ON performance_scores(rider_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_profile_id, created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers to all tables that have updated_at
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_login_aliases_updated_at BEFORE UPDATE ON login_aliases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_riders_updated_at BEFORE UPDATE ON riders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_orders_updated_at BEFORE UPDATE ON delivery_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_internal_trips_updated_at BEFORE UPDATE ON internal_trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reconciliation_results_updated_at BEFORE UPDATE ON reconciliation_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monthly_payroll_updated_at BEFORE UPDATE ON monthly_payroll
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_performance_scores_updated_at BEFORE UPDATE ON performance_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
