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

-- ===== DAWAA DELIVERY APP =====
-- Additive only. No destructive statements are used in the delivery module.

create table if not exists delivery_riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.user_profiles(id),
  branch_id uuid not null references branches(id),
  display_name text not null,
  phone text,
  tier text not null check (tier in ('senior', 'mid', 'junior')),
  hourly_rate numeric not null,
  order_rate numeric not null,
  internal_trip_rate numeric not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists delivery_customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  customer_code text not null unique,
  name text not null,
  phone text not null,
  address text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists delivery_attendance (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references delivery_riders(id),
  branch_id uuid not null references branches(id),
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  hourly_rate_snapshot numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint delivery_attendance_valid_time check (check_out_at is null or check_out_at >= check_in_at)
);

create table if not exists delivery_trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references delivery_riders(id),
  branch_id uuid not null references branches(id),
  status text not null default 'active' check (status in ('active', 'review', 'completed', 'cancelled')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  manual_return_reason text,
  reviewed_by uuid references public.user_profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint delivery_trips_valid_time check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists delivery_one_active_trip_per_rider
on delivery_trips (rider_id)
where status = 'active';

create table if not exists delivery_orders (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references delivery_trips(id) on delete cascade,
  rider_id uuid not null references delivery_riders(id),
  customer_id uuid not null references delivery_customers(id),
  invoice_no text not null,
  amount numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'returned', 'cancelled')),
  order_rate_snapshot numeric not null default 0,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_orders_invoice_no_required check (length(trim(invoice_no)) > 0)
);

create table if not exists delivery_internal_trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references delivery_riders(id),
  branch_id uuid not null references branches(id),
  reason text not null,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'completed', 'rejected')),
  internal_trip_rate_snapshot numeric not null default 0,
  approved_by uuid references public.user_profiles(id),
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists delivery_payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references delivery_riders(id),
  branch_id uuid not null references branches(id),
  period_start date not null,
  period_end date not null,
  adjustment_type text not null check (adjustment_type in ('bonus', 'deduction')),
  amount numeric not null check (amount >= 0),
  reason text not null,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists delivery_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  period_start date not null,
  period_end date not null,
  generated_by uuid references public.user_profiles(id),
  generated_at timestamptz not null default now(),
  notes text,
  unique (branch_id, period_start, period_end)
);

create table if not exists delivery_settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null unique references branches(id),
  internal_trip_requires_approval boolean not null default true,
  senior_hourly_rate numeric not null default 23,
  senior_order_rate numeric not null default 10,
  senior_internal_trip_rate numeric not null default 4,
  mid_hourly_rate numeric not null default 21.5,
  mid_order_rate numeric not null default 8,
  mid_internal_trip_rate numeric not null default 4,
  junior_hourly_rate numeric not null default 19.25,
  junior_order_rate numeric not null default 6,
  junior_internal_trip_rate numeric not null default 3,
  updated_by uuid references public.user_profiles(id),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_customers_branch_code_idx on delivery_customers (branch_id, customer_code);
create index if not exists delivery_customers_phone_idx on delivery_customers (phone);
create index if not exists delivery_customers_name_idx on delivery_customers using gin (to_tsvector('simple', name));
create index if not exists delivery_orders_trip_idx on delivery_orders (trip_id);
create index if not exists delivery_orders_rider_status_idx on delivery_orders (rider_id, status, created_at desc);
create index if not exists delivery_orders_customer_idx on delivery_orders (customer_id);
create index if not exists delivery_trips_branch_status_idx on delivery_trips (branch_id, status, started_at desc);
create index if not exists delivery_attendance_rider_time_idx on delivery_attendance (rider_id, check_in_at desc);
create index if not exists delivery_internal_trips_rider_status_idx on delivery_internal_trips (rider_id, status, created_at desc);
create index if not exists delivery_payroll_adjustments_period_idx on delivery_payroll_adjustments (rider_id, period_start, period_end);

create or replace function delivery_period_start(p_anchor date default current_date)
returns date
language sql
stable
as $$
  select case
    when extract(day from p_anchor)::int >= 26
      then make_date(extract(year from p_anchor)::int, extract(month from p_anchor)::int, 26)
    else (make_date(extract(year from p_anchor)::int, extract(month from p_anchor)::int, 26) - interval '1 month')::date
  end;
$$;

create or replace function delivery_period_end(p_anchor date default current_date)
returns date
language sql
stable
as $$
  select (delivery_period_start(p_anchor) + interval '1 month' - interval '1 day')::date;
$$;

create or replace function delivery_current_profile()
returns table (profile_id uuid, profile_role text, profile_branch_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select up.id, coalesce(up.role, ''), up.branch_id
  from public.user_profiles as up
  where up.id = auth.uid()
  limit 1;
$$;

create or replace function delivery_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles as up
    where up.id = auth.uid()
      and lower(coalesce(up.role, '')) in ('admin', 'super_admin', 'مدير عام')
  );
$$;

create or replace function delivery_is_shift_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles as up
    where up.id = auth.uid()
      and lower(coalesce(up.role, '')) in ('shift_manager', 'مدير شيفت')
  );
$$;

create or replace function delivery_current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select up.branch_id
  from public.user_profiles as up
  where up.id = auth.uid()
  limit 1;
$$;

create or replace function delivery_current_rider_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select dr.id
  from delivery_riders as dr
  where dr.user_id = auth.uid()
  limit 1;
$$;

create or replace function delivery_can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select delivery_is_admin()
    or (delivery_is_shift_manager() and delivery_current_branch_id() = p_branch_id);
$$;

create or replace function delivery_set_rate_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hourly_rate numeric;
  v_order_rate numeric;
  v_internal_trip_rate numeric;
begin
  select dr.hourly_rate, dr.order_rate, dr.internal_trip_rate
  into v_hourly_rate, v_order_rate, v_internal_trip_rate
  from delivery_riders as dr
  where dr.id = coalesce(new.rider_id, old.rider_id);

  if tg_table_name = 'delivery_attendance' and new.hourly_rate_snapshot = 0 then
    new.hourly_rate_snapshot := coalesce(v_hourly_rate, 0);
  elsif tg_table_name = 'delivery_orders' and new.order_rate_snapshot = 0 then
    new.order_rate_snapshot := coalesce(v_order_rate, 0);
  elsif tg_table_name = 'delivery_internal_trips' and new.internal_trip_rate_snapshot = 0 then
    new.internal_trip_rate_snapshot := coalesce(v_internal_trip_rate, 0);
  end if;

  return new;
end;
$$;

create or replace function delivery_distance_meters(
  p_from_lat numeric,
  p_from_lng numeric,
  p_to_lat numeric,
  p_to_lng numeric
)
returns numeric
language sql
immutable
as $$
  select 6371000 * 2 * asin(
    sqrt(
      power(sin(radians((p_to_lat - p_from_lat) / 2)), 2)
      + cos(radians(p_from_lat)) * cos(radians(p_to_lat))
      * power(sin(radians((p_to_lng - p_from_lng) / 2)), 2)
    )
  );
$$;

drop trigger if exists trg_delivery_attendance_rate_snapshot on delivery_attendance;
create trigger trg_delivery_attendance_rate_snapshot
before insert on delivery_attendance
for each row execute function delivery_set_rate_snapshots();

drop trigger if exists trg_delivery_orders_rate_snapshot on delivery_orders;
create trigger trg_delivery_orders_rate_snapshot
before insert on delivery_orders
for each row execute function delivery_set_rate_snapshots();

drop trigger if exists trg_delivery_internal_trips_rate_snapshot on delivery_internal_trips;
create trigger trg_delivery_internal_trips_rate_snapshot
before insert on delivery_internal_trips
for each row execute function delivery_set_rate_snapshots();

create or replace function delivery_audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_name text;
  v_role text;
begin
  select coalesce(up.display_name, up.username, up.email), coalesce(up.role, '')
  into v_user_name, v_role
  from public.user_profiles as up
  where up.id = auth.uid();

  insert into audit_logs (user_id, user_name, role, department, operation, details)
  values (
    auth.uid(),
    coalesce(v_user_name, 'unknown'),
    coalesce(v_role, ''),
    'delivery',
    tg_op || ' ' || tg_table_name,
    coalesce(new.id::text, old.id::text)
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_delivery_riders_audit on delivery_riders;
create trigger trg_delivery_riders_audit
after insert or update or delete on delivery_riders
for each row execute function delivery_audit_admin_change();

drop trigger if exists trg_delivery_settings_audit on delivery_settings;
create trigger trg_delivery_settings_audit
after insert or update or delete on delivery_settings
for each row execute function delivery_audit_admin_change();

create or replace function delivery_calculate_payroll(p_period_start date, p_period_end date)
returns table (
  rider_id uuid,
  rider_name text,
  tier text,
  hours_count numeric,
  delivered_orders_count bigint,
  internal_trips_count bigint,
  hourly_rate_snapshot numeric,
  order_rate_snapshot numeric,
  internal_trip_rate_snapshot numeric,
  gross_total numeric,
  bonuses_total numeric,
  deductions_total numeric,
  net_total numeric,
  pending_review_count bigint,
  unapproved_trips_count bigint,
  failed_orders_count bigint,
  can_approve_payroll boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with attendance as (
    select
      da.rider_id,
      round(coalesce(sum(extract(epoch from (coalesce(da.check_out_at, now()) - da.check_in_at)) / 3600), 0)::numeric, 2) as hours_count,
      coalesce(max(da.hourly_rate_snapshot), 0) as hourly_rate_snapshot
    from delivery_attendance as da
    where da.check_in_at::date between p_period_start and p_period_end
    group by da.rider_id
  ),
  orders as (
    select
      do2.rider_id,
      count(*) as delivered_orders_count,
      coalesce(max(do2.order_rate_snapshot), 0) as order_rate_snapshot
    from delivery_orders as do2
    where do2.status = 'delivered'
      and do2.delivered_at::date between p_period_start and p_period_end
    group by do2.rider_id
  ),
  internal_trips as (
    select
      dit.rider_id,
      count(*) as internal_trips_count,
      coalesce(max(dit.internal_trip_rate_snapshot), 0) as internal_trip_rate_snapshot
    from delivery_internal_trips as dit
    where dit.status in ('approved', 'completed')
      and dit.created_at::date between p_period_start and p_period_end
    group by dit.rider_id
  ),
  adjustments as (
    select
      dpa.rider_id,
      coalesce(sum(dpa.amount) filter (where dpa.adjustment_type = 'bonus'), 0) as bonuses_total,
      coalesce(sum(dpa.amount) filter (where dpa.adjustment_type = 'deduction'), 0) as deductions_total
    from delivery_payroll_adjustments as dpa
    where dpa.period_start = p_period_start
      and dpa.period_end = p_period_end
    group by dpa.rider_id
  ),
  review_issues as (
    select
      issue_rows.rider_id,
      count(*) filter (where issue_rows.issue_type = 'review') as pending_review_count,
      count(*) filter (where issue_rows.issue_type = 'unapproved_trip') as unapproved_trips_count,
      count(*) filter (where issue_rows.issue_type = 'failed_order') as failed_orders_count
    from (
      select dt.rider_id, 'review'::text as issue_type
      from delivery_trips as dt
      where dt.status = 'review'
        and dt.started_at::date between p_period_start and p_period_end
      union all
      select dit.rider_id, 'unapproved_trip'::text as issue_type
      from delivery_internal_trips as dit
      where dit.status = 'pending_approval'
        and dit.created_at::date between p_period_start and p_period_end
      union all
      select do4.rider_id, 'failed_order'::text as issue_type
      from delivery_orders as do4
      where do4.status in ('returned', 'cancelled')
        and do4.created_at::date between p_period_start and p_period_end
    ) as issue_rows
    group by issue_rows.rider_id
  )
  select
    dr.id as rider_id,
    dr.display_name as rider_name,
    dr.tier,
    coalesce(a.hours_count, 0) as hours_count,
    coalesce(o.delivered_orders_count, 0) as delivered_orders_count,
    coalesce(it.internal_trips_count, 0) as internal_trips_count,
    coalesce(a.hourly_rate_snapshot, dr.hourly_rate) as hourly_rate_snapshot,
    coalesce(o.order_rate_snapshot, dr.order_rate) as order_rate_snapshot,
    coalesce(it.internal_trip_rate_snapshot, dr.internal_trip_rate) as internal_trip_rate_snapshot,
    round((
      coalesce(a.hours_count, 0) * coalesce(a.hourly_rate_snapshot, dr.hourly_rate)
      + coalesce(o.delivered_orders_count, 0) * coalesce(o.order_rate_snapshot, dr.order_rate)
      + coalesce(it.internal_trips_count, 0) * coalesce(it.internal_trip_rate_snapshot, dr.internal_trip_rate)
    )::numeric, 2) as gross_total,
    coalesce(adj.bonuses_total, 0) as bonuses_total,
    coalesce(adj.deductions_total, 0) as deductions_total,
    round((
      coalesce(a.hours_count, 0) * coalesce(a.hourly_rate_snapshot, dr.hourly_rate)
      + coalesce(o.delivered_orders_count, 0) * coalesce(o.order_rate_snapshot, dr.order_rate)
      + coalesce(it.internal_trips_count, 0) * coalesce(it.internal_trip_rate_snapshot, dr.internal_trip_rate)
      + coalesce(adj.bonuses_total, 0)
      - coalesce(adj.deductions_total, 0)
    )::numeric, 2) as net_total,
    coalesce(ri.pending_review_count, 0) as pending_review_count,
    coalesce(ri.unapproved_trips_count, 0) as unapproved_trips_count,
    coalesce(ri.failed_orders_count, 0) as failed_orders_count,
    (coalesce(ri.pending_review_count, 0) = 0 and coalesce(ri.unapproved_trips_count, 0) = 0) as can_approve_payroll
  from delivery_riders as dr
  left join attendance as a on a.rider_id = dr.id
  left join orders as o on o.rider_id = dr.id
  left join internal_trips as it on it.rider_id = dr.id
  left join adjustments as adj on adj.rider_id = dr.id
  left join review_issues as ri on ri.rider_id = dr.id
  where dr.is_active = true
    and (delivery_is_admin() or delivery_can_access_branch(dr.branch_id) or dr.id = delivery_current_rider_id())
  order by dr.display_name;
$$;

alter table delivery_riders enable row level security;
alter table delivery_customers enable row level security;
alter table delivery_attendance enable row level security;
alter table delivery_trips enable row level security;
alter table delivery_orders enable row level security;
alter table delivery_internal_trips enable row level security;
alter table delivery_payroll_adjustments enable row level security;
alter table delivery_payroll_runs enable row level security;
alter table delivery_settings enable row level security;

drop policy if exists delivery_riders_access on delivery_riders;
create policy delivery_riders_access on delivery_riders
for all using (delivery_can_access_branch(branch_id) or id = delivery_current_rider_id())
with check (delivery_can_access_branch(branch_id) or id = delivery_current_rider_id());

drop policy if exists delivery_customers_access on delivery_customers;
create policy delivery_customers_access on delivery_customers
for select using (
  delivery_can_access_branch(branch_id)
  or exists (
    select 1
    from delivery_orders as do3
    where do3.customer_id = delivery_customers.id
      and do3.rider_id = delivery_current_rider_id()
  )
);

drop policy if exists delivery_customers_admin_write on delivery_customers;
create policy delivery_customers_admin_write on delivery_customers
for all using (delivery_can_access_branch(branch_id))
with check (delivery_can_access_branch(branch_id));

drop policy if exists delivery_attendance_access on delivery_attendance;
create policy delivery_attendance_access on delivery_attendance
for all using (delivery_can_access_branch(branch_id) or rider_id = delivery_current_rider_id())
with check (delivery_can_access_branch(branch_id) or rider_id = delivery_current_rider_id());

drop policy if exists delivery_trips_access on delivery_trips;
create policy delivery_trips_access on delivery_trips
for all using (delivery_can_access_branch(branch_id) or rider_id = delivery_current_rider_id())
with check (delivery_can_access_branch(branch_id) or rider_id = delivery_current_rider_id());

drop policy if exists delivery_orders_access on delivery_orders;
create policy delivery_orders_access on delivery_orders
for all using (
  rider_id = delivery_current_rider_id()
  or exists (
    select 1 from delivery_trips as dt
    where dt.id = delivery_orders.trip_id
      and delivery_can_access_branch(dt.branch_id)
  )
)
with check (
  rider_id = delivery_current_rider_id()
  or exists (
    select 1 from delivery_trips as dt
    where dt.id = delivery_orders.trip_id
      and delivery_can_access_branch(dt.branch_id)
  )
);

drop policy if exists delivery_internal_trips_access on delivery_internal_trips;
create policy delivery_internal_trips_access on delivery_internal_trips
for all using (delivery_can_access_branch(branch_id) or rider_id = delivery_current_rider_id())
with check (delivery_can_access_branch(branch_id) or rider_id = delivery_current_rider_id());

drop policy if exists delivery_payroll_adjustments_access on delivery_payroll_adjustments;
create policy delivery_payroll_adjustments_access on delivery_payroll_adjustments
for all using (delivery_can_access_branch(branch_id))
with check (delivery_can_access_branch(branch_id));

drop policy if exists delivery_payroll_runs_access on delivery_payroll_runs;
create policy delivery_payroll_runs_access on delivery_payroll_runs
for all using (delivery_is_admin() or branch_id = delivery_current_branch_id())
with check (delivery_is_admin() or branch_id = delivery_current_branch_id());

drop policy if exists delivery_settings_access on delivery_settings;
create policy delivery_settings_access on delivery_settings
for all using (delivery_can_access_branch(branch_id))
with check (delivery_can_access_branch(branch_id));

-- ===== DAWAA DELIVERY PRODUCTION HARDENING =====
-- Additive migration only: keeps existing delivery data and tightens behavior with RPCs/triggers.

alter table delivery_attendance add column if not exists check_in_lat numeric;
alter table delivery_attendance add column if not exists check_in_lng numeric;
alter table delivery_attendance add column if not exists check_in_accuracy numeric;
alter table delivery_attendance add column if not exists needs_review boolean not null default false;
alter table delivery_attendance add column if not exists review_reason text;

alter table delivery_trips add column if not exists start_lat numeric;
alter table delivery_trips add column if not exists start_lng numeric;
alter table delivery_trips add column if not exists start_accuracy numeric;
alter table delivery_trips add column if not exists return_lat numeric;
alter table delivery_trips add column if not exists return_lng numeric;
alter table delivery_trips add column if not exists return_accuracy numeric;
alter table delivery_trips add column if not exists needs_review boolean not null default false;
alter table delivery_trips add column if not exists review_reason text;

alter table delivery_orders add column if not exists customer_name_snapshot text;
alter table delivery_orders add column if not exists customer_code_snapshot text;
alter table delivery_orders add column if not exists customer_phone_snapshot text;
alter table delivery_orders add column if not exists customer_address_snapshot text;

alter table delivery_settings add column if not exists branch_lat numeric;
alter table delivery_settings add column if not exists branch_lng numeric;
alter table delivery_settings add column if not exists geofence_radius_meters numeric not null default 100;
alter table delivery_settings add column if not exists gps_accuracy_threshold_meters numeric not null default 100;
alter table delivery_settings add column if not exists max_normal_trip_minutes integer not null default 60;
alter table delivery_settings add column if not exists manual_return_requires_review boolean not null default true;

create table if not exists delivery_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.user_profiles(id),
  actor_name text,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

alter table delivery_audit_log enable row level security;

drop policy if exists delivery_audit_log_access on delivery_audit_log;
create policy delivery_audit_log_access on delivery_audit_log
for select using (delivery_is_admin() or delivery_is_shift_manager());

create index if not exists delivery_audit_log_record_idx on delivery_audit_log (table_name, record_id, created_at desc);
create index if not exists delivery_audit_log_actor_idx on delivery_audit_log (actor_user_id, created_at desc);
create index if not exists delivery_orders_invoice_idx on delivery_orders (invoice_no);
create index if not exists delivery_orders_status_created_idx on delivery_orders (status, created_at desc);

create or replace function delivery_is_allowed_actor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select delivery_is_admin()
    or delivery_is_shift_manager()
    or delivery_current_rider_id() is not null;
$$;

create or replace function delivery_search_customers(search_text text)
returns table (
  id uuid,
  name text,
  customer_code text,
  phone text,
  address text
)
language sql
stable
security definer
set search_path = public
as $$
  select dc.id, dc.name, dc.customer_code, dc.phone, dc.address
  from delivery_customers as dc
  where delivery_is_allowed_actor()
    and length(trim(coalesce(search_text, ''))) >= 2
    and (
      delivery_can_access_branch(dc.branch_id)
      or dc.branch_id = (
        select dr.branch_id
        from delivery_riders as dr
        where dr.id = delivery_current_rider_id()
        limit 1
      )
    )
    and (
      dc.name ilike '%' || trim(search_text) || '%'
      or dc.customer_code ilike '%' || trim(search_text) || '%'
      or dc.phone ilike '%' || trim(search_text) || '%'
    )
  order by dc.name
  limit 20;
$$;

create or replace function delivery_log_audit_event(
  p_action text,
  p_table_name text,
  p_record_id uuid,
  p_old_data jsonb,
  p_new_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  select coalesce(up.display_name, up.username, up.email)
  into v_actor_name
  from public.user_profiles as up
  where up.id = auth.uid();

  insert into delivery_audit_log (
    actor_user_id,
    actor_name,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  )
  values (
    auth.uid(),
    coalesce(v_actor_name, 'unknown'),
    p_action,
    p_table_name,
    p_record_id,
    p_old_data,
    p_new_data
  );
end;
$$;

create or replace function delivery_set_order_customer_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select dc.name, dc.customer_code, dc.phone, dc.address
  into new.customer_name_snapshot, new.customer_code_snapshot, new.customer_phone_snapshot, new.customer_address_snapshot
  from delivery_customers as dc
  where dc.id = new.customer_id;

  if length(trim(coalesce(new.invoice_no, ''))) = 0 then
    raise exception 'invoice_no is required';
  end if;

  return new;
end;
$$;

create or replace function delivery_protect_order_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if not delivery_is_admin() then
      raise exception 'Only admin can delete delivery orders';
    end if;
    perform delivery_log_audit_event('delete_order', tg_table_name, old.id, to_jsonb(old), null);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.rider_id is distinct from old.rider_id or new.trip_id is distinct from old.trip_id then
      raise exception 'Cannot change protected order ownership fields';
    end if;

    if new.invoice_no is distinct from old.invoice_no and not delivery_is_admin() then
      raise exception 'Only admin can edit invoice number';
    end if;

    if new.invoice_no is distinct from old.invoice_no then
      perform delivery_log_audit_event('update_invoice_number', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    elsif new.status is distinct from old.status then
      perform delivery_log_audit_event('change_order_status', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    else
      perform delivery_log_audit_event('update_order', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    end if;
  elsif tg_op = 'INSERT' then
    perform delivery_log_audit_event('create_order', tg_table_name, new.id, null, to_jsonb(new));
  end if;

  return new;
end;
$$;

create or replace function delivery_protect_trip_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if not delivery_is_admin() and not delivery_is_shift_manager() then
      if current_setting('app.delivery_rpc', true) = 'true' then
        return new;
      end if;

      if new.rider_id is distinct from old.rider_id
        or new.branch_id is distinct from old.branch_id
        or new.started_at is distinct from old.started_at
        or new.ended_at is distinct from old.ended_at then
        raise exception 'Rider cannot edit protected trip fields';
      end if;
    end if;

    if new.status is distinct from old.status or new.needs_review is distinct from old.needs_review then
      perform delivery_log_audit_event('change_trip_status', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    else
      perform delivery_log_audit_event('update_trip', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    end if;
  end if;

  return new;
end;
$$;

create or replace function delivery_audit_important_table()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform delivery_log_audit_event(
    lower(tg_op) || '_' || tg_table_name,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_delivery_orders_snapshot') then
    create trigger trg_delivery_orders_snapshot
    before insert on delivery_orders
    for each row execute function delivery_set_order_customer_snapshot();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_delivery_orders_protect_audit') then
    create trigger trg_delivery_orders_protect_audit
    after insert or update or delete on delivery_orders
    for each row execute function delivery_protect_order_changes();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_delivery_trips_protect_audit') then
    create trigger trg_delivery_trips_protect_audit
    before update on delivery_trips
    for each row execute function delivery_protect_trip_changes();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_delivery_internal_trips_audit') then
    create trigger trg_delivery_internal_trips_audit
    after insert or update on delivery_internal_trips
    for each row execute function delivery_audit_important_table();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_delivery_payroll_adjustments_audit') then
    create trigger trg_delivery_payroll_adjustments_audit
    after insert or update on delivery_payroll_adjustments
    for each row execute function delivery_audit_important_table();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_delivery_payroll_runs_audit') then
    create trigger trg_delivery_payroll_runs_audit
    after insert or update on delivery_payroll_runs
    for each row execute function delivery_audit_important_table();
  end if;
end $$;

create or replace function delivery_start_attendance(
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric,
  p_gps_review boolean,
  p_gps_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider delivery_riders%rowtype;
  v_settings delivery_settings%rowtype;
  v_needs_review boolean;
  v_reason text;
  v_id uuid;
begin
  select * into v_rider from delivery_riders as dr where dr.user_id = auth.uid() and dr.is_active = true;
  if v_rider.id is null then
    raise exception 'Active rider profile is required';
  end if;

  select * into v_settings from delivery_settings as ds where ds.branch_id = v_rider.branch_id;
  v_needs_review := coalesce(p_gps_review, false);
  v_reason := nullif(p_gps_reason, '');

  if p_accuracy is null or p_accuracy > coalesce(v_settings.gps_accuracy_threshold_meters, 100) then
    v_needs_review := true;
    v_reason := coalesce(v_reason || '; ', '') || 'GPS accuracy is weak';
  end if;

  if v_settings.branch_lat is null or v_settings.branch_lng is null or p_lat is null or p_lng is null then
    v_needs_review := true;
    v_reason := coalesce(v_reason || '; ', '') || 'Branch geofence is not configured or GPS is missing';
  elsif delivery_distance_meters(p_lat, p_lng, v_settings.branch_lat, v_settings.branch_lng) > coalesce(v_settings.geofence_radius_meters, 100) then
    v_needs_review := true;
    v_reason := coalesce(v_reason || '; ', '') || 'Check-in is outside branch geofence';
  end if;

  insert into delivery_attendance (
    rider_id,
    branch_id,
    check_in_lat,
    check_in_lng,
    check_in_accuracy,
    needs_review,
    review_reason
  )
  values (v_rider.id, v_rider.branch_id, p_lat, p_lng, p_accuracy, v_needs_review, v_reason)
  returning id into v_id;

  perform delivery_log_audit_event('attendance_check_in', 'delivery_attendance', v_id, null, jsonb_build_object('needs_review', v_needs_review, 'review_reason', v_reason));
  return v_id;
end;
$$;

create or replace function delivery_start_run(
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric,
  p_gps_review boolean,
  p_gps_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider delivery_riders%rowtype;
  v_settings delivery_settings%rowtype;
  v_needs_review boolean;
  v_reason text;
  v_id uuid;
begin
  select * into v_rider from delivery_riders as dr where dr.user_id = auth.uid() and dr.is_active = true;
  if v_rider.id is null then
    raise exception 'Active rider profile is required';
  end if;

  if exists (select 1 from delivery_trips as dt where dt.rider_id = v_rider.id and dt.status = 'active') then
    raise exception 'Rider already has an active delivery run';
  end if;

  select * into v_settings from delivery_settings as ds where ds.branch_id = v_rider.branch_id;
  v_needs_review := coalesce(p_gps_review, false);
  v_reason := nullif(p_gps_reason, '');

  if p_accuracy is null or p_accuracy > coalesce(v_settings.gps_accuracy_threshold_meters, 100) then
    v_needs_review := true;
    v_reason := coalesce(v_reason || '; ', '') || 'GPS accuracy is weak';
  end if;

  insert into delivery_trips (
    rider_id,
    branch_id,
    status,
    start_lat,
    start_lng,
    start_accuracy,
    needs_review,
    review_reason
  )
  values (v_rider.id, v_rider.branch_id, 'active', p_lat, p_lng, p_accuracy, v_needs_review, v_reason)
  returning id into v_id;

  perform delivery_log_audit_event('start_delivery_run', 'delivery_trips', v_id, null, jsonb_build_object('needs_review', v_needs_review, 'review_reason', v_reason));
  return v_id;
end;
$$;

create or replace function delivery_finish_run(
  p_trip_id uuid,
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric,
  p_gps_review boolean,
  p_gps_reason text,
  p_manual_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip delivery_trips%rowtype;
  v_settings delivery_settings%rowtype;
  v_needs_review boolean;
  v_reason text;
  v_duration_minutes numeric;
begin
  select * into v_trip from delivery_trips as dt where dt.id = p_trip_id for update;
  if v_trip.id is null then
    raise exception 'Delivery run not found';
  end if;

  if v_trip.rider_id is distinct from delivery_current_rider_id() and not delivery_can_access_branch(v_trip.branch_id) then
    raise exception 'Not allowed to finish this delivery run';
  end if;

  select * into v_settings from delivery_settings as ds where ds.branch_id = v_trip.branch_id;
  v_needs_review := coalesce(p_gps_review, false) or coalesce(v_trip.needs_review, false);
  v_reason := concat_ws('; ', nullif(v_trip.review_reason, ''), nullif(p_gps_reason, ''));
  v_duration_minutes := extract(epoch from (now() - v_trip.started_at)) / 60;

  if p_accuracy is null or p_accuracy > coalesce(v_settings.gps_accuracy_threshold_meters, 100) then
    v_needs_review := true;
    v_reason := concat_ws('; ', v_reason, 'GPS accuracy is weak on return');
  end if;

  if v_settings.branch_lat is null or v_settings.branch_lng is null or p_lat is null or p_lng is null then
    v_needs_review := true;
    v_reason := concat_ws('; ', v_reason, 'Branch geofence is not configured or return GPS is missing');
  elsif delivery_distance_meters(p_lat, p_lng, v_settings.branch_lat, v_settings.branch_lng) > coalesce(v_settings.geofence_radius_meters, 100) then
    v_needs_review := true;
    v_reason := concat_ws('; ', v_reason, 'Return is outside branch geofence');
  end if;

  if v_duration_minutes > coalesce(v_settings.max_normal_trip_minutes, 60) then
    v_needs_review := true;
    v_reason := concat_ws('; ', v_reason, 'Delivery run exceeded normal duration');
  end if;

  if nullif(p_manual_reason, '') is not null and coalesce(v_settings.manual_return_requires_review, true) then
    v_needs_review := true;
    v_reason := concat_ws('; ', v_reason, 'Manual return: ' || p_manual_reason);
  end if;

  perform set_config('app.delivery_rpc', 'true', true);

  update delivery_trips
  set
    status = case when v_needs_review then 'review' else 'completed' end,
    ended_at = now(),
    return_lat = p_lat,
    return_lng = p_lng,
    return_accuracy = p_accuracy,
    needs_review = v_needs_review,
    review_reason = nullif(v_reason, ''),
    manual_return_reason = nullif(p_manual_reason, '')
  where id = p_trip_id;

  perform delivery_log_audit_event('finish_delivery_run', 'delivery_trips', p_trip_id, to_jsonb(v_trip), jsonb_build_object('needs_review', v_needs_review, 'review_reason', v_reason));
  return p_trip_id;
end;
$$;
