-- 53_rider_compensation_profiles.sql
-- Safe migration: قواعد حساب كل دليفري + سجل الحوافز والخصومات لكل دورة شهرية.

create table if not exists public.rider_compensation_profiles (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null,
  branch_id uuid,
  cycle_start date not null,
  cycle_end date not null,
  hourly_rate numeric not null default 0,
  base_salary numeric not null default 0,
  monthly_bonus numeric not null default 0,
  quarterly_bonus numeric not null default 0,
  order_1x_rate numeric not null default 0,
  order_1_5x_rate numeric not null default 0,
  internal_trip_rate numeric not null default 0,
  failed_order_rate numeric not null default 0,
  count_failed_orders boolean not null default false,
  attendance_commitment_rate numeric not null default 100,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rider_id, cycle_start, cycle_end)
);

create table if not exists public.rider_compensation_events (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null,
  branch_id uuid,
  cycle_start date not null,
  event_date date not null default current_date,
  event_type text not null check (event_type in ('bonus', 'deduction', 'manual_adjustment', 'monthly_bonus', 'quarterly_bonus')),
  title text not null,
  amount numeric not null default 0,
  reason text,
  related_order_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_rider_comp_profiles_rider_cycle on public.rider_compensation_profiles(rider_id, cycle_start, cycle_end);
create index if not exists idx_rider_comp_events_rider_cycle on public.rider_compensation_events(rider_id, cycle_start);
create index if not exists idx_rider_comp_events_branch_cycle on public.rider_compensation_events(branch_id, cycle_start);

alter table public.rider_compensation_profiles enable row level security;
alter table public.rider_compensation_events enable row level security;

drop policy if exists "rider_compensation_profiles_all" on public.rider_compensation_profiles;
create policy "rider_compensation_profiles_all"
on public.rider_compensation_profiles
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "rider_compensation_events_all" on public.rider_compensation_events;
create policy "rider_compensation_events_all"
on public.rider_compensation_events
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.rider_compensation_profiles to anon, authenticated;
grant select, insert, update, delete on public.rider_compensation_events to anon, authenticated;

notify pgrst, 'reload schema';
