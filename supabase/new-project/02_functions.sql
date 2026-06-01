-- Business functions for Dawaa Delivery

create or replace function public.delivery_current_user_role()
  returns text
  language sql stable
as $$
  select role from public.user_profiles where id = auth.uid()::uuid
$$;

create or replace function public.delivery_current_user_branch_id()
  returns uuid
  language sql stable
as $$
  select branch_id from public.user_profiles where id = auth.uid()::uuid
$$;

create or replace function public.delivery_current_rider_id()
  returns uuid
  language sql stable
as $$
  select id from public.delivery_riders where user_id = auth.uid()::uuid
$$;

create or replace function public.delivery_resolve_login(login_name text)
  returns text
  language plpgsql stable
  security definer
as $$
begin
  if login_name is null then
    return null;
  end if;

  login_name := trim(login_name);
  if login_name = '' then
    return null;
  end if;

  if position('@' in login_name) > 0 then
    return lower(login_name);
  end if;

  return (
    select email
    from (
      select email from public.delivery_login_aliases where lower(username) = lower(login_name)
      union all
      select email from public.user_profiles where lower(username) = lower(login_name)
      limit 1
    ) as found
  );
end;
$$;

create or replace function public.get_current_delivery_period()
  returns table(id uuid, start_date date, end_date date, status text)
  language plpgsql stable
as $$
declare
  period_start date;
  period_end date;
  target_date date := current_date;
begin
  if extract(day from target_date) >= 26 then
    period_start := (date_trunc('month', target_date)::date + interval '25 days')::date;
  else
    period_start := ((date_trunc('month', target_date) - interval '1 month')::date + interval '25 days')::date;
  end if;
  period_end := (period_start + interval '1 month - 1 day')::date;

  return query
    select id, start_date, end_date, status
    from public.delivery_payroll_periods
    where start_date = period_start and end_date = period_end
    limit 1;
end;
$$;

create or replace function public.create_or_get_delivery_period(input_date date)
  returns table(id uuid, start_date date, end_date date, status text)
  language plpgsql stable
as $$
declare
  period_start date;
  period_end date;
begin
  if extract(day from input_date) >= 26 then
    period_start := (date_trunc('month', input_date)::date + interval '25 days')::date;
  else
    period_start := ((date_trunc('month', input_date) - interval '1 month')::date + interval '25 days')::date;
  end if;
  period_end := (period_start + interval '1 month - 1 day')::date;

  insert into public.delivery_payroll_periods (start_date, end_date, status)
  values (period_start, period_end, 'open')
  on conflict (start_date, end_date) do update set updated_at = now()
  returning id, start_date, end_date, status
  into id, start_date, end_date, status;

  return;
end;
$$;

create type if not exists public.delivery_payroll_row as (
  rider_id uuid,
  rider_name text,
  tier text,
  hours_count numeric,
  delivered_orders_count integer,
  internal_trips_count integer,
  hourly_rate_snapshot numeric,
  order_rate_snapshot numeric,
  internal_trip_rate_snapshot numeric,
  gross_total numeric,
  bonuses_total numeric,
  deductions_total numeric,
  net_total numeric,
  pending_review_count integer,
  unapproved_trips_count integer,
  failed_orders_count integer,
  can_approve_payroll boolean
);

create or replace function public.delivery_calculate_payroll(p_period_start date, p_period_end date)
  returns setof public.delivery_payroll_row
  language sql stable
as $$
select
  r.id as rider_id,
  r.display_name as rider_name,
  r.tier,
  coalesce((
    select sum(extract(epoch from (ended_at - started_at)) / 3600)
    from public.delivery_runs dr
    where dr.rider_id = r.id
      and dr.started_at >= p_period_start
      and dr.started_at < p_period_end + interval '1 day'
      and dr.ended_at is not null
  ), 0) as hours_count,
  coalesce((
    select count(*)
    from public.delivery_orders o
    where o.rider_id = r.id
      and o.status = 'delivered'
      and o.created_at >= p_period_start
      and o.created_at < p_period_end + interval '1 day'
  ), 0) as delivered_orders_count,
  coalesce((
    select count(*)
    from public.delivery_internal_trips it
    where it.rider_id = r.id
      and it.status in ('approved','completed')
      and it.created_at >= p_period_start
      and it.created_at < p_period_end + interval '1 day'
  ), 0) as internal_trips_count,
  r.hourly_rate as hourly_rate_snapshot,
  r.order_rate as order_rate_snapshot,
  r.internal_trip_rate as internal_trip_rate_snapshot,
  (
    coalesce((
      select sum(extract(epoch from (ended_at - started_at)) / 3600)
      from public.delivery_runs dr
      where dr.rider_id = r.id
        and dr.started_at >= p_period_start
        and dr.started_at < p_period_end + interval '1 day'
        and dr.ended_at is not null
    ), 0) * r.hourly_rate
    + coalesce((
      select count(*)
      from public.delivery_orders o
      where o.rider_id = r.id
        and o.status = 'delivered'
        and o.created_at >= p_period_start
        and o.created_at < p_period_end + interval '1 day'
    ), 0) * r.order_rate
    + coalesce((
      select count(*)
      from public.delivery_internal_trips it
      where it.rider_id = r.id
        and it.status in ('approved','completed')
        and it.created_at >= p_period_start
        and it.created_at < p_period_end + interval '1 day'
    ), 0) * r.internal_trip_rate
  ) as gross_total,
  0 as bonuses_total,
  0 as deductions_total,
  (
    coalesce((
      select sum(extract(epoch from (ended_at - started_at)) / 3600)
      from public.delivery_runs dr
      where dr.rider_id = r.id
        and dr.started_at >= p_period_start
        and dr.started_at < p_period_end + interval '1 day'
        and dr.ended_at is not null
    ), 0) * r.hourly_rate
    + coalesce((
      select count(*)
      from public.delivery_orders o
      where o.rider_id = r.id
        and o.status = 'delivered'
        and o.created_at >= p_period_start
        and o.created_at < p_period_end + interval '1 day'
    ), 0) * r.order_rate
    + coalesce((
      select count(*)
      from public.delivery_internal_trips it
      where it.rider_id = r.id
        and it.status in ('approved','completed')
        and it.created_at >= p_period_start
        and it.created_at < p_period_end + interval '1 day'
    ), 0) * r.internal_trip_rate
  ) as net_total,
  coalesce((
    select count(*)
    from public.delivery_runs dr
    where dr.rider_id = r.id
      and dr.status = 'review'
      and dr.started_at >= p_period_start
      and dr.started_at < p_period_end + interval '1 day'
  ), 0) as pending_review_count,
  coalesce((
    select count(*)
    from public.delivery_internal_trips it
    where it.rider_id = r.id
      and it.status = 'pending_approval'
      and it.created_at >= p_period_start
      and it.created_at < p_period_end + interval '1 day'
  ), 0) as unapproved_trips_count,
  coalesce((
    select count(*)
    from public.delivery_orders o
    where o.rider_id = r.id
      and o.status in ('cancelled','returned')
      and o.created_at >= p_period_start
      and o.created_at < p_period_end + interval '1 day'
  ), 0) as failed_orders_count,
  true as can_approve_payroll
from public.delivery_riders r;
$$;

create or replace function public.calculate_delivery_payroll(input_period_id uuid)
  returns setof public.delivery_payroll_row
  language plpgsql stable
as $$
declare
  period record;
begin
  select id, start_date, end_date into period
  from public.delivery_payroll_periods
  where id = input_period_id;

  if not found then
    raise exception 'Payroll period % not found', input_period_id;
  end if;

  return query
    select * from public.delivery_calculate_payroll(period.start_date, period.end_date);
end;
$$;

create or replace function public.get_rider_active_run(input_rider_id uuid)
  returns public.delivery_runs
  language sql stable
as $$
  select * from public.delivery_runs
  where rider_id = input_rider_id and status = 'active'
  limit 1
$$;

create or replace function public.delivery_search_customers(search_text text)
  returns table(
    id uuid,
    customer_code text,
    name text,
    phone text,
    address text,
    branch_id uuid
  )
  language plpgsql stable
as $$
begin
  return query
  select id, customer_code, name, phone, address, branch_id
  from public.delivery_customers
  where (
    customer_code ilike concat('%', search_text, '%')
    or name ilike concat('%', search_text, '%')
    or phone ilike concat('%', search_text, '%')
  )
  order by customer_code
  limit 25;
end;
$$;

create or replace function public.delivery_start_attendance(
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric,
  p_gps_review boolean,
  p_gps_reason text
)
  returns void
  language plpgsql security definer
as $$
declare
  target_rider_id uuid;
  branch_id uuid;
begin
  select id, branch_id into target_rider_id, branch_id
  from public.delivery_riders
  where user_id = auth.uid()::uuid
  limit 1;

  if target_rider_id is null then
    raise exception 'Rider profile not found for current user';
  end if;

  insert into public.delivery_attendance (
    rider_id,
    branch_id,
    checkin_lat,
    checkin_lng,
    checkin_accuracy,
    gps_review,
    gps_reason
  ) values (
    target_rider_id,
    branch_id,
    p_lat,
    p_lng,
    p_accuracy,
    p_gps_review,
    p_gps_reason
  );
end;
$$;

create or replace function public.delivery_start_run(
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric,
  p_gps_review boolean,
  p_gps_reason text
)
  returns void
  language plpgsql security definer
as $$
declare
  rider_row record;
begin
  select id, branch_id
  into rider_row
  from public.delivery_riders
  where user_id = auth.uid()::uuid
  limit 1;

  if rider_row.id is null then
    raise exception 'Rider profile not found for current user';
  end if;

  if exists (select 1 from public.delivery_runs where rider_id = rider_row.id and status = 'active') then
    raise exception 'Cannot start a new run while an active run already exists';
  end if;

  insert into public.delivery_runs (
    rider_id,
    branch_id,
    status,
    start_lat,
    start_lng,
    start_accuracy,
    needs_review,
    review_reason
  ) values (
    rider_row.id,
    rider_row.branch_id,
    case when p_gps_review then 'review' else 'active' end,
    p_lat,
    p_lng,
    p_accuracy,
    p_gps_review,
    case when p_gps_review then p_gps_reason else null end
  );
end;
$$;

create or replace function public.delivery_finish_run(
  p_trip_id uuid,
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric,
  p_gps_review boolean,
  p_gps_reason text,
  p_manual_reason text
)
  returns void
  language plpgsql security definer
as $$
declare
  trip_row record;
begin
  select rider_id, status into trip_row
  from public.delivery_runs
  where id = p_trip_id
  limit 1;

  if trip_row.rider_id is null then
    raise exception 'Delivery run not found';
  end if;

  if not exists (select 1 from public.delivery_riders where id = trip_row.rider_id and user_id = auth.uid()::uuid) then
    raise exception 'Unauthorized to finish this run';
  end if;

  update public.delivery_runs
  set
    status = case
      when p_manual_reason is not null then 'review'
      when p_gps_review then 'review'
      else 'completed'
    end,
    ended_at = now(),
    return_lat = p_lat,
    return_lng = p_lng,
    return_accuracy = p_accuracy,
    needs_review = p_gps_review or p_manual_reason is not null,
    review_reason = case when p_manual_reason is not null then p_manual_reason else p_gps_reason end,
    manual_return_reason = p_manual_reason,
    updated_at = now()
  where id = p_trip_id;
end;
$$;
