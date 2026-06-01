-- Core schema for Dawaa Delivery on a fresh Supabase project
-- No dependency on existing tables beyond auth.users

create extension if not exists pgcrypto;

-- ===== USER PROFILES =====
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  username text not null unique,
  display_name text,
  role text not null default 'rider',
  branch_id uuid references public.delivery_branches(id),
  status text not null default 'active',
  phone text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== LOGIN ALIASES =====
create table if not exists public.delivery_login_aliases (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null,
  role text not null default 'rider',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- ===== BRANCHES =====
create table if not exists public.delivery_branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ===== LOCATIONS =====
create table if not exists public.delivery_locations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.delivery_branches(id),
  customer_id uuid references public.delivery_customers(id),
  location_type text not null default 'branch',
  name text,
  description text,
  lat numeric,
  lng numeric,
  radius_meters integer default 0,
  created_at timestamptz not null default now()
);

-- ===== RIDERS =====
create table if not exists public.delivery_riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  branch_id uuid not null references public.delivery_branches(id),
  display_name text not null,
  phone text,
  tier text not null default 'junior',
  is_active boolean not null default true,
  hourly_rate numeric not null default 0,
  order_rate numeric not null default 0,
  internal_trip_rate numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== CUSTOMERS =====
create table if not exists public.delivery_customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique,
  name text not null,
  phone text,
  address text,
  email text,
  branch_id uuid not null references public.delivery_branches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== ATTENDANCE =====
create table if not exists public.delivery_attendance (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.delivery_riders(id) on delete cascade,
  branch_id uuid not null references public.delivery_branches(id),
  checkin_at timestamptz not null default now(),
  checkin_lat numeric,
  checkin_lng numeric,
  checkin_accuracy numeric,
  gps_review boolean not null default false,
  gps_reason text,
  created_at timestamptz not null default now()
);

-- ===== DELIVERY RUNS =====
create table if not exists public.delivery_runs (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.delivery_riders(id) on delete cascade,
  branch_id uuid not null references public.delivery_branches(id),
  status text not null check (status in ('active','review','completed','cancelled')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  start_lat numeric,
  start_lng numeric,
  start_accuracy numeric,
  return_lat numeric,
  return_lng numeric,
  return_accuracy numeric,
  needs_review boolean not null default false,
  review_reason text,
  manual_return_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_delivery_runs_unique_active_per_rider
  on public.delivery_runs (rider_id)
  where status = 'active';

create view if not exists public.delivery_trips as
  select * from public.delivery_runs;

-- ===== DELIVERY ORDERS =====
create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.delivery_runs(id) on delete cascade,
  rider_id uuid not null references public.delivery_riders(id) on delete cascade,
  customer_id uuid not null references public.delivery_customers(id),
  invoice_no text not null,
  amount numeric not null default 0,
  status text not null check (status in ('pending','delivered','returned','cancelled')) default 'pending',
  customer_name_snapshot text not null,
  customer_code_snapshot text not null,
  customer_phone_snapshot text,
  customer_address_snapshot text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== INTERNAL TRIPS =====
create table if not exists public.delivery_internal_trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.delivery_riders(id) on delete cascade,
  branch_id uuid not null references public.delivery_branches(id),
  reason text not null,
  status text not null check (status in ('pending_approval','approved','completed','rejected')) default 'pending_approval',
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== PAYROLL PERIODS =====
create table if not exists public.delivery_payroll_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (start_date, end_date)
);

-- ===== PAYROLL RUNS =====
create table if not exists public.delivery_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.delivery_payroll_periods(id) on delete cascade,
  created_by uuid references public.user_profiles(id),
  status text not null default 'draft',
  total_amount numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== PAYROLL ADJUSTMENTS =====
create table if not exists public.delivery_payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.delivery_payroll_runs(id) on delete cascade,
  rider_id uuid not null references public.delivery_riders(id) on delete cascade,
  amount numeric not null,
  adjustment_type text not null check (adjustment_type in ('bonus','deduction','manual')),
  reason text,
  created_at timestamptz not null default now()
);

-- ===== SETTINGS =====
create table if not exists public.delivery_settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null unique references public.delivery_branches(id) on delete cascade,
  internal_trip_requires_approval boolean not null default true,
  branch_lat numeric,
  branch_lng numeric,
  geofence_radius_meters integer not null default 250,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== AUDIT LOG =====
create table if not exists public.delivery_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id),
  user_name text,
  role text,
  department text,
  operation text not null,
  branch text,
  details text,
  created_at timestamptz not null default now()
);

-- ===== INCIDENTS =====
create table if not exists public.delivery_incidents (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.delivery_riders(id),
  branch_id uuid references public.delivery_branches(id),
  order_id uuid references public.delivery_orders(id),
  trip_id uuid references public.delivery_runs(id),
  incident_type text not null,
  description text not null,
  status text not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now()
);
