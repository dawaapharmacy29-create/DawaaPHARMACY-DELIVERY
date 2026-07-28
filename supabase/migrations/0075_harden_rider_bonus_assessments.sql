alter table public.rider_bonus_assessments
  drop constraint if exists rider_bonus_assessments_bonus_type_check,
  drop constraint if exists rider_bonus_assessments_cycle_check,
  drop constraint if exists rider_bonus_assessments_amounts_check,
  drop constraint if exists rider_bonus_assessments_criteria_check;

alter table public.rider_bonus_assessments
  add constraint rider_bonus_assessments_bonus_type_check
    check (bonus_type in ('monthly','quarterly')),
  add constraint rider_bonus_assessments_cycle_check
    check (cycle_end >= cycle_start),
  add constraint rider_bonus_assessments_amounts_check
    check (base_amount >= 0 and earned_amount >= 0 and earned_amount <= base_amount),
  add constraint rider_bonus_assessments_criteria_check
    check (jsonb_typeof(criteria) = 'array');

create or replace function public.set_rider_bonus_assessments_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rider_bonus_assessments_updated_at on public.rider_bonus_assessments;
create trigger trg_rider_bonus_assessments_updated_at
before update on public.rider_bonus_assessments
for each row execute function public.set_rider_bonus_assessments_updated_at();

create index if not exists rider_bonus_assessments_rider_cycle_idx
  on public.rider_bonus_assessments (rider_id, cycle_start desc, cycle_end desc);

create index if not exists rider_bonus_assessments_status_type_idx
  on public.rider_bonus_assessments (status, bonus_type, approved_at desc);
