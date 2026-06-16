-- Phase 2: Rider Schedule, Attendance, and Performance
-- Migration for rider management system

-- Ensure riders table has all required columns
DO $$
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE riders ADD COLUMN profile_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'auth_user_id'
  ) THEN
    ALTER TABLE riders ADD COLUMN auth_user_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'name'
  ) THEN
    ALTER TABLE riders ADD COLUMN name text not null default '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'username'
  ) THEN
    ALTER TABLE riders ADD COLUMN username text unique;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'phone'
  ) THEN
    ALTER TABLE riders ADD COLUMN phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE riders ADD COLUMN branch_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'level'
  ) THEN
    ALTER TABLE riders ADD COLUMN level text default 'junior';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'hourly_rate'
  ) THEN
    ALTER TABLE riders ADD COLUMN hourly_rate numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'order_rate'
  ) THEN
    ALTER TABLE riders ADD COLUMN order_rate numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'trip_rate'
  ) THEN
    ALTER TABLE riders ADD COLUMN trip_rate numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'monthly_incentive_base'
  ) THEN
    ALTER TABLE riders ADD COLUMN monthly_incentive_base numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'quarterly_incentive_base'
  ) THEN
    ALTER TABLE riders ADD COLUMN quarterly_incentive_base numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'status'
  ) THEN
    ALTER TABLE riders ADD COLUMN status text default 'active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'notes'
  ) THEN
    ALTER TABLE riders ADD COLUMN notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'shift_start'
  ) THEN
    ALTER TABLE riders ADD COLUMN shift_start time;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'shift_end'
  ) THEN
    ALTER TABLE riders ADD COLUMN shift_end time;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'weekly_day_off'
  ) THEN
    ALTER TABLE riders ADD COLUMN weekly_day_off text;
  END IF;
END $$;

-- Create rider_schedule_templates table
CREATE TABLE IF NOT EXISTS rider_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null,
  branch_id uuid not null,
  day_of_week integer not null check (day_of_week >= 0 and day_of_week <= 6),
  day_name_ar text not null,
  is_day_off boolean default false,
  shift_start time,
  shift_end time,
  planned_hours numeric default 0,
  crosses_midnight boolean default false,
  effective_from date default current_date,
  effective_to date,
  status text default 'active',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create rider_schedule_exceptions table
CREATE TABLE IF NOT EXISTS rider_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null,
  branch_id uuid not null,
  exception_date date not null,
  exception_type text not null check (exception_type in ('leave', 'permission', 'sick_leave', 'absence', 'schedule_change', 'holiday', 'emergency')),
  original_shift_start time,
  original_shift_end time,
  new_shift_start time,
  new_shift_end time,
  reason text,
  status text default 'pending',
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure attendance table has all required columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'attendance' AND column_name = 'planned_shift_start'
  ) THEN
    ALTER TABLE attendance ADD COLUMN planned_shift_start timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'attendance' AND column_name = 'planned_shift_end'
  ) THEN
    ALTER TABLE attendance ADD COLUMN planned_shift_end timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'attendance' AND column_name = 'late_minutes'
  ) THEN
    ALTER TABLE attendance ADD COLUMN late_minutes integer default 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'attendance' AND column_name = 'early_leave_minutes'
  ) THEN
    ALTER TABLE attendance ADD COLUMN early_leave_minutes integer default 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'attendance' AND column_name = 'status'
  ) THEN
    ALTER TABLE attendance ADD COLUMN status text check (status in ('present', 'late', 'absent', 'permission', 'leave', 'sick_leave', 'incomplete'));
  END IF;
END $$;

-- Create rider_performance_daily table
CREATE TABLE IF NOT EXISTS rider_performance_daily (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null,
  branch_id uuid not null,
  performance_date date not null,
  orders_count integer default 0,
  delivered_count integer default 0,
  failed_count integer default 0,
  internal_trips_count integer default 0,
  approved_trips_count integer default 0,
  duplicate_invoices_count integer default 0,
  late_minutes integer default 0,
  absence_count integer default 0,
  incidents_count integer default 0,
  rewards_amount numeric default 0,
  penalties_amount numeric default 0,
  estimated_earnings numeric default 0,
  performance_score numeric default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create rider_rewards_penalties table
CREATE TABLE IF NOT EXISTS rider_rewards_penalties (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null,
  branch_id uuid not null,
  event_date date not null,
  type text not null check (type in ('reward', 'penalty')),
  category text not null check (category in ('late', 'absence', 'duplicate_invoice', 'customer_complaint', 'excellent_performance', 'high_orders', 'approved_extra_trip', 'manual')),
  amount numeric,
  points numeric default 0,
  reason text not null,
  related_order_id uuid,
  related_trip_id uuid,
  status text default 'pending',
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create rider_import_batches table
CREATE TABLE IF NOT EXISTS rider_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  imported_by uuid,
  rows_count integer default 0,
  success_count integer default 0,
  update_count integer default 0,
  error_count integer default 0,
  warning_count integer default 0,
  created_at timestamptz default now()
);

-- Create rider_import_errors table
CREATE TABLE IF NOT EXISTS rider_import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  row_number integer,
  rider_name text,
  branch_name text,
  error_message text,
  raw_data jsonb,
  created_at timestamptz default now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_riders_username ON riders(username);
CREATE INDEX IF NOT EXISTS idx_riders_branch_id ON riders(branch_id);
CREATE INDEX IF NOT EXISTS idx_rider_schedule_templates_rider_id ON rider_schedule_templates(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_schedule_templates_branch_id ON rider_schedule_templates(branch_id);
CREATE INDEX IF NOT EXISTS idx_rider_schedule_templates_day_of_week ON rider_schedule_templates(day_of_week);
CREATE INDEX IF NOT EXISTS idx_rider_schedule_exceptions_rider_date ON rider_schedule_exceptions(rider_id, exception_date);
CREATE INDEX IF NOT EXISTS idx_attendance_rider_date ON attendance(rider_id, work_date);
CREATE INDEX IF NOT EXISTS idx_rider_performance_daily_rider_date ON rider_performance_daily(rider_id, performance_date);
CREATE INDEX IF NOT EXISTS idx_rider_rewards_penalties_rider_date ON rider_rewards_penalties(rider_id, event_date);

-- Add foreign key constraints
DO $$
BEGIN
  -- Add foreign key for rider_schedule_templates
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_rider_schedule_templates_rider_id'
  ) THEN
    ALTER TABLE rider_schedule_templates 
    ADD CONSTRAINT fk_rider_schedule_templates_rider_id 
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_rider_schedule_templates_branch_id'
  ) THEN
    ALTER TABLE rider_schedule_templates 
    ADD CONSTRAINT fk_rider_schedule_templates_branch_id 
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
  END IF;

  -- Add foreign key for rider_schedule_exceptions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_rider_schedule_exceptions_rider_id'
  ) THEN
    ALTER TABLE rider_schedule_exceptions 
    ADD CONSTRAINT fk_rider_schedule_exceptions_rider_id 
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_rider_schedule_exceptions_branch_id'
  ) THEN
    ALTER TABLE rider_schedule_exceptions 
    ADD CONSTRAINT fk_rider_schedule_exceptions_branch_id 
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
  END IF;

  -- Add foreign key for rider_performance_daily
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_rider_performance_daily_rider_id'
  ) THEN
    ALTER TABLE rider_performance_daily 
    ADD CONSTRAINT fk_rider_performance_daily_rider_id 
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_rider_performance_daily_branch_id'
  ) THEN
    ALTER TABLE rider_performance_daily 
    ADD CONSTRAINT fk_rider_performance_daily_branch_id 
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
  END IF;

  -- Add foreign key for rider_rewards_penalties
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_rider_rewards_penalties_rider_id'
  ) THEN
    ALTER TABLE rider_rewards_penalties 
    ADD CONSTRAINT fk_rider_rewards_penalties_rider_id 
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_rider_rewards_penalties_branch_id'
  ) THEN
    ALTER TABLE rider_rewards_penalties 
    ADD CONSTRAINT fk_rider_rewards_penalties_branch_id 
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
  END IF;

  -- Add foreign key for rider_import_errors
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_rider_import_errors_batch_id'
  ) THEN
    ALTER TABLE rider_import_errors 
    ADD CONSTRAINT fk_rider_import_errors_batch_id 
    FOREIGN KEY (batch_id) REFERENCES rider_import_batches(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_rider_schedule_templates_updated_at ON rider_schedule_templates;
CREATE TRIGGER update_rider_schedule_templates_updated_at
  BEFORE UPDATE ON rider_schedule_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rider_schedule_exceptions_updated_at ON rider_schedule_exceptions;
CREATE TRIGGER update_rider_schedule_exceptions_updated_at
  BEFORE UPDATE ON rider_schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rider_performance_daily_updated_at ON rider_performance_daily;
CREATE TRIGGER update_rider_performance_daily_updated_at
  BEFORE UPDATE ON rider_performance_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rider_rewards_penalties_updated_at ON rider_rewards_penalties;
CREATE TRIGGER update_rider_rewards_penalties_updated_at
  BEFORE UPDATE ON rider_rewards_penalties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
