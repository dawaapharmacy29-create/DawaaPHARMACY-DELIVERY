create table if not exists public.rider_bonus_assessments (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  rider_name text,
  branch_name text,
  cycle_start date not null,
  cycle_end date not null,
  bonus_type text not null check (bonus_type in ('monthly','quarterly')),
  base_amount numeric(12,2) not null default 0 check (base_amount >= 0),
  criteria jsonb not null default '[]'::jsonb,
  earned_amount numeric(12,2) not null default 0 check (earned_amount >= 0),
  notes text,
  status text not null default 'approved' check (status in ('draft','pending','approved','rejected','cancelled')),
  approved_by text,
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_bonus_assessments_cycle_valid check (cycle_end >= cycle_start),
  constraint rider_bonus_assessments_unique_cycle unique (rider_id, cycle_start, cycle_end, bonus_type)
);

create index if not exists rider_bonus_assessments_rider_cycle_idx
  on public.rider_bonus_assessments (rider_id, cycle_start desc, cycle_end desc);
create index if not exists rider_bonus_assessments_status_idx
  on public.rider_bonus_assessments (status, bonus_type);

alter table public.rider_bonus_assessments enable row level security;

drop policy if exists rider_bonus_assessments_select_all on public.rider_bonus_assessments;
create policy rider_bonus_assessments_select_all on public.rider_bonus_assessments
  for select to public using (true);

drop policy if exists rider_bonus_assessments_insert_all on public.rider_bonus_assessments;
create policy rider_bonus_assessments_insert_all on public.rider_bonus_assessments
  for insert to public with check (true);

drop policy if exists rider_bonus_assessments_update_all on public.rider_bonus_assessments;
create policy rider_bonus_assessments_update_all on public.rider_bonus_assessments
  for update to public using (true) with check (true);

drop policy if exists rider_bonus_assessments_delete_all on public.rider_bonus_assessments;
create policy rider_bonus_assessments_delete_all on public.rider_bonus_assessments
  for delete to public using (true);

grant select, insert, update, delete on public.rider_bonus_assessments to anon, authenticated;

create or replace function public.set_rider_bonus_assessments_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_rider_bonus_assessments_updated_at on public.rider_bonus_assessments;
create trigger set_rider_bonus_assessments_updated_at
before update on public.rider_bonus_assessments
for each row execute function public.set_rider_bonus_assessments_updated_at();
