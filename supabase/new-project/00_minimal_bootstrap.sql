-- =====================================================
-- Dawaa Delivery minimal bootstrap for a NEW Supabase project
-- Login: DR.MOAZ / 9493
-- Run this after creating the Auth user:
--   Email: dr.moaz@dawaa-delivery.local
--   Password: 9493
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
  role text not null check (role in ('super_admin','admin','shift_manager','rider')),
  branch_id uuid references public.delivery_branches(id),
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
  status text default 'active' check (status in ('active','inactive','suspended')),
  current_status text default 'inside_branch',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text,
  customer_name text not null,
  phone text,
  address text,
  branch_id uuid references public.delivery_branches(id),
  active boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_attendance (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.delivery_riders(id),
  branch_id uuid references public.delivery_branches(id),
  shift_date date not null default current_date,
  check_in_time timestamptz default now(),
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

-- delivery_trips = Delivery Run / الخروجة الواحدة
create table if not exists public.delivery_trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.delivery_riders(id),
  branch_id uuid references public.delivery_branches(id),
  status text not null default 'active' check (status in ('active','review','completed','cancelled')),
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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.delivery_trips(id) on delete cascade,
  rider_id uuid references public.delivery_riders(id),
  branch_id uuid references public.delivery_branches(id),
  customer_id uuid references public.delivery_customers(id),
  invoice_no text not null,
  amount numeric default 0,
  status text not null default 'pending' check (status in ('pending','delivered','returned','cancelled')),
  customer_name_snapshot text,
  customer_code_snapshot text,
  customer_phone_snapshot text,
  customer_address_snapshot text,
  delivered_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_internal_trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.delivery_riders(id),
  branch_id uuid references public.delivery_branches(id),
  reason text not null,
  status text not null default 'pending_approval' check (status in ('pending_approval','approved','completed','rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
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

grant execute on function public.delivery_resolve_login(text) to anon;
grant execute on function public.delivery_resolve_login(text) to authenticated;

insert into public.delivery_login_aliases (login_name, email, active, role)
values
  ('DR.MOAZ', 'dr.moaz@dawaa-delivery.local', true, 'admin'),
  ('admin', 'dr.moaz@dawaa-delivery.local', true, 'admin')
on conflict (login_name) do update set
  email = excluded.email,
  active = excluded.active,
  role = excluded.role,
  updated_at = now();

insert into public.delivery_settings (key, value, description)
values
  ('payroll_start_day', '26', 'بداية الشهر التشغيلي'),
  ('geofence_radius_meters', '100', 'نطاق الفرع بالمتر'),
  ('gps_accuracy_threshold_meters', '100', 'حد دقة GPS'),
  ('max_normal_run_minutes', '60', 'أقصى مدة طبيعية للخروجة')
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();

insert into public.delivery_branches (name, code, address)
values ('فرع تجريبي', 'TEST', 'عنوان تجريبي')
on conflict (code) do update set name = excluded.name, address = excluded.address, updated_at = now();

insert into public.delivery_customers (customer_code, customer_name, phone, address, branch_id)
select 'CUST-' || gs::text, 'عميل تجربة ' || gs::text, '010000000' || gs::text, 'عنوان عميل تجربة ' || gs::text, b.id
from generate_series(1, 10) gs
cross join (select id from public.delivery_branches where code = 'TEST' limit 1) b
on conflict do nothing;

create or replace function public.delivery_search_customers(search_text text)
returns table (
  id uuid,
  customer_code text,
  customer_name text,
  phone text,
  address text,
  branch_id uuid
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.customer_code, c.customer_name, c.phone, c.address, c.branch_id
  from public.delivery_customers c
  where c.active = true
    and length(trim(search_text)) >= 2
    and (
      c.customer_name ilike '%' || trim(search_text) || '%'
      or c.customer_code ilike '%' || trim(search_text) || '%'
      or c.phone ilike '%' || trim(search_text) || '%'
    )
  order by c.customer_name
  limit 20;
$$;

grant execute on function public.delivery_search_customers(text) to authenticated;

create or replace function public.delivery_link_admin_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_profile_id uuid;
  v_branch_id uuid;
begin
  select id into v_auth_user_id from auth.users where lower(email) = 'dr.moaz@dawaa-delivery.local' limit 1;
  if v_auth_user_id is null then
    raise exception 'Create Auth user first: dr.moaz@dawaa-delivery.local / 9493';
  end if;

  select id into v_branch_id from public.delivery_branches where code = 'TEST' limit 1;

  select id into v_profile_id
  from public.user_profiles
  where auth_user_id = v_auth_user_id or lower(email) = 'dr.moaz@dawaa-delivery.local'
  limit 1;

  if v_profile_id is null then
    insert into public.user_profiles (auth_user_id, email, display_name, role, status, branch_id)
    values (v_auth_user_id, 'dr.moaz@dawaa-delivery.local', 'DR.MOAZ', 'admin', 'active', v_branch_id)
    returning id into v_profile_id;
  else
    update public.user_profiles
    set auth_user_id = v_auth_user_id,
        email = 'dr.moaz@dawaa-delivery.local',
        display_name = 'DR.MOAZ',
        role = 'admin',
        status = 'active',
        branch_id = v_branch_id,
        updated_at = now()
    where id = v_profile_id;
  end if;

  insert into public.delivery_riders (profile_id, auth_user_id, name, username, branch_id, level, hourly_rate, order_rate, trip_rate, status)
  values (v_profile_id, v_auth_user_id, 'DR.MOAZ', 'DR.MOAZ', v_branch_id, 'senior', 23, 10, 4, 'active')
  on conflict (username) do update set
    profile_id = excluded.profile_id,
    auth_user_id = excluded.auth_user_id,
    branch_id = excluded.branch_id,
    status = 'active',
    updated_at = now();
end;
$$;

-- Run this after creating the Auth user:
-- select public.delivery_link_admin_profile();

create or replace function public.delivery_fill_order_snapshot()
returns trigger
language plpgsql
as $$
declare
  c record;
begin
  select * into c from public.delivery_customers where id = new.customer_id;
  if c.id is not null then
    new.customer_name_snapshot := coalesce(new.customer_name_snapshot, c.customer_name);
    new.customer_code_snapshot := coalesce(new.customer_code_snapshot, c.customer_code);
    new.customer_phone_snapshot := coalesce(new.customer_phone_snapshot, c.phone);
    new.customer_address_snapshot := coalesce(new.customer_address_snapshot, c.address);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_fill_order_snapshot on public.delivery_orders;
create trigger trg_delivery_fill_order_snapshot
before insert on public.delivery_orders
for each row execute function public.delivery_fill_order_snapshot();

create or replace function public.delivery_current_profile()
returns public.user_profiles
language sql
security definer
set search_path = public
as $$
  select * from public.user_profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.delivery_current_rider()
returns public.delivery_riders
language sql
security definer
set search_path = public
as $$
  select r.*
  from public.delivery_riders r
  where r.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.delivery_start_attendance(p_lat numeric, p_lng numeric, p_accuracy numeric, p_gps_review boolean, p_gps_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider public.delivery_riders;
  v_id uuid;
begin
  select * into v_rider from public.delivery_current_rider();
  if v_rider.id is null then raise exception 'الحساب غير مربوط بمندوب دليفري'; end if;

  insert into public.delivery_attendance (rider_id, branch_id, check_in_lat, check_in_lng, check_in_accuracy, needs_review, review_reason)
  values (v_rider.id, v_rider.branch_id, p_lat, p_lng, p_accuracy, coalesce(p_gps_review,false), p_gps_reason)
  returning id into v_id;

  update public.delivery_riders set current_status = 'inside_branch', updated_at = now() where id = v_rider.id;
  return v_id;
end;
$$;

create or replace function public.delivery_start_run(p_lat numeric, p_lng numeric, p_accuracy numeric, p_gps_review boolean, p_gps_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider public.delivery_riders;
  v_id uuid;
begin
  select * into v_rider from public.delivery_current_rider();
  if v_rider.id is null then raise exception 'الحساب غير مربوط بمندوب دليفري'; end if;
  if exists (select 1 from public.delivery_trips where rider_id = v_rider.id and status = 'active') then
    raise exception 'يوجد خروجة نشطة بالفعل لهذا المندوب';
  end if;

  insert into public.delivery_trips (rider_id, branch_id, start_lat, start_lng, start_accuracy, needs_review, review_reason)
  values (v_rider.id, v_rider.branch_id, p_lat, p_lng, p_accuracy, coalesce(p_gps_review,false), p_gps_reason)
  returning id into v_id;

  update public.delivery_riders set current_status = 'out_for_delivery', updated_at = now() where id = v_rider.id;
  return v_id;
end;
$$;

create or replace function public.delivery_finish_run(p_trip_id uuid, p_lat numeric, p_lng numeric, p_accuracy numeric, p_gps_review boolean, p_gps_reason text, p_manual_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider public.delivery_riders;
  v_needs_review boolean;
  v_reason text;
begin
  select * into v_rider from public.delivery_current_rider();
  if v_rider.id is null then raise exception 'الحساب غير مربوط بمندوب دليفري'; end if;

  v_needs_review := coalesce(p_gps_review,false) or nullif(trim(coalesce(p_manual_reason,'')), '') is not null;
  v_reason := concat_ws(' - ', nullif(trim(coalesce(p_gps_reason,'')), ''), nullif(trim(coalesce(p_manual_reason,'')), ''));

  update public.delivery_trips
  set status = case when v_needs_review then 'review' else 'completed' end,
      ended_at = now(),
      return_lat = p_lat,
      return_lng = p_lng,
      return_accuracy = p_accuracy,
      needs_review = v_needs_review,
      review_reason = nullif(v_reason,''),
      manual_return_reason = nullif(trim(coalesce(p_manual_reason,'')), ''),
      updated_at = now()
  where id = p_trip_id and rider_id = v_rider.id and status = 'active';

  update public.delivery_riders set current_status = case when v_needs_review then 'needs_review' else 'inside_branch' end, updated_at = now() where id = v_rider.id;
end;
$$;

create or replace function public.delivery_calculate_payroll(p_period_start date, p_period_end date)
returns table(
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
security definer
set search_path = public
as $$
  with base as (
    select r.* from public.delivery_riders r where r.status = 'active'
  ), hours as (
    select a.rider_id, coalesce(sum(extract(epoch from (coalesce(a.check_out_time, now()) - a.check_in_time))/3600),0)::numeric as hours_count
    from public.delivery_attendance a
    where a.check_in_time::date between p_period_start and p_period_end
    group by a.rider_id
  ), orders as (
    select o.rider_id,
      count(*) filter (where o.status = 'delivered') as delivered_orders_count,
      count(*) filter (where o.status in ('returned','cancelled')) as failed_orders_count
    from public.delivery_orders o
    where o.created_at::date between p_period_start and p_period_end
    group by o.rider_id
  ), trips as (
    select t.rider_id,
      count(*) filter (where t.status in ('approved','completed')) as internal_trips_count,
      count(*) filter (where t.status = 'pending_approval') as unapproved_trips_count
    from public.delivery_internal_trips t
    where t.created_at::date between p_period_start and p_period_end
    group by t.rider_id
  ), reviews as (
    select dr.rider_id, count(*) as pending_review_count
    from public.delivery_trips dr
    where dr.needs_review = true and dr.started_at::date between p_period_start and p_period_end
    group by dr.rider_id
  )
  select
    b.id as rider_id,
    b.name as rider_name,
    b.level as tier,
    coalesce(h.hours_count,0) as hours_count,
    coalesce(o.delivered_orders_count,0) as delivered_orders_count,
    coalesce(t.internal_trips_count,0) as internal_trips_count,
    b.hourly_rate as hourly_rate_snapshot,
    b.order_rate as order_rate_snapshot,
    b.trip_rate as internal_trip_rate_snapshot,
    (coalesce(h.hours_count,0) * b.hourly_rate + coalesce(o.delivered_orders_count,0) * b.order_rate + coalesce(t.internal_trips_count,0) * b.trip_rate)::numeric as gross_total,
    0::numeric as bonuses_total,
    0::numeric as deductions_total,
    (coalesce(h.hours_count,0) * b.hourly_rate + coalesce(o.delivered_orders_count,0) * b.order_rate + coalesce(t.internal_trips_count,0) * b.trip_rate)::numeric as net_total,
    coalesce(r.pending_review_count,0) as pending_review_count,
    coalesce(t.unapproved_trips_count,0) as unapproved_trips_count,
    coalesce(o.failed_orders_count,0) as failed_orders_count,
    (coalesce(r.pending_review_count,0) = 0 and coalesce(t.unapproved_trips_count,0) = 0) as can_approve_payroll
  from base b
  left join hours h on h.rider_id = b.id
  left join orders o on o.rider_id = b.id
  left join trips t on t.rider_id = b.id
  left join reviews r on r.rider_id = b.id
  order by b.name;
$$;

-- Basic RLS. Keep simple for pilot.
alter table public.user_profiles enable row level security;
alter table public.delivery_riders enable row level security;
alter table public.delivery_customers enable row level security;
alter table public.delivery_trips enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_internal_trips enable row level security;
alter table public.delivery_attendance enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.delivery_audit_log enable row level security;

do $$
begin
  create policy "profiles authenticated read" on public.user_profiles for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy "delivery authenticated read customers" on public.delivery_customers for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy "delivery authenticated all riders" on public.delivery_riders for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy "delivery authenticated all trips" on public.delivery_trips for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy "delivery authenticated all orders" on public.delivery_orders for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy "delivery authenticated all internal trips" on public.delivery_internal_trips for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy "delivery authenticated all attendance" on public.delivery_attendance for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy "delivery authenticated settings read" on public.delivery_settings for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy "delivery authenticated audit insert" on public.delivery_audit_log for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

select public.delivery_resolve_login('DR.MOAZ') as resolved_email;
