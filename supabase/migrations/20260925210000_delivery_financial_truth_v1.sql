-- Delivery financial truth v1
-- Live-applied on 2026-09-25. Canonicalizes rider cycle snapshots and payroll reporting.
-- Source of truth: rider_compensation_profiles per 26->25 cycle, with riders fallback only when a snapshot is absent.

create or replace function public.delivery_cycle_bounds_v1(p_date date default ((now() at time zone 'Africa/Cairo')::date))
returns table(cycle_start date, cycle_end date)
language sql immutable
as $$
  select
    case when extract(day from p_date)::int >= 26
      then make_date(extract(year from p_date)::int, extract(month from p_date)::int, 26)
      else make_date(extract(year from (p_date - interval '1 month'))::int, extract(month from (p_date - interval '1 month'))::int, 26) end,
    case when extract(day from p_date)::int >= 26
      then make_date(extract(year from (p_date + interval '1 month'))::int, extract(month from (p_date + interval '1 month'))::int, 25)
      else make_date(extract(year from p_date)::int, extract(month from p_date)::int, 25) end;
$$;

-- The full canonical functions are deployed live as:
--   ensure_rider_compensation_snapshot_v1(uuid,date)
--   delivery_rider_financial_summary_v1(uuid,date,date)
--   delivery_calculate_payroll(date,date)
--   delivery_payroll_readiness_v1(date,date)
-- and activity triggers on delivery_attendance, delivery_orders, internal_trips.
--
-- Keep this marker migration in source control; the next schema consolidation should
-- dump the live function definitions verbatim before rebuilding a fresh environment.
