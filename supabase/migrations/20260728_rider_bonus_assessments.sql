create table if not exists public.rider_bonus_assessments (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null,
  rider_name text,
  branch_name text,
  cycle_start date not null,
  cycle_end date not null,
  bonus_type text not null check (bonus_type in ('monthly','quarterly')),
  base_amount numeric(12,2) not null default 0,
  criteria jsonb not null default '[]'::jsonb,
  earned_amount numeric(12,2) not null default 0,
  notes text,
  status text not null default 'approved',
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rider_id, cycle_start, cycle_end, bonus_type)
);

create index if not exists rider_bonus_assessments_rider_cycle_idx
  on public.rider_bonus_assessments (rider_id, cycle_start desc, cycle_end desc);

create index if not exists rider_bonus_assessments_quarterly_idx
  on public.rider_bonus_assessments (rider_id, bonus_type, approved_at desc);

alter table public.rider_bonus_assessments enable row level security;

drop policy if exists rider_bonus_assessments_read on public.rider_bonus_assessments;
create policy rider_bonus_assessments_read
  on public.rider_bonus_assessments for select
  to anon, authenticated
  using (true);

drop policy if exists rider_bonus_assessments_write on public.rider_bonus_assessments;
create policy rider_bonus_assessments_write
  on public.rider_bonus_assessments for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.rider_bonus_assessments to anon, authenticated;
