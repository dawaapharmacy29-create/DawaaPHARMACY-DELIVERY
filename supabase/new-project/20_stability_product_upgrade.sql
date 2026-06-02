-- =====================================================
-- Dawaa Delivery Stability + Product Flow Upgrade
-- Safe bootstrap/repair for the new delivery Supabase project
-- No DROP / TRUNCATE / DELETE
-- =====================================================

create extension if not exists pgcrypto;

-- -----------------------------
-- Core tables / repair columns
-- -----------------------------
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
  role text not null default 'rider',
  branch_id uuid null,
  status text not null default 'active',
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_profiles add column if not exists auth_user_id uuid;
alter table public.user_profiles add column if not exists email text;
alter table public.user_profiles add column if not exists display_name text;
alter table public.user_profiles add column if not exists role text default 'rider';
alter table public.user_profiles add column if not exists status text default 'active';
alter table public.user_profiles add column if not exists branch_id uuid;
alter table public.user_profiles add column if not exists updated_at timestamptz default now();

create table if not exists public.delivery_login_aliases (
  login_name text primary key,
  email text not null,
  active boolean not null default true,
  role text not null default 'rider',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_riders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  auth_user_id uuid,
  name text not null,
  username text unique,
  phone text,
  branch_id uuid,
  level text not null default 'senior',
  hourly_rate numeric not null default 23,
  order_rate numeric not null default 10,
  trip_rate numeric not null default 4,
  monthly_incentive_base numeric not null default 1000,
  quarterly_incentive_base numeric not null default 1000,
  status text default 'active',
  current_status text default 'inside_branch',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.delivery_riders add column if not exists profile_id uuid;
alter table public.delivery_riders add column if not exists auth_user_id uuid;
alter table public.delivery_riders add column if not exists username text;
alter table public.delivery_riders add column if not exists branch_id uuid;
alter table public.delivery_riders add column if not exists level text default 'senior';
alter table public.delivery_riders add column if not exists hourly_rate numeric default 23;
alter table public.delivery_riders add column if not exists order_rate numeric default 10;
alter table public.delivery_riders add column if not exists trip_rate numeric default 4;
alter table public.delivery_riders add column if not exists monthly_incentive_base numeric default 1000;
alter table public.delivery_riders add column if not exists quarterly_incentive_base numeric default 1000;
alter table public.delivery_riders add column if not exists status text default 'active';
alter table public.delivery_riders add column if not exists current_status text default 'inside_branch';
alter table public.delivery_riders add column if not exists updated_at timestamptz default now();

create table if not exists public.delivery_customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text,
  customer_name text not null,
  phone text,
  address text,
  branch_id uuid,
  lat numeric,
  lng numeric,
  notes text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.delivery_customers add column if not exists id uuid;
update public.delivery_customers set id = gen_random_uuid() where id is null;
alter table public.delivery_customers alter column id set default gen_random_uuid();
alter table public.delivery_customers add column if not exists customer_code text;
alter table public.delivery_customers add column if not exists customer_name text;
alter table public.delivery_customers add column if not exists phone text;
alter table public.delivery_customers add column if not exists address text;
alter table public.delivery_customers add column if not exists branch_id uuid;
alter table public.delivery_customers add column if not exists active boolean default true;
alter table public.delivery_customers add column if not exists updated_at timestamptz default now();

create table if not exists public.delivery_attendance (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid,
  branch_id uuid,
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

alter table public.delivery_attendance add column if not exists rider_id uuid;
alter table public.delivery_attendance add column if not exists branch_id uuid;
alter table public.delivery_attendance add column if not exists shift_date date default current_date;
alter table public.delivery_attendance add column if not exists check_in_time timestamptz;
alter table public.delivery_attendance add column if not exists check_out_time timestamptz;
alter table public.delivery_attendance add column if not exists total_minutes integer default 0;
alter table public.delivery_attendance add column if not exists needs_review boolean default false;
alter table public.delivery_attendance add column if not exists review_reason text;

-- delivery_trips is the active run table used by the current frontend.
create table if not exists public.delivery_trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid,
  branch_id uuid,
  status text not null default 'active',
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
  total_orders_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.delivery_trips add column if not exists id uuid;
update public.delivery_trips set id = gen_random_uuid() where id is null;
alter table public.delivery_trips alter column id set default gen_random_uuid();
alter table public.delivery_trips add column if not exists rider_id uuid;
alter table public.delivery_trips add column if not exists branch_id uuid;
alter table public.delivery_trips add column if not exists status text default 'active';
alter table public.delivery_trips add column if not exists started_at timestamptz default now();
alter table public.delivery_trips add column if not exists ended_at timestamptz;
alter table public.delivery_trips add column if not exists start_lat numeric;
alter table public.delivery_trips add column if not exists start_lng numeric;
alter table public.delivery_trips add column if not exists start_accuracy numeric;
alter table public.delivery_trips add column if not exists return_lat numeric;
alter table public.delivery_trips add column if not exists return_lng numeric;
alter table public.delivery_trips add column if not exists return_accuracy numeric;
alter table public.delivery_trips add column if not exists needs_review boolean default false;
alter table public.delivery_trips add column if not exists review_reason text;
alter table public.delivery_trips add column if not exists manual_return_reason text;
alter table public.delivery_trips add column if not exists total_orders_count integer default 0;
alter table public.delivery_trips add column if not exists updated_at timestamptz default now();

create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid,
  rider_id uuid,
  branch_id uuid,
  customer_id uuid,
  invoice_no text,
  amount numeric default 0,
  status text default 'pending',
  delivered_at timestamptz,
  failed_reason text,
  customer_name_snapshot text,
  customer_code_snapshot text,
  customer_phone_snapshot text,
  customer_address_snapshot text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.delivery_orders add column if not exists id uuid;
update public.delivery_orders set id = gen_random_uuid() where id is null;
alter table public.delivery_orders alter column id set default gen_random_uuid();
alter table public.delivery_orders add column if not exists trip_id uuid;
alter table public.delivery_orders add column if not exists run_id uuid;
alter table public.delivery_orders add column if not exists rider_id uuid;
alter table public.delivery_orders add column if not exists branch_id uuid;
alter table public.delivery_orders add column if not exists customer_id uuid;
alter table public.delivery_orders add column if not exists invoice_no text;
alter table public.delivery_orders add column if not exists invoice_number text;
alter table public.delivery_orders add column if not exists amount numeric default 0;
alter table public.delivery_orders add column if not exists invoice_value numeric default 0;
alter table public.delivery_orders add column if not exists status text default 'pending';
alter table public.delivery_orders add column if not exists delivered_at timestamptz;
alter table public.delivery_orders add column if not exists failed_reason text;
alter table public.delivery_orders add column if not exists customer_name_snapshot text;
alter table public.delivery_orders add column if not exists customer_code_snapshot text;
alter table public.delivery_orders add column if not exists customer_phone_snapshot text;
alter table public.delivery_orders add column if not exists customer_address_snapshot text;
alter table public.delivery_orders add column if not exists updated_at timestamptz default now();

create table if not exists public.delivery_internal_trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid,
  branch_id uuid,
  trip_type text default 'other',
  from_label text,
  to_label text,
  status text default 'pending_approval',
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.delivery_internal_trips add column if not exists rider_id uuid;
alter table public.delivery_internal_trips add column if not exists branch_id uuid;
alter table public.delivery_internal_trips add column if not exists trip_type text default 'other';
alter table public.delivery_internal_trips add column if not exists status text default 'pending_approval';
alter table public.delivery_internal_trips add column if not exists notes text;
alter table public.delivery_internal_trips add column if not exists updated_at timestamptz default now();

create table if not exists public.delivery_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

create table if not exists public.delivery_incidents (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid,
  trip_id uuid,
  run_id uuid,
  order_id uuid,
  incident_type text,
  category text,
  severity text default 'medium',
  title text,
  description text,
  status text default 'open',
  auto_generated boolean default false,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table if not exists public.delivery_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid,
  rider_id uuid,
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
  actor_profile_id uuid,
  actor_name text,
  action text not null,
  table_name text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_delivery_riders_auth on public.delivery_riders(auth_user_id);
create index if not exists idx_delivery_riders_profile on public.delivery_riders(profile_id);
create index if not exists idx_delivery_trips_rider_status on public.delivery_trips(rider_id, status);
create index if not exists idx_delivery_orders_trip on public.delivery_orders(trip_id);
create index if not exists idx_delivery_orders_rider_status on public.delivery_orders(rider_id, status);
create index if not exists idx_delivery_attendance_rider_date on public.delivery_attendance(rider_id, shift_date);
create index if not exists idx_delivery_customers_search_name on public.delivery_customers(customer_name);
create index if not exists idx_delivery_customers_search_code on public.delivery_customers(customer_code);
create index if not exists idx_delivery_customers_search_phone on public.delivery_customers(phone);

-- -----------------------------
-- Auth helpers
-- -----------------------------
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

create or replace function public.current_user_delivery_role()
returns text
language sql
security definer
set search_path = public
as $$
  select up.role
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
    and up.status = 'active'
  limit 1;
$$;

grant execute on function public.current_user_delivery_role() to authenticated;

create or replace function public.delivery_current_rider_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select r.id
  from public.delivery_riders r
  where r.auth_user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.delivery_current_rider_id() to authenticated;

-- -----------------------------
-- Operational functions
-- -----------------------------
create or replace function public.delivery_search_customers(search_text text)
returns table(id uuid, customer_code text, customer_name text, phone text, address text, branch_id uuid)
language sql
security definer
set search_path = public
as $$
  select c.id, c.customer_code, c.customer_name, c.phone, c.address, c.branch_id
  from public.delivery_customers c
  where coalesce(c.active, true) = true
    and length(trim(search_text)) >= 2
    and (
      c.customer_name ilike '%' || trim(search_text) || '%'
      or c.customer_code ilike '%' || trim(search_text) || '%'
      or c.phone ilike '%' || trim(search_text) || '%'
    )
  order by c.customer_name asc
  limit 20;
$$;

grant execute on function public.delivery_search_customers(text) to authenticated;

create or replace function public.delivery_start_attendance(p_lat numeric default null, p_lng numeric default null, p_accuracy numeric default null, p_gps_review boolean default false, p_gps_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider public.delivery_riders%rowtype;
begin
  select * into v_rider from public.delivery_riders where auth_user_id = auth.uid() limit 1;
  if v_rider.id is null then raise exception 'هذا الحساب غير مربوط بمندوب دليفري.'; end if;

  if exists (select 1 from public.delivery_attendance where rider_id = v_rider.id and shift_date = current_date and check_out_time is null) then
    return;
  end if;

  insert into public.delivery_attendance(rider_id, branch_id, shift_date, check_in_time, check_in_lat, check_in_lng, check_in_accuracy, needs_review, review_reason, status)
  values (v_rider.id, v_rider.branch_id, current_date, now(), p_lat, p_lng, p_accuracy, coalesce(p_gps_review,false), p_gps_reason, case when coalesce(p_gps_review,false) then 'manual_review' else 'present' end);
end;
$$;

grant execute on function public.delivery_start_attendance(numeric,numeric,numeric,boolean,text) to authenticated;

create or replace function public.delivery_start_run(p_lat numeric default null, p_lng numeric default null, p_accuracy numeric default null, p_gps_review boolean default false, p_gps_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider public.delivery_riders%rowtype;
  v_trip_id uuid;
begin
  select * into v_rider from public.delivery_riders where auth_user_id = auth.uid() limit 1;
  if v_rider.id is null then raise exception 'هذا الحساب غير مربوط بمندوب دليفري.'; end if;

  if not exists (select 1 from public.delivery_attendance where rider_id = v_rider.id and shift_date = current_date and check_in_time is not null and check_out_time is null) then
    raise exception 'يجب تسجيل الحضور قبل بدء الخروجة.';
  end if;

  if exists (select 1 from public.delivery_trips where rider_id = v_rider.id and status = 'active') then
    raise exception 'يوجد خروجة نشطة بالفعل.';
  end if;

  insert into public.delivery_trips(rider_id, branch_id, status, started_at, start_lat, start_lng, start_accuracy, needs_review, review_reason)
  values (v_rider.id, v_rider.branch_id, 'active', now(), p_lat, p_lng, p_accuracy, coalesce(p_gps_review,false), p_gps_reason)
  returning id into v_trip_id;

  update public.delivery_riders set current_status = 'out_for_delivery', updated_at = now() where id = v_rider.id;
  return v_trip_id;
end;
$$;

grant execute on function public.delivery_start_run(numeric,numeric,numeric,boolean,text) to authenticated;

create or replace function public.delivery_add_order(p_run_id uuid, p_invoice_number text, p_invoice_value numeric default 0, p_customer_id uuid default null, p_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider public.delivery_riders%rowtype;
  v_customer public.delivery_customers%rowtype;
  v_order_id uuid;
begin
  if trim(coalesce(p_invoice_number,'')) = '' then raise exception 'رقم الفاتورة إجباري.'; end if;
  select * into v_rider from public.delivery_riders where auth_user_id = auth.uid() limit 1;
  if v_rider.id is null then raise exception 'هذا الحساب غير مربوط بمندوب دليفري.'; end if;

  if not exists (select 1 from public.delivery_trips where id = p_run_id and rider_id = v_rider.id and status = 'active') then
    raise exception 'لا توجد خروجة نشطة لهذا المندوب.';
  end if;

  if p_customer_id is not null then select * into v_customer from public.delivery_customers where id = p_customer_id; end if;

  insert into public.delivery_orders(trip_id, run_id, rider_id, branch_id, customer_id, invoice_no, invoice_number, amount, invoice_value, status, customer_name_snapshot, customer_code_snapshot, customer_phone_snapshot, customer_address_snapshot)
  values (p_run_id, p_run_id, v_rider.id, v_rider.branch_id, p_customer_id, trim(p_invoice_number), trim(p_invoice_number), coalesce(p_invoice_value,0), coalesce(p_invoice_value,0), 'pending', v_customer.customer_name, v_customer.customer_code, v_customer.phone, v_customer.address)
  returning id into v_order_id;

  update public.delivery_trips set total_orders_count = (select count(*) from public.delivery_orders where trip_id = p_run_id or run_id = p_run_id), updated_at = now() where id = p_run_id;
  return v_order_id;
end;
$$;

grant execute on function public.delivery_add_order(uuid,text,numeric,uuid,jsonb) to authenticated;

create or replace function public.delivery_finish_run(p_trip_id uuid, p_lat numeric default null, p_lng numeric default null, p_accuracy numeric default null, p_gps_review boolean default false, p_gps_reason text default null, p_manual_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider public.delivery_riders%rowtype;
  v_review boolean;
begin
  select * into v_rider from public.delivery_riders where auth_user_id = auth.uid() limit 1;
  if v_rider.id is null then raise exception 'هذا الحساب غير مربوط بمندوب دليفري.'; end if;
  v_review := coalesce(p_gps_review,false) or nullif(trim(coalesce(p_manual_reason,'')),'') is not null;

  update public.delivery_trips
  set status = case when v_review then 'review' else 'completed' end,
      ended_at = now(),
      return_lat = p_lat,
      return_lng = p_lng,
      return_accuracy = p_accuracy,
      needs_review = v_review,
      review_reason = coalesce(p_gps_reason, p_manual_reason),
      manual_return_reason = p_manual_reason,
      updated_at = now()
  where id = p_trip_id and rider_id = v_rider.id and status = 'active';

  if not found then raise exception 'الخروجة غير موجودة أو مغلقة بالفعل.'; end if;

  update public.delivery_riders set current_status = case when v_review then 'needs_review' else 'inside_branch' end, updated_at = now() where id = v_rider.id;

  if v_review then
    insert into public.delivery_incidents(rider_id, trip_id, incident_type, category, severity, title, description, status, auto_generated)
    values (v_rider.id, p_trip_id, 'manual_or_gps_return', 'manual_return', 'medium', 'خروجة تحتاج مراجعة', coalesce(p_gps_reason, p_manual_reason, 'رجوع يدوي أو GPS غير دقيق'), 'open', true);
  end if;
end;
$$;

grant execute on function public.delivery_finish_run(uuid,numeric,numeric,numeric,boolean,text,text) to authenticated;

create or replace function public.delivery_calculate_payroll(p_period_start date, p_period_end date)
returns table(rider_id uuid, rider_name text, total_work_hours numeric, delivered_orders integer, monthly_incentive numeric, bonuses numeric, penalties numeric, net_pay numeric)
language sql
security definer
set search_path = public
as $$
  with attendance as (
    select a.rider_id, coalesce(sum(coalesce(a.total_minutes, extract(epoch from (coalesce(a.check_out_time, now()) - a.check_in_time))/60)),0) as minutes
    from public.delivery_attendance a
    where a.shift_date between p_period_start and p_period_end
    group by a.rider_id
  ), orders as (
    select o.rider_id, count(*)::integer as delivered_count
    from public.delivery_orders o
    where o.status = 'delivered' and o.created_at::date between p_period_start and p_period_end
    group by o.rider_id
  ), trips as (
    select t.rider_id, count(*)::integer as trip_count
    from public.delivery_internal_trips t
    where t.status in ('approved','completed') and t.created_at::date between p_period_start and p_period_end
    group by t.rider_id
  )
  select
    r.id,
    r.name,
    round(coalesce(a.minutes,0) / 60.0, 2) as total_work_hours,
    coalesce(o.delivered_count,0) as delivered_orders,
    coalesce(r.monthly_incentive_base, case when r.level = 'senior' then 1000 else 750 end) as monthly_incentive,
    0::numeric as bonuses,
    0::numeric as penalties,
    round((coalesce(a.minutes,0) / 60.0) * coalesce(r.hourly_rate,0) + coalesce(o.delivered_count,0) * coalesce(r.order_rate,0) + coalesce(t.trip_count,0) * coalesce(r.trip_rate,0) + coalesce(r.monthly_incentive_base, case when r.level = 'senior' then 1000 else 750 end), 2) as net_pay
  from public.delivery_riders r
  left join attendance a on a.rider_id = r.id
  left join orders o on o.rider_id = r.id
  left join trips t on t.rider_id = r.id
  where r.status = 'active'
  order by r.name;
$$;

grant execute on function public.delivery_calculate_payroll(date,date) to authenticated;

-- -----------------------------
-- Seed minimal pilot data
-- -----------------------------
insert into public.delivery_branches(name, code, address)
values ('فرع تجريبي', 'TEST', 'عنوان تجريبي')
on conflict (code) do update set name = excluded.name, address = excluded.address, updated_at = now();

insert into public.delivery_login_aliases(login_name, email, active, role)
values ('DR.MOAZ', 'dr.moaz@dawaa-delivery.local', true, 'admin'), ('admin', 'dr.moaz@dawaa-delivery.local', true, 'admin')
on conflict (login_name) do update set email = excluded.email, active = excluded.active, role = excluded.role, updated_at = now();

insert into public.delivery_settings(key, value, description)
values
('payroll_start_day', '26', 'بداية الشهر التشغيلي'),
('geofence_radius_meters', '100', 'نطاق الفرع بالمتر'),
('gps_accuracy_threshold_meters', '100', 'حد دقة GPS'),
('max_normal_run_minutes', '60', 'أقصى مدة طبيعية للخروجة')
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();

insert into public.delivery_customers(customer_code, customer_name, phone, address, branch_id)
select x.customer_code, x.customer_name, x.phone, x.address, b.id
from public.delivery_branches b
cross join (values
  ('C001','عميل تجربة 1','01000000001','عنوان عميل تجربة 1'),
  ('C002','عميل تجربة 2','01000000002','عنوان عميل تجربة 2'),
  ('C003','عميل تجربة 3','01000000003','عنوان عميل تجربة 3')
) as x(customer_code, customer_name, phone, address)
where b.code = 'TEST'
on conflict do nothing;

-- link DR.MOAZ profile/rider if Auth user already exists
insert into public.user_profiles(auth_user_id, email, display_name, role, status, branch_id)
select au.id, au.email, 'DR.MOAZ', 'admin', 'active', null
from auth.users au
where lower(au.email) = 'dr.moaz@dawaa-delivery.local'
on conflict (auth_user_id) do update set email = excluded.email, display_name = 'DR.MOAZ', role = 'admin', status = 'active', updated_at = now();

insert into public.delivery_riders(profile_id, auth_user_id, name, username, branch_id, level, hourly_rate, order_rate, trip_rate, monthly_incentive_base, quarterly_incentive_base, status)
select up.id, up.auth_user_id, 'DR.MOAZ', 'DR.MOAZ', b.id, 'senior', 23, 10, 4, 1000, 1000, 'active'
from public.user_profiles up
cross join public.delivery_branches b
where lower(up.email) = 'dr.moaz@dawaa-delivery.local' and b.code = 'TEST'
on conflict (username) do update set profile_id = excluded.profile_id, auth_user_id = excluded.auth_user_id, branch_id = excluded.branch_id, status = 'active', updated_at = now();

-- -----------------------------
-- RLS policies: stable, non-recursive, pilot-friendly
-- -----------------------------
alter table public.user_profiles enable row level security;
drop policy if exists user_profiles_admin_all on public.user_profiles;
drop policy if exists user_profiles_select_own on public.user_profiles;
drop policy if exists user_profiles_update_own on public.user_profiles;
drop policy if exists user_profiles_update_own_basic on public.user_profiles;
create policy user_profiles_select_own on public.user_profiles for select to authenticated using (auth_user_id = auth.uid());
create policy user_profiles_update_own on public.user_profiles for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

alter table public.delivery_login_aliases enable row level security;
drop policy if exists delivery_login_aliases_select_active on public.delivery_login_aliases;
create policy delivery_login_aliases_select_active on public.delivery_login_aliases for select to anon, authenticated using (active = true);

-- During pilot, allow authenticated users to operate delivery tables. Tighten after flow is stable.
do $$
declare t text;
begin
  foreach t in array array['delivery_branches','delivery_riders','delivery_customers','delivery_attendance','delivery_trips','delivery_orders','delivery_internal_trips','delivery_settings','delivery_incidents','delivery_notifications','delivery_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'delivery_authenticated_all_' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', 'delivery_authenticated_all_' || t, t);
  end loop;
end $$;

notify pgrst, 'reload schema';

select public.delivery_resolve_login('DR.MOAZ') as resolved_email;
