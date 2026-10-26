-- REVIEW ONLY; NOT APPLIED. Requires delivery_invoice_identity_registry_v1_review.sql.
-- A duplicate registration appends a visit event, NEVER another delivery_orders row.
-- This is a staged duplicate path; it does not replace first-time order creation.

create or replace function public.rider_register_repeated_visit_v1(
  p_token text,
  p_invoice_number text,
  p_reason text,
  p_note text,
  p_client_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  v_account public.rider_accounts%rowtype;
  v_rider_id uuid;
  v_branch_id uuid;
  v_rider_branch_id uuid;
  v_invoice_key text;
  v_identity dawaa_private.delivery_invoice_identities_v1%rowtype;
  v_order_id text;
  v_count integer;
  v_event_id bigint;
  v_existing_identity_id bigint;
  v_existing_reason text;
  v_existing_note text;
begin
  if coalesce(length(btrim(p_token)), 0) < 20 then
    raise exception 'rider_session_required' using errcode = '42501'; end if;

  select a.* into v_account from public.rider_sessions s
    join public.rider_accounts a on a.id = s.account_id
    where s.session_token = p_token and coalesce(s.revoked, false) = false
      and s.revoked_at is null and s.expires_at > now()
      and a.status = 'active' and a.role = 'rider'
    limit 1;
  if v_account.id is null then
    raise exception 'active_rider_session_required' using errcode = '42501'; end if;

  v_rider_id := v_account.rider_id;
  select r.branch_id into v_rider_branch_id
    from public.riders r where r.id = v_rider_id;
  -- Inconsistent account and rider assignments must be reviewed explicitly.
  -- Never silently choose one branch for the invoice identity.
  -- A null account branch is allowed: the rider's assigned branch is the
  -- authoritative source. Only two conflicting explicit branches are unsafe.
  if v_rider_branch_id is null
    or (v_account.branch_id is not null
      and v_rider_branch_id is distinct from v_account.branch_id) then
    raise exception 'rider_branch_assignment_mismatch' using errcode = '42501';
  end if;
  v_branch_id := v_rider_branch_id;
  v_invoice_key := dawaa_private.delivery_invoice_key_v1(p_invoice_number);

  if v_rider_id is null or v_branch_id is null or coalesce(v_invoice_key,'') = ''
    or coalesce(btrim(p_reason),'') = '' or length(coalesce(p_reason,'')) > 500
    or coalesce(length(btrim(p_note)),0) < 5
    or length(coalesce(p_note,'')) > 1000
    or length(coalesce(btrim(p_client_request_id),'')) < 12
    or length(p_client_request_id) > 120
  then raise exception 'invalid_visit_details' using errcode = '22023'; end if;

  -- Serialize requests for the same branch+invoice, including different days.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_branch_id::text || ':' || v_invoice_key, 0));

  -- Idempotent retries cannot make a second visit. A reused request key
  -- referring to another invoice must fail rather than silently succeed.
  select e.id, e.invoice_identity_id, e.reason, e.note
    into v_event_id, v_existing_identity_id, v_existing_reason, v_existing_note
    from dawaa_private.delivery_invoice_visit_events_v1 e
    where e.rider_id = v_rider_id and e.client_request_id = p_client_request_id;
  if v_event_id is not null then
    select * into v_identity from dawaa_private.delivery_invoice_identities_v1
      where id = v_existing_identity_id;
    if v_identity.branch_id <> v_branch_id or v_identity.invoice_key <> v_invoice_key then
      raise exception 'request_key_reused_for_other_invoice' using errcode = '22023'; end if;
    -- An idempotency key identifies the *whole* submitted visit, not merely
    -- its invoice. Never silently discard a different rider explanation.
    if v_existing_reason is distinct from btrim(p_reason)
       or v_existing_note is distinct from btrim(p_note) then
      raise exception 'request_key_reused_with_changed_visit_details'
        using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object('success',true,'visit_id',v_event_id,
      'invoice_identity_id',v_identity.id,'replayed',true,'countable',false);
  end if;

  select * into v_identity from dawaa_private.delivery_invoice_identities_v1
    where branch_id = v_branch_id and invoice_key = v_invoice_key for update;

  if v_identity.id is null then
    -- Historical orders are read only. We never choose a canonical owner
    -- automatically when several rows already claim the same invoice.
    select count(*), min(id) into v_count, v_order_id
      from public.delivery_orders o
      where o.deleted_at is null and o.branch_id = v_branch_id
        and dawaa_private.delivery_invoice_key_v1(
          coalesce(nullif(o.invoice_number,''),o.invoice_no)) = v_invoice_key;
    if v_count = 0 then
      raise exception 'invoice_not_found_register_original_first' using errcode = '22023';
    end if;
    insert into dawaa_private.delivery_invoice_identities_v1
      (branch_id, invoice_key, canonical_order_id, review_state)
      values (v_branch_id, v_invoice_key,
        case when v_count = 1 then v_order_id else null end,
        case when v_count = 1 then 'verified' else 'unresolved' end)
      returning * into v_identity;
  end if;

  insert into dawaa_private.delivery_invoice_visit_events_v1
    (invoice_identity_id, rider_id, client_request_id, event_kind, reason, note)
    values (v_identity.id, v_rider_id, p_client_request_id,
      'duplicate_attempt', btrim(p_reason), nullif(btrim(p_note),''))
    returning id into v_event_id;

  return pg_catalog.jsonb_build_object('success',true,'visit_id',v_event_id,
    'invoice_identity_id',v_identity.id,'replayed',false,'countable',false,
    'review_state',v_identity.review_state,'visit_credit_status','pending');
end;
$body$;

revoke all on function public.rider_register_repeated_visit_v1(text,text,text,text,text) from public;
grant execute on function public.rider_register_repeated_visit_v1(text,text,text,text,text) to anon, authenticated;

-- IMPORTANT: No frontend activation until normal-order creation is protected
-- by the SAME identity lock and legacy direct writes are safely cut over.
