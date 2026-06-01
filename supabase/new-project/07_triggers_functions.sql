-- Triggers and functions for automatic incidents, notifications and scoring

-- add optional column for max_normal_run_minutes if missing
alter table public.delivery_settings
  add column if not exists max_normal_run_minutes integer default 120;

-- compute monthly score for a rider
create or replace function public.delivery_compute_monthly_score(p_rider_id uuid, p_period_id uuid)
  returns void
  language plpgsql security definer
as $$
declare
  period record;
  start_date date;
  end_date date;
  attendance_count int;
  late_count int;
  missed_checkout int;
  rider_avg_duration numeric;
  branch_avg_duration numeric;
  branch_id uuid;
  orders_total int;
  orders_delivered int;
  orders_failed int;
  accuracy_issues int;
  internal_trips_approved int;
  manager_score_val numeric := 10; -- default, admin may adjust
  attendance_score_val numeric;
  speed_score_val numeric;
  accuracy_score_val numeric;
  success_score_val numeric;
  internal_trip_score_val numeric;
  total_points numeric;
begin
  select start_date, end_date into period from public.delivery_payroll_periods where id = p_period_id;
  if not found then
    raise exception 'Period % not found', p_period_id;
  end if;
  start_date := period.start_date;
  end_date := period.end_date;

  select branch_id into branch_id from public.delivery_riders where id = p_rider_id;

  -- attendance heuristics
  select count(distinct date_trunc('day', checkin_at)) into attendance_count
    from public.delivery_attendance
    where rider_id = p_rider_id and checkin_at::date between start_date and end_date;

  select count(*) into late_count
    from public.delivery_attendance
    where rider_id = p_rider_id and gps_review = true and checkin_at::date between start_date and end_date;

  select 0 into missed_checkout; -- placeholder (no checkout table present)

  attendance_score_val := greatest(0, 20 - (late_count * 3) - (missed_checkout * 5));

  -- speed heuristics: average run duration in minutes
  select coalesce(avg(extract(epoch from (ended_at - started_at)) / 60), 0) into rider_avg_duration
    from public.delivery_runs
    where rider_id = p_rider_id and status = 'completed' and started_at::date between start_date and end_date and ended_at is not null;

  select coalesce(avg(extract(epoch from (ended_at - started_at)) / 60), 0) into branch_avg_duration
    from public.delivery_runs dr
    join public.delivery_riders r on r.id = dr.rider_id and r.branch_id = branch_id
    where dr.status = 'completed' and dr.started_at::date between start_date and end_date and dr.ended_at is not null;

  if rider_avg_duration = 0 then
    speed_score_val := 12; -- neutral when no runs
  else
    if branch_avg_duration = 0 then
      speed_score_val := 25 - least(25, rider_avg_duration / 10);
    else
      if rider_avg_duration <= branch_avg_duration then
        speed_score_val := 25;
      else
        -- degrade linearly up to 0 when 3x slower
        speed_score_val := greatest(0, 25 - ((rider_avg_duration - branch_avg_duration) / branch_avg_duration) * 25);
      end if;
    end if;
  end if;

  -- orders and accuracy
  select count(*) into orders_total from public.delivery_orders where rider_id = p_rider_id and created_at::date between start_date and end_date;
  select count(*) into orders_delivered from public.delivery_orders where rider_id = p_rider_id and status = 'delivered' and created_at::date between start_date and end_date;
  select count(*) into orders_failed from public.delivery_orders where rider_id = p_rider_id and status in ('cancelled','returned') and created_at::date between start_date and end_date;
  select count(*) into accuracy_issues from public.delivery_orders where rider_id = p_rider_id and (invoice_no is null or invoice_no = '') and created_at::date between start_date and end_date;

  if orders_total = 0 then
    accuracy_score_val := 15; -- neutral
    success_score_val := 10;
  else
    accuracy_score_val := greatest(0, 20 - (accuracy_issues * 5));
    success_score_val := greatest(0, 15 * (orders_delivered::numeric / orders_total::numeric));
  end if;

  -- internal trips
  select count(*) into internal_trips_approved from public.delivery_internal_trips where rider_id = p_rider_id and status in ('approved','completed') and created_at::date between start_date and end_date;
  internal_trip_score_val := least(10, internal_trips_approved * 3);

  -- insert or update performance row
  insert into public.delivery_performance_scores (
    rider_id, period_id, attendance_score, speed_score, accuracy_score, success_score, internal_trip_score, manager_score, bonus_points, penalty_points, notes, created_at, updated_at
  ) values (
    p_rider_id, p_period_id, attendance_score_val, speed_score_val, accuracy_score_val, success_score_val, internal_trip_score_val, manager_score_val, 0, 0, 'auto computed', now(), now()
  ) on conflict (rider_id, period_id) do update set
    attendance_score = excluded.attendance_score,
    speed_score = excluded.speed_score,
    accuracy_score = excluded.accuracy_score,
    success_score = excluded.success_score,
    internal_trip_score = excluded.internal_trip_score,
    manager_score = excluded.manager_score,
    updated_at = now();
end;
$$;

-- calculate rider incentive for a period
create or replace function public.calculate_rider_incentive(p_rider_id uuid, p_period_id uuid)
  returns table(
    rider_id uuid,
    period_id uuid,
    tier text,
    base_monthly_incentive numeric,
    score_total numeric,
    incentive_percentage numeric,
    earned_incentive numeric,
    approved_bonuses numeric,
    approved_penalties numeric,
    pending_penalties numeric,
    expected_final_incentive numeric,
    notes text
  )
  language plpgsql stable security definer
as $$
declare
  perf record;
  tier text;
  base_amt numeric := 0;
  perc numeric := 0;
  approved_bon numeric := 0;
  approved_pen numeric := 0;
  pending_pen numeric := 0;
begin
  select * into perf from public.delivery_performance_scores where rider_id = p_rider_id and period_id = p_period_id;
  if not found then
    perform public.delivery_compute_monthly_score(p_rider_id, p_period_id);
    select * into perf from public.delivery_performance_scores where rider_id = p_rider_id and period_id = p_period_id;
  end if;

  select tier into tier from public.delivery_riders where id = p_rider_id;
  if tier is null then tier := 'junior'; end if;
  case tier
    when 'senior' then base_amt := 1000
    else base_amt := 750
  end case;

  if perf is null then
    score_total := 0;
  else
    score_total := perf.score_total;
  end if;

  -- incentive percentage mapping
  if score_total >= 95 then
    perc := 1.0;
  elsif score_total = 90 then
    perc := 1.0;
  elsif score_total >= 90 then
    perc := 0.95;
  elsif score_total >= 80 and score_total <= 89 then
    perc := 0.75;
  elsif score_total >= 70 and score_total <= 79 then
    perc := 0.5;
  else
    perc := 0.0;
  end if;

  select coalesce(sum(amount), 0) into approved_bon from public.delivery_incentive_events where rider_id = p_rider_id and period_id = p_period_id and event_type = 'bonus' and status = 'approved';
  select coalesce(sum(amount), 0) into approved_pen from public.delivery_incentive_events where rider_id = p_rider_id and period_id = p_period_id and event_type = 'penalty' and status = 'approved';
  select coalesce(sum(amount), 0) into pending_pen from public.delivery_incentive_events where rider_id = p_rider_id and period_id = p_period_id and event_type = 'penalty' and status = 'pending';

  earned_incentive := base_amt * perc;
  expected_final_incentive := greatest(0, earned_incentive + approved_bon - approved_pen);

  return query select p_rider_id, p_period_id, tier, base_amt, score_total, perc*100, earned_incentive, approved_bon, approved_pen, pending_pen, expected_final_incentive, 'calculated';
end;
$$;

-- trigger: on run completed -> check duration and create incident/notification
create or replace function public.trg_delivery_run_completed()
  returns trigger
  language plpgsql security definer
as $$
declare
  dur_minutes numeric;
  max_minutes integer;
  rider_branch uuid;
  inc_id uuid;
begin
  if tg_op = 'UPDATE' and new.status = 'completed' and (old.status is distinct from new.status) then
    if new.started_at is null or new.ended_at is null then
      return new;
    end if;

    dur_minutes := extract(epoch from (new.ended_at - new.started_at)) / 60;
    select coalesce(max_normal_run_minutes, 120) into max_minutes from public.delivery_settings where branch_id = new.branch_id limit 1;

    if dur_minutes > max_minutes then
      -- create incident
      insert into public.delivery_incidents (rider_id, run_id, incident_type, severity, title, description, auto_generated, created_at)
      values (new.rider_id, new.id, 'run_too_long', 'medium', 'خروجة طويلة', format('مدة الخروجة %.0f دقائق، الحد %s', dur_minutes, max_minutes), true, now())
      returning id into inc_id;

      -- notification to rider and admins
      insert into public.delivery_notifications (rider_id, notification_type, title, message, severity, created_at)
      values (new.rider_id, 'run_too_long', 'خروجة طويلة', format('مدة الخروجة %.0f دقائق تجاوزت الحد المسموح %s', dur_minutes, max_minutes), 'warning', now());

      -- create pending penalty event (rule to be applied by admin)
      insert into public.delivery_incentive_events (rider_id, period_id, rule_id, event_type, amount, points, reason, source_type, source_id, status, created_at)
      values (new.rider_id, null, null, 'penalty', 20, 0, 'Open run too long auto penalty pending review', 'delivery_run', new.id, 'pending', now());
    end if;
  end if;
  return new;
end;
$$;

create trigger delivery_run_completed_trg
  after update on public.delivery_runs
  for each row
  execute procedure public.trg_delivery_run_completed();

-- trigger: on delivery_orders status change to cancelled/returned -> incident + pending penalty
create or replace function public.trg_delivery_order_failed()
  returns trigger
  language plpgsql security definer
as $$
declare
  inc_id uuid;
begin
  if tg_op = 'UPDATE' and new.status in ('cancelled','returned') and (old.status is distinct from new.status) then
    insert into public.delivery_incidents (rider_id, order_id, incident_type, severity, title, description, auto_generated, created_at)
    values (new.rider_id, new.id, 'failed_order', 'medium', 'أوردر فشل', format('Order %s status %s', new.invoice_no, new.status), true, now())
    returning id into inc_id;

    insert into public.delivery_notifications (rider_id, notification_type, title, message, severity, created_at)
    values (new.rider_id, 'failed_order', 'أوردر فشل', format('فاتورة %s لم تتم توصيلها: %s', new.invoice_no, new.status), 'warning', now());

    insert into public.delivery_incentive_events (rider_id, period_id, rule_id, event_type, amount, points, reason, source_type, source_id, status, created_at)
    values (new.rider_id, null, null, 'penalty', 50, 0, 'Failed order - rider fault pending review', 'delivery_order', new.id, 'pending', now());
  end if;
  return new;
end;
$$;

create trigger delivery_order_failed_trg
  after update on public.delivery_orders
  for each row
  execute procedure public.trg_delivery_order_failed();

-- trigger: on delivery_runs status change to review due to manual return -> incident & notification & pending penalty
create or replace function public.trg_delivery_run_manual_return()
  returns trigger
  language plpgsql security definer
as $$
declare
  inc_id uuid;
begin
  if tg_op = 'UPDATE' and new.status = 'review' and (old.status is distinct from new.status) and new.manual_return_reason is not null then
    insert into public.delivery_incidents (rider_id, run_id, incident_type, severity, title, description, auto_generated, created_at)
    values (new.rider_id, new.id, 'manual_return', 'high', 'رجوع يدوي', new.manual_return_reason, true, now())
    returning id into inc_id;

    insert into public.delivery_notifications (rider_id, notification_type, title, message, severity, created_at)
    values (new.rider_id, 'manual_return', 'رجوع يدوي', new.manual_return_reason, 'danger', now());

    insert into public.delivery_incentive_events (rider_id, period_id, rule_id, event_type, amount, points, reason, source_type, source_id, status, created_at)
    values (new.rider_id, null, null, 'penalty', 20, 0, 'Manual return requires review', 'delivery_run', new.id, 'pending', now());
  end if;
  return new;
end;
$$;

create trigger delivery_run_manual_return_trg
  after update on public.delivery_runs
  for each row
  execute procedure public.trg_delivery_run_manual_return();

-- trigger: on approved internal trip -> recompute performance
create or replace function public.trg_internal_trip_approved()
  returns trigger
  language plpgsql security definer
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    if new.status in ('approved','completed') then
      -- try to find current payroll period covering created_at
      perform public.delivery_compute_monthly_score(new.rider_id, (
        select id from public.delivery_payroll_periods where new.created_at::date between start_date and end_date limit 1
      ));
    end if;
  end if;
  return new;
end;
$$;

create trigger internal_trip_approved_trg
  after insert or update on public.delivery_internal_trips
  for each row
  execute procedure public.trg_internal_trip_approved();

-- trigger: on incentive event approved -> recompute expected incentive (optional)
create or replace function public.trg_incentive_event_approved()
  returns trigger
  language plpgsql security definer
as $$
begin
  if tg_op = 'UPDATE' and new.status = 'approved' and (old.status is distinct from new.status) then
    -- notify rider
    insert into public.delivery_notifications (rider_id, notification_type, title, message, severity, created_at)
    values (new.rider_id, 'incentive_changed', 'تغيير الحافز', format('تم اعتماد %s بقيمة %s', new.event_type, new.amount), 'success', now());
  end if;
  return new;
end;
$$;

create trigger incentive_event_approved_trg
  after update on public.delivery_incentive_events
  for each row
  execute procedure public.trg_incentive_event_approved();

-- end of triggers/functions
