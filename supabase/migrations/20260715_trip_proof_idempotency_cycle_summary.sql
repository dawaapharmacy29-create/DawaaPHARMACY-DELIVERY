alter table if exists public.internal_trips
  add column if not exists proof_capture_session_id text null,
  add column if not exists proof_camera_opened_at timestamptz null,
  add column if not exists proof_captured_at timestamptz null,
  add column if not exists proof_uploaded_at timestamptz null,
  add column if not exists proof_source text null,
  add column if not exists proof_sha256 text null,
  add column if not exists is_countable boolean null,
  add column if not exists duplicate_of uuid null,
  add column if not exists duplicate_reason text null;

comment on column public.internal_trips.duplicate_of is
  'Legacy duplicate cleanup on 2026-07-16 kept data intact: 9 primary records and 69 duplicate records linked through duplicate_of, with no deletes.';

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
  v_payload_rider_id uuid;
begin
  if v_client_request_id is null then
    return jsonb_build_object('success', false, 'error', 'client_request_id_required', 'message', 'client_request_id is required');
  end if;

  begin
    v_payload_rider_id := nullif(trim(p_payload->>'rider_id'), '')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('success', false, 'error', 'invalid_rider_id', 'message', 'Invalid rider_id');
  end;

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

  if v_payload_rider_id is not null and v_payload_rider_id is distinct from v_session.rider_id then
    return jsonb_build_object(
      'success', false,
      'error', 'rider_identity_mismatch',
      'message', 'rider_id does not match the active session'
    );
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

  begin
    insert into public.internal_trips (
      id,
      client_request_id,
      rider_id,
      rider_name,
      branch_id,
      branch_name,
      trip_date,
      work_date,
      attendance_id,
      trip_type,
      from_label,
      to_label,
      reason,
      related_invoice_number,
      has_invoice_reference,
      requested_by_name,
      evidence_type,
      evidence_note,
      evidence_status,
      proof_required,
      proof_image_url,
      proof_image_path,
      proof_note,
      proof_capture_session_id,
      proof_camera_opened_at,
      proof_captured_at,
      proof_uploaded_at,
      proof_source,
      proof_sha256,
      proof_review_status,
      proof_exception_status,
      proof_exception_reason,
      needs_review,
      is_countable,
      review_reason,
      review_status,
      notes,
      status,
      registered_at,
      trip_rate,
      trip_multiplier,
      trip_earning
    )
    values (
      coalesce(nullif(trim(p_payload->>'id'), '')::uuid, gen_random_uuid()),
      v_client_request_id,
      v_session.rider_id,
      v_rider.name,
      v_rider.branch_id,
      coalesce(v_rider.branch_name, p_payload->>'branch_name'),
      coalesce(nullif(trim(p_payload->>'trip_date'), '')::date, current_date),
      nullif(trim(p_payload->>'work_date'), '')::date,
      nullif(trim(p_payload->>'attendance_id'), '')::uuid,
      coalesce(nullif(trim(p_payload->>'trip_type'), ''), 'branch_to_branch'),
      nullif(trim(p_payload->>'from_label'), ''),
      nullif(trim(p_payload->>'to_label'), ''),
      coalesce(nullif(trim(p_payload->>'reason'), ''), 'مشوار بدون سبب تفصيلي'),
      nullif(trim(p_payload->>'related_invoice_number'), ''),
      coalesce((p_payload->>'has_invoice_reference')::boolean, false),
      nullif(trim(p_payload->>'requested_by_name'), ''),
      coalesce(nullif(trim(p_payload->>'evidence_type'), ''), 'trip_photo'),
      nullif(trim(p_payload->>'evidence_note'), ''),
      coalesce(nullif(trim(p_payload->>'evidence_status'), ''), 'pending_admin_review'),
      coalesce((p_payload->>'proof_required')::boolean, true),
      nullif(trim(p_payload->>'proof_image_url'), ''),
      nullif(trim(p_payload->>'proof_image_path'), ''),
      nullif(trim(p_payload->>'proof_note'), ''),
      nullif(trim(p_payload->>'proof_capture_session_id'), ''),
      nullif(trim(p_payload->>'proof_camera_opened_at'), '')::timestamptz,
      nullif(trim(p_payload->>'proof_captured_at'), '')::timestamptz,
      nullif(trim(p_payload->>'proof_uploaded_at'), '')::timestamptz,
      nullif(trim(p_payload->>'proof_source'), ''),
      v_proof_sha256,
      coalesce(nullif(trim(p_payload->>'proof_review_status'), ''), 'pending'),
      coalesce(nullif(trim(p_payload->>'proof_exception_status'), ''), 'none'),
      nullif(trim(p_payload->>'proof_exception_reason'), ''),
      coalesce((p_payload->>'needs_review')::boolean, false),
      true,
      nullif(trim(p_payload->>'review_reason'), ''),
      coalesce(nullif(trim(p_payload->>'review_status'), ''), 'pending'),
      nullif(trim(p_payload->>'notes'), ''),
      'pending_approval',
      coalesce(nullif(trim(p_payload->>'registered_at'), '')::timestamptz, now()),
      coalesce(nullif(trim(p_payload->>'trip_rate'), '')::numeric, 0),
      coalesce(nullif(trim(p_payload->>'trip_multiplier'), '')::numeric, 1),
      coalesce(nullif(trim(p_payload->>'trip_earning'), '')::numeric, coalesce(nullif(trim(p_payload->>'trip_rate'), '')::numeric, 0))
    )
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
      and coalesce(t.is_countable, true) = true
      and t.duplicate_of is null
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
