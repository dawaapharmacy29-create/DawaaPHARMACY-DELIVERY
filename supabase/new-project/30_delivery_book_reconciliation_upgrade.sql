-- =====================================================
-- Dawaa Delivery Book + BConnect Reconciliation Upgrade
-- Safe migration: creates/extends delivery app tables without dropping data.
-- =====================================================
create extension if not exists pgcrypto;

create table if not exists public.delivery_branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  phone text,
  address text,
  lat numeric,
  lng numeric,
  geofence_radius_meters integer default 100,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text,
  display_name text not null,
  role text not null default 'rider' check (role in ('super_admin','admin','shift_manager','rider')),
  branch_id uuid null,
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_login_aliases (
  login_name text primary key,
  email text not null,
  active boolean not null default true,
  role text not null default 'rider',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.delivery_resolve_login(login_name text)
returns text
language sql
security definer
set search_path = public
as $$
  select case
    when position('@' in trim(login_name)) > 0 then lower(trim(login_name))
    else (
      select lower(dla.email)
      from public.delivery_login_aliases dla
      where lower(dla.login_name) = lower(trim(login_name))
        and dla.active = true
      limit 1
    )
  end;
$$;
grant execute on function public.delivery_resolve_login(text) to anon, authenticated;

create table if not exists public.delivery_riders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.user_profiles(id),
  auth_user_id uuid references auth.users(id),
  name text not null,
  username text unique,
  phone text,
  branch_id uuid references public.delivery_branches(id),
  level text not null default 'senior' check (level in ('senior','mid','junior')),
  hourly_rate numeric not null default 23,
  order_rate numeric not null default 10,
  trip_rate numeric not null default 4,
  monthly_incentive_base numeric default 1000,
  quarterly_incentive_base numeric default 1000,
  status text default 'active' check (status in ('active','inactive','suspended')),
  current_status text default 'inside_branch',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.delivery_riders add column if not exists monthly_incentive_base numeric default 1000;
alter table public.delivery_riders add column if not exists quarterly_incentive_base numeric default 1000;

create table if not exists public.delivery_customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text,
  customer_name text not null,
  phone text,
  address text,
  branch_id uuid references public.delivery_branches(id),
  lat numeric,
  lng numeric,
  notes text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists delivery_customers_search_idx on public.delivery_customers (customer_code, phone, customer_name);

create table if not exists public.delivery_attendance (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.delivery_riders(id),
  branch_id uuid references public.delivery_branches(id),
  shift_date date not null default current_date,
  check_in_time timestamptz,
  check_out_time timestamptz,
  check_in_lat numeric,
  check_in_lng numeric,
  check_in_accuracy numeric,
  check_out_lat numeric,
  check_out_lng numeric,
  check_out_accuracy numeric,
  total_minutes integer default 0,
  status text default 'present',
  needs_review boolean default false,
  review_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.delivery_riders(id),
  branch_id uuid references public.delivery_branches(id),
  status text not null default 'active' check (status in ('active','review','completed','cancelled','pending_approval','approved','rejected')),
  started_at timestamptz default now(),
  ended_at timestamptz,
  start_lat numeric,
  start_lng numeric,
  start_accuracy numeric,
  return_lat numeric,
  return_lng numeric,
  return_accuracy numeric,
  needs_review boolean default false,
  review_reason text,
  manual_return_reason text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists delivery_one_active_trip_per_rider on public.delivery_trips(rider_id) where status = 'active';

create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.delivery_trips(id) on delete set null,
  run_id uuid references public.delivery_trips(id) on delete set null,
  rider_id uuid references public.delivery_riders(id),
  branch_id uuid references public.delivery_branches(id),
  customer_id uuid references public.delivery_customers(id),
  customer_name_snapshot text,
  customer_code_snapshot text,
  customer_phone_snapshot text,
  customer_address_snapshot text,
  invoice_number text,
  invoice_value numeric default 0,
  invoice_amount numeric default 0,
  payment_method text,
  status text default 'pending' check (status in ('pending','delivered','failed','returned','cancelled','needs_review','matched_with_bconnect','not_found_in_bconnect')),
  delivered_at timestamptz,
  delivered_time timestamptz,
  failed_reason text,
  bconnect_match_status text default 'not_imported',
  bconnect_invoice_id uuid,
  matched_at timestamptz,
  needs_review boolean default false,
  review_reason text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.delivery_orders add column if not exists bconnect_match_status text default 'not_imported';
alter table public.delivery_orders add column if not exists bconnect_invoice_id uuid;
alter table public.delivery_orders add column if not exists matched_at timestamptz;
alter table public.delivery_orders add column if not exists needs_review boolean default false;
alter table public.delivery_orders add column if not exists review_reason text;
create index if not exists delivery_orders_invoice_idx on public.delivery_orders(invoice_number);

create table if not exists public.delivery_internal_trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.delivery_riders(id),
  branch_id uuid references public.delivery_branches(id),
  trip_type text default 'other',
  from_label text,
  to_label text,
  reason text,
  status text default 'pending_approval' check (status in ('pending_approval','approved','completed','rejected','cancelled')),
  approved_by uuid references public.user_profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  imported_by uuid references public.user_profiles(id),
  period_start date,
  period_end date,
  rows_count integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.bconnect_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  customer_code text,
  customer_name text,
  phone text,
  address text,
  branch_code text,
  invoice_date date,
  invoice_amount numeric default 0,
  raw_data jsonb default '{}'::jsonb,
  import_batch_id uuid references public.import_batches(id),
  created_at timestamptz default now()
);
create index if not exists bconnect_invoices_invoice_idx on public.bconnect_invoices(invoice_number);

create table if not exists public.reconciliation_results (
  id uuid primary key default gen_random_uuid(),
  period_start date,
  period_end date,
  delivery_order_id uuid references public.delivery_orders(id),
  bconnect_invoice_id uuid references public.bconnect_invoices(id),
  invoice_number text,
  result_status text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.delivery_incidents (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.delivery_riders(id),
  trip_id uuid references public.delivery_trips(id),
  order_id uuid references public.delivery_orders(id),
  invoice_number text,
  incident_type text,
  severity text default 'medium',
  title text,
  description text,
  status text default 'open',
  created_by uuid references public.user_profiles(id),
  resolved_by uuid references public.user_profiles(id),
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.delivery_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid references public.user_profiles(id),
  rider_id uuid references public.delivery_riders(id),
  notification_type text,
  title text,
  message text,
  severity text default 'info',
  status text default 'unread',
  is_read boolean default false,
  action_url text,
  created_at timestamptz default now(),
  read_at timestamptz
);

create table if not exists public.delivery_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.user_profiles(id),
  actor_name text,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz default now()
);

create table if not exists public.delivery_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

insert into public.delivery_settings(key, value, description) values
('payroll_start_day','26','بداية الشهر التشغيلي'),
('max_normal_run_minutes','60','أقصى مدة طبيعية للخروجة'),
('gps_accuracy_threshold_meters','100','حد دقة GPS')
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();

-- Seed first branch / admin alias / demo customers
insert into public.delivery_branches(name, code, address) values ('فرع تجريبي','TEST','عنوان تجريبي')
on conflict(code) do update set name = excluded.name, address = excluded.address, updated_at = now();

insert into public.delivery_login_aliases(login_name,email,active,role) values ('DR.MOAZ','dr.moaz@dawaa-delivery.local',true,'admin')
on conflict(login_name) do update set email = excluded.email, active = true, role = 'admin', updated_at = now();

insert into public.delivery_customers(customer_code, customer_name, phone, address, branch_id)
select 'C001','عميل تجربة 1','01000000001','عنوان عميل تجربة 1', id from public.delivery_branches where code='TEST'
on conflict do nothing;
insert into public.delivery_customers(customer_code, customer_name, phone, address, branch_id)
select 'C002','عميل تجربة 2','01000000002','عنوان عميل تجربة 2', id from public.delivery_branches where code='TEST'
on conflict do nothing;

-- Link DR.MOAZ Auth user if it already exists
create or replace function public.delivery_link_admin_profile()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_user_id uuid;
  v_profile_id uuid;
  v_branch_id uuid;
begin
  select id into v_auth_user_id from auth.users where lower(email) = 'dr.moaz@dawaa-delivery.local' limit 1;
  if v_auth_user_id is null then
    raise exception 'Create Auth user dr.moaz@dawaa-delivery.local / 9493 first.';
  end if;
  select id into v_branch_id from public.delivery_branches where code='TEST' limit 1;
  select id into v_profile_id from public.user_profiles where auth_user_id = v_auth_user_id or lower(email)='dr.moaz@dawaa-delivery.local' limit 1;
  if v_profile_id is null then
    insert into public.user_profiles(auth_user_id,email,display_name,role,status,branch_id)
    values(v_auth_user_id,'dr.moaz@dawaa-delivery.local','DR.MOAZ','admin','active',null)
    returning id into v_profile_id;
  else
    update public.user_profiles set auth_user_id=v_auth_user_id,email='dr.moaz@dawaa-delivery.local',display_name='DR.MOAZ',role='admin',status='active',branch_id=null,updated_at=now() where id=v_profile_id;
  end if;
  insert into public.delivery_riders(profile_id, auth_user_id, name, username, branch_id, level, hourly_rate, order_rate, trip_rate, monthly_incentive_base, quarterly_incentive_base, status, current_status)
  values(v_profile_id, v_auth_user_id, 'DR.MOAZ', 'DR.MOAZ', v_branch_id, 'senior', 23, 10, 4, 1000, 1000, 'active', 'inside_branch')
  on conflict(username) do update set profile_id=excluded.profile_id, auth_user_id=excluded.auth_user_id, branch_id=excluded.branch_id, status='active', updated_at=now();
end $$;

-- RLS reset without recursive policies. Drops policies only, not data.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' and tablename in ('user_profiles','delivery_riders','delivery_orders','delivery_trips','delivery_internal_trips','delivery_attendance') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create or replace function public.current_user_delivery_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.user_profiles where auth_user_id = auth.uid() and status='active' limit 1;
$$;
grant execute on function public.current_user_delivery_role() to authenticated;

alter table public.user_profiles enable row level security;
create policy user_profiles_select_own on public.user_profiles for select to authenticated using (auth_user_id = auth.uid() or public.current_user_delivery_role() in ('admin','super_admin'));
create policy user_profiles_update_own on public.user_profiles for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

alter table public.delivery_riders enable row level security;
create policy delivery_riders_select on public.delivery_riders for select to authenticated using (auth_user_id = auth.uid() or public.current_user_delivery_role() in ('admin','super_admin'));
create policy delivery_riders_write_admin on public.delivery_riders for all to authenticated using (public.current_user_delivery_role() in ('admin','super_admin')) with check (public.current_user_delivery_role() in ('admin','super_admin'));

-- During pilot, allow authenticated users to operate their delivery rows; admin can see all.
alter table public.delivery_orders enable row level security;
create policy delivery_orders_authenticated on public.delivery_orders for all to authenticated using (true) with check (true);
alter table public.delivery_trips enable row level security;
create policy delivery_trips_authenticated on public.delivery_trips for all to authenticated using (true) with check (true);
alter table public.delivery_internal_trips enable row level security;
create policy delivery_internal_trips_authenticated on public.delivery_internal_trips for all to authenticated using (true) with check (true);
alter table public.delivery_attendance enable row level security;
create policy delivery_attendance_authenticated on public.delivery_attendance for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
