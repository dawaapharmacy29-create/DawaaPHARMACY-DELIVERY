-- OnSpace Cloud / Supabase Database Schema
-- Pharmacy Purchasing Management System

-- ===== BRANCHES =====
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  monthly_limit numeric not null default 100000,
  warning_percent integer not null default 80,
  critical_percent integer not null default 100,
  created_at timestamptz default now()
);

-- ===== USER PROFILES (extends auth.users) =====
-- Uses existing user_profiles table, extended with:
-- role text, branch_id uuid, status text, phone text, display_name text

-- ===== SUPPLIERS =====
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  representative text,
  phone text,
  payment_type text not null default 'آجل',
  credit_days integer,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ===== PRODUCTS (medicines) =====
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  category text,
  branch_id uuid references branches(id),
  supplier_id uuid references suppliers(id),
  current_stock integer default 0,
  min_stock integer default 0,
  max_stock integer default 0,
  unit_price numeric default 0,
  status text default 'طبيعي',
  expiry_date date,
  days_since_sale integer default 0,
  suggested_action text,
  created_at timestamptz default now()
);

-- ===== PURCHASE INVOICES =====
create table if not exists purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  supplier_id uuid not null references suppliers(id),
  branch_id uuid not null references branches(id),
  date date not null default current_date,
  value numeric not null default 0,
  returned numeric default 0,
  remaining numeric default 0,
  payment_type text not null default 'آجل',
  payment_status text not null default 'غير مدفوع',
  review_status text not null default 'انتظار مراجعة',
  entered_by uuid references public.user_profiles(id),
  reviewed_by uuid references public.user_profiles(id),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===== PURCHASE INVOICE ITEMS =====
create table if not exists purchase_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  product_code text,
  product_name text not null,
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  total_price numeric not null default 0,
  created_at timestamptz default now()
);

-- ===== SUPPLIER PAYMENTS =====
create table if not exists supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id),
  invoice_id uuid references purchase_invoices(id),
  amount numeric not null,
  payment_method text default 'cash',
  payment_date date not null default current_date,
  notes text,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz default now()
);

-- ===== SUPPLIER RETURNS =====
create table if not exists supplier_returns (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  date date not null default current_date,
  supplier_id uuid not null references suppliers(id),
  branch_id uuid not null references branches(id),
  medicine_code text,
  medicine_name text not null,
  quantity integer not null default 1,
  value numeric not null default 0,
  reason text,
  status text default 'معلق',
  created_by uuid references public.user_profiles(id),
  created_at timestamptz default now()
);

-- ===== EXPENSES =====
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  branch_id uuid not null references branches(id),
  category text not null,
  description text not null,
  amount numeric not null,
  payment_method text default 'cash',
  responsible text,
  status text default 'انتظار',
  created_by uuid references public.user_profiles(id),
  created_at timestamptz default now()
);

-- ===== AUDIT LOGS =====
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id),
  user_name text,
  role text,
  department text,
  operation text not null,
  branch text,
  details text,
  created_at timestamptz default now()
);

-- ===== BRANCH SETTINGS =====
create table if not exists branch_settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null unique references branches(id),
  monthly_limit numeric not null default 100000,
  warning_percent integer not null default 80,
  critical_percent integer not null default 100,
  updated_at timestamptz default now()
);
