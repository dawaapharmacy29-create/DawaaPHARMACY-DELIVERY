alter table if exists public.internal_trips
  add column if not exists proof_capture_session_id text null,
  add column if not exists proof_camera_opened_at timestamptz null,
  add column if not exists proof_captured_at timestamptz null,
  add column if not exists proof_uploaded_at timestamptz null,
  add column if not exists proof_source text null,
  add column if not exists proof_sha256 text null,
  add column if not exists is_countable boolean null;

create index if not exists internal_trips_proof_sha256_idx
on public.internal_trips(proof_sha256)
where proof_sha256 is not null;

create or replace view public.internal_trip_client_request_duplicates_v1 as
select
  client_request_id,
  count(*) as duplicate_count,
  array_agg(id order by registered_at) as trip_ids
from public.internal_trips
where client_request_id is not null
group by client_request_id
having count(*) > 1;

do $$
begin
  if not exists (
    select 1
    from public.internal_trips
    where client_request_id is not null
    group by client_request_id
    having count(*) > 1
  ) then
    create unique index if not exists internal_trips_client_request_id_uidx
    on public.internal_trips(client_request_id)
    where client_request_id is not null;
  else
    raise notice 'Skipped internal_trips_client_request_id_uidx because duplicate client_request_id values already exist';
  end if;
end
$$;

create or replace function public.rider_create_trip_idempotent(
  p_token text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.rider_sessions%rowtype;
  v_rider public.riders%rowtype;
  v_trip public.internal_trips%rowtype;
  v_client_request_id text := nullif(trim(p_payload->>'client_request_id'), '');
  v_proof_sha256 text := nullif(trim(p_payload->>'proof_sha256'), '');
  v_insert_payload jsonb;
begin
  if v_client_request_id is null then
    return jsonb_build_object('success', false, 'error', 'client_request_id_required', 'message', 'client_request_id is required');
  end if;

  select * into v_session
  from public.rider_sessions
  where session_token = p_token
    and revoked_at is null
    and expires_at > now()
  limit 1;

  if v_session.id is null then
    return jsonb_build_object('success', false, 'error', 'expired_session', 'message', 'Session expired. Sign in again.');
  end if;

  update public.rider_sessions
  set last_seen = now()
  where id = v_session.id;

  select * into v_rider
  from public.riders
  where id = v_session.rider_id
    and status = 'active'
  limit 1;

  if v_rider.id is null then
    return jsonb_build_object('success', false, 'error', 'inactive_account', 'message', 'Rider account is not active');
  end if;

  select * into v_trip
  from public.internal_trips
  where client_request_id = v_client_request_id
    and rider_id = v_session.rider_id
  limit 1;

  if v_trip.id is not null then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'trip', to_jsonb(v_trip),
      'message', 'Existing trip returned for the same client_request_id'
    );
  end if;

  if exists (
    select 1
    from public.internal_trips
    where client_request_id = v_client_request_id
      and rider_id is distinct from v_session.rider_id
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'client_request_id_conflict',
      'message', 'client_request_id belongs to another rider'
    );
  end if;

  if v_proof_sha256 is not null and exists (
    select 1
    from public.internal_trips
    where proof_sha256 = v_proof_sha256
      and client_request_id is distinct from v_client_request_id
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'duplicate_proof_image',
      'message', 'This proof image is already used by another trip and needs admin review.'
    );
  end if;

  v_insert_payload :=
    (p_payload - 'session_token')
    || jsonb_build_object(
      'client_request_id', v_client_request_id,
      'rider_id', v_session.rider_id,
      'rider_name', v_rider.name,
      'branch_id', v_rider.branch_id,
      'branch_name', coalesce(v_rider.branch_name, p_payload->>'branch_name')
    );

  begin
    insert into public.internal_trips
    select (jsonb_populate_record(null::public.internal_trips, v_insert_payload)).*
    returning * into v_trip;
  exception
    when unique_violation then
      select * into v_trip
      from public.internal_trips
      where client_request_id = v_client_request_id
        and rider_id = v_session.rider_id
      limit 1;

      if v_trip.id is not null then
        return jsonb_build_object(
          'success', true,
          'created', false,
          'trip', to_jsonb(v_trip),
          'message', 'Existing trip returned for the same client_request_id'
        );
      end if;
      raise;
  end;

  return jsonb_build_object(
    'success', true,
    'created', true,
    'trip', to_jsonb(v_trip),
    'message', ''
  );
end;
$$;

grant execute on function public.rider_create_trip_idempotent(text, jsonb) to anon, authenticated;

create or replace function public.get_rider_cycle_summary_v2(
  p_token text,
  p_rider_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session public.rider_sessions%rowtype;
  v_summary jsonb;
begin
  select * into v_session
  from public.rider_sessions
  where session_token = p_token
    and revoked_at is null
    and expires_at > now()
    and rider_id = p_rider_id
  limit 1;

  if v_session.id is null then
    return jsonb_build_object('success', false, 'error', 'expired_session', 'message', 'Session expired. Sign in again.');
  end if;

  with orders_scope as (
    select *
    from public.delivery_orders o
    where o.rider_id = p_rider_id
      and coalesce(o.work_date, o.delivery_date, o.registered_at::date, o.created_at::date) >= p_period_start
      and coalesce(o.work_date, o.delivery_date, o.registered_at::date, o.created_at::date) <= p_period_end
      and coalesce(o.deleted_at, null) is null
  ),
  trips_scope as (
    select *
    from public.internal_trips t
    where t.rider_id = p_rider_id
      and coalesce(t.work_date, t.trip_date, t.registered_at::date, t.created_at::date) >= p_period_start
      and coalesce(t.work_date, t.trip_date, t.registered_at::date, t.created_at::date) <= p_period_end
  ),
  order_counts as (
    select
      count(*)::integer as total_orders,
      count(*) filter (where status = 'delivered')::integer as delivered_orders,
      count(*) filter (where status = 'failed')::integer as failed_orders,
      count(*) filter (where coalesce(status, '') not in ('delivered', 'failed', 'cancelled', 'canceled'))::integer as pending_orders,
      count(*) filter (where coalesce(is_countable, false) = true or coalesce(final_count_status, '') like 'counted%')::integer as countable_orders,
      count(*) filter (where coalesce(is_countable, false) = false or coalesce(final_count_status, '') like 'excluded%')::integer as excluded_orders,
      count(*) filter (where coalesce(order_multiplier, 1) >= 1.5)::integer as multiplier_orders,
      count(*) filter (where coalesce(is_duplicate_invoice, false) = true)::integer as duplicate_orders
    from orders_scope
  ),
  trip_counts as (
    select
      count(*)::integer as total_trips,
      count(*) filter (
        where coalesce(is_countable, true) = true
          and coalesce(proof_review_status, '') <> 'pending_upload'
          and coalesce(evidence_status, '') <> 'pending_upload'
          and coalesce(status, review_status, '') in ('approved', 'completed', 'countable')
      )::integer as approved_trips,
      count(*) filter (where coalesce(status, review_status, '') like 'pending%')::integer as pending_trips,
      count(*) filter (
        where coalesce(proof_review_status, '') = 'pending_upload'
           or coalesce(evidence_status, '') = 'pending_upload'
           or coalesce(is_countable, true) = false
      )::integer as pending_proof_trips
    from trips_scope
  )
  select to_jsonb(order_counts.*) || to_jsonb(trip_counts.*)
  into v_summary
  from order_counts, trip_counts;

  return coalesce(v_summary, '{}'::jsonb);
end;
$$;

grant execute on function public.get_rider_cycle_summary_v2(text, uuid, date, date) to anon, authenticated;
