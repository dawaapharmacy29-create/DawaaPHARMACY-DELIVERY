-- 0074_require_trip_proof_or_reason.sql
-- Enforce trip proof or an exception reason on internal trips.

create or replace function public.internal_trips_require_proof_or_exception()
returns trigger
language plpgsql
security definer
as $$
begin
  if coalesce(new.proof_required, true) = true then
    if coalesce(nullif(trim(new.proof_image_url), ''), null) is null then
      if not (
        new.proof_exception_status = 'pending'
        and coalesce(nullif(trim(new.proof_exception_reason), ''), null) is not null
      ) then
        raise exception 'المشوار يحتاج صورة إثبات أو سبب استثناء واضح';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_internal_trips_require_proof_or_exception on public.internal_trips;
create trigger trg_internal_trips_require_proof_or_exception
  before insert or update on public.internal_trips
  for each row execute function public.internal_trips_require_proof_or_exception();
