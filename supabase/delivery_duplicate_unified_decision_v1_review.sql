-- The original guarded v1 was installed on 2026-10-26.
-- This amended dual-visit version is NOT APPLIED; deploy and verify separately.
-- REVIEW ONLY update: first/second/both/none are *rider visit* decisions.
-- Apply and verify transactionally before enabling the dual-visit UI flag.
-- Requires the existing dawaa_private.assert_delivery_reconciliation_manager_v1 guard.
-- Legacy pair review only: do not use this as invoice creation or identity.
-- Invoice identity is branch + normalized invoice number, regardless of day.
-- Both rider visits may count independently; this function never creates a
-- BConnect invoice or duplicates its commercial amount.

create schema if not exists dawaa_private;

create table if not exists dawaa_private.delivery_duplicate_decision_audit_v1 (
  id bigint generated always as identity primary key,
  invoice_number text not null,
  order_id text not null,
  previous_status text,
  decided_status text not null check (decided_status in ('approved', 'rejected')),
  rejection_reason text,
  manager_note text,
  actor_id uuid,
  actor_kind text not null,
  recorded_at timestamptz not null default now()
);
revoke all on dawaa_private.delivery_duplicate_decision_audit_v1 from public, anon, authenticated;

create or replace function public.review_duplicate_invoice_pair_v1(
  p_token text,
  p_first_order_id text,
  p_second_order_id text,
  p_choice text,
  p_rejection_reason text default null,
  p_manager_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  v_first public.delivery_orders%rowtype;
  v_second public.delivery_orders%rowtype;
  v_count integer;
  v_first_status text;
  v_second_status text;
  v_actor_id uuid;
  v_actor_kind text;
  v_first_countable boolean;
  v_second_countable boolean;
begin
  perform dawaa_private.assert_delivery_reconciliation_manager_v1(p_token);
  if p_first_order_id is null or p_second_order_id is null
    or p_first_order_id = p_second_order_id
    or p_choice is null or p_choice not in ('first', 'second', 'both', 'none')
  then raise exception 'invalid_duplicate_decision' using errcode = '22023'; end if;

  if p_choice <> 'both' and coalesce(length(btrim(p_rejection_reason)), 0) < 5 then
    raise exception 'rejection_reason_required' using errcode = '22023'; end if;
  if p_choice = 'both' and coalesce(length(btrim(p_manager_note)), 0) < 10 then
    raise exception 'independent_visit_evidence_required' using errcode = '22023'; end if;
  if length(coalesce(p_rejection_reason, '')) > 500 or length(coalesce(p_manager_note, '')) > 1000
  then raise exception 'decision_note_too_long' using errcode = '22023'; end if;

  -- Lock both orders in deterministic order; a second reviewer must wait.
  perform 1 from public.delivery_orders o
    where o.id in (p_first_order_id, p_second_order_id)
    order by o.id for update;
  select * into v_first from public.delivery_orders where id = p_first_order_id;
  select * into v_second from public.delivery_orders where id = p_second_order_id;
  if v_first.id is null or v_second.id is null
    or v_first.deleted_at is not null or v_second.deleted_at is not null
    or coalesce(btrim(v_first.invoice_number), '') = ''
    or coalesce(v_first.branch_id::text, nullif(btrim(v_first.branch_name), ''), '') = ''
    or public.normalize_delivery_reconciliation_invoice(v_first.invoice_number)
      is distinct from public.normalize_delivery_reconciliation_invoice(v_second.invoice_number)
    or coalesce(v_first.branch_id::text, btrim(v_first.branch_name), '')
      is distinct from coalesce(v_second.branch_id::text, btrim(v_second.branch_name), '')
  then raise exception 'invoice_pair_mismatch' using errcode = '22023'; end if;

  select count(*) into v_count from public.delivery_orders o
    where o.deleted_at is null
      and public.normalize_delivery_reconciliation_invoice(o.invoice_number)
        = public.normalize_delivery_reconciliation_invoice(v_first.invoice_number)
      and coalesce(o.branch_id::text, btrim(o.branch_name), '')
        = coalesce(v_first.branch_id::text, btrim(v_first.branch_name), '');
  if v_count <> 2 then raise exception 'invoice_pair_changed' using errcode = '40001'; end if;

  -- The UI must pass chronological first and second; never infer from labels.
  if coalesce(v_first.registered_at, v_first.created_at) > coalesce(v_second.registered_at, v_second.created_at)
    or (coalesce(v_first.registered_at, v_first.created_at) = coalesce(v_second.registered_at, v_second.created_at)
      and v_first.id > v_second.id)
  then raise exception 'pair_order_changed' using errcode = '40001'; end if;

  if coalesce(v_first.duplicate_review_status, 'not_required') not in ('pending', 'not_required')
    or coalesce(v_second.duplicate_review_status, 'pending') <> 'pending'
  then raise exception 'duplicate_decision_already_final' using errcode = '40001'; end if;
  if coalesce(v_second.is_duplicate_invoice, false) is not true
    or coalesce(btrim(v_second.duplicate_reason), '') = ''
  then raise exception 'later_duplicate_reason_missing' using errcode = '22023'; end if;
  if p_choice = 'both' and coalesce(length(btrim(v_second.duplicate_note)), 0) < 5 then
    raise exception 'later_duplicate_visit_note_missing' using errcode = '22023'; end if;

  v_first_status := case when p_choice in ('first', 'both') then 'approved' else 'rejected' end;
  v_second_status := case when p_choice in ('second', 'both') then 'approved' else 'rejected' end;

  -- Do not present an order already excluded for another accounting reason
  -- as newly eligible for rider credit via this duplicate-review gateway.
  if (v_first_status = 'approved' and coalesce(v_first.not_countable, false))
    or (v_second_status = 'approved' and coalesce(v_second.not_countable, false))
    or (v_first_status = 'approved' and coalesce(v_first.excluded_from_incentive, false))
    or (v_second_status = 'approved' and coalesce(v_second.excluded_from_incentive, false))
    or (v_first_status = 'approved' and coalesce(v_first.count_exclusion_reason, '') not in ('', 'duplicate_requires_admin_approval'))
    or (v_second_status = 'approved' and coalesce(v_second.count_exclusion_reason, '') not in ('', 'duplicate_requires_admin_approval'))
  then raise exception 'approved_order_has_other_exclusion' using errcode = '22023'; end if;

  v_first_countable := v_first_status = 'approved'
    and coalesce(v_first.bconnect_match_status, '') = 'matched'
    and (lower(coalesce(v_first.status, '')) in ('delivered', 'completed') or v_first.delivered_at is not null);
  v_second_countable := v_second_status = 'approved'
    and coalesce(v_second.bconnect_match_status, '') = 'matched'
    and (lower(coalesce(v_second.status, '')) in ('delivered', 'completed') or v_second.delivered_at is not null
      or (lower(coalesce(v_second.status, '')) = 'returned' and v_second.duplicate_reason = 'return'));

  -- Two paid visits need evidence of BOTH completed visits and a single
  -- already-matched source invoice. Approval is not invoice creation.
  if p_choice = 'both' and (v_first_countable is not true or v_second_countable is not true) then
    raise exception 'dual_visits_require_two_deliveries_and_bconnect_match' using errcode = '22023';
  end if;

  v_actor_id := auth.uid();
  v_actor_kind := case when v_actor_id is null then 'general_manager_session' else 'authenticated_admin' end;
  if v_actor_id is null then
    select s.account_id into v_actor_id
      from public.rider_sessions s
      join public.rider_accounts a on a.id = s.account_id
      where s.session_token = p_token and s.expires_at > now()
        and s.revoked_at is null and coalesce(s.revoked, false) = false
        and a.role = 'general_manager' and a.status = 'active';
    if v_actor_id is null then raise exception 'manager_session_not_found' using errcode = '42501'; end if;
  end if;

  update public.delivery_orders set
    duplicate_review_status = v_first_status,
    review_reason = case when v_first_status = 'rejected' then btrim(p_rejection_reason) else review_reason end,
    not_countable = case when v_first_status = 'rejected' then true else not_countable end,
    is_countable = case when v_first_status = 'rejected' then false when v_first_countable then true else is_countable end,
    final_count_status = case when v_first_status = 'rejected' then 'excluded_duplicate_rejected'
      when v_first_countable then 'counted_duplicate_visit_approved' else final_count_status end,
    count_exclusion_reason = case when v_first_status = 'rejected' then 'duplicate_rejected_by_manager'
      when count_exclusion_reason = 'duplicate_requires_admin_approval' then null else count_exclusion_reason end,
    needs_review = false,
    duplicate_reviewed_by = auth.uid(),
    duplicate_reviewed_at = now()
  where id = v_first.id;

  update public.delivery_orders set
    duplicate_review_status = v_second_status,
    review_reason = case when v_second_status = 'rejected' then btrim(p_rejection_reason) else review_reason end,
    not_countable = case when v_second_status = 'rejected' then true else not_countable end,
    is_countable = case when v_second_status = 'rejected' then false when v_second_countable then true else is_countable end,
    final_count_status = case when v_second_status = 'rejected' then 'excluded_duplicate_rejected'
      when v_second_countable then 'counted_duplicate_visit_approved' else final_count_status end,
    count_exclusion_reason = case when v_second_status = 'rejected' then 'duplicate_rejected_by_manager'
      when count_exclusion_reason = 'duplicate_requires_admin_approval' then null else count_exclusion_reason end,
    needs_review = false,
    duplicate_reviewed_by = auth.uid(),
    duplicate_reviewed_at = now()
  where id = v_second.id;

  insert into dawaa_private.delivery_duplicate_decision_audit_v1
    (invoice_number, order_id, previous_status, decided_status, rejection_reason, manager_note, actor_id, actor_kind)
  values
    (v_first.invoice_number, v_first.id, v_first.duplicate_review_status, v_first_status,
      case when v_first_status = 'rejected' then btrim(p_rejection_reason) end, nullif(btrim(p_manager_note), ''), v_actor_id, v_actor_kind),
    (v_second.invoice_number, v_second.id, v_second.duplicate_review_status, v_second_status,
      case when v_second_status = 'rejected' then btrim(p_rejection_reason) end, nullif(btrim(p_manager_note), ''), v_actor_id, v_actor_kind);

  return jsonb_build_object('invoice_number', v_first.invoice_number,
    'first_status', v_first_status, 'second_status', v_second_status,
    'first_countable', v_first_countable, 'second_countable', v_second_countable,
    'commercial_invoice_created', false);
end;
$body$;

revoke all on function public.review_duplicate_invoice_pair_v1(text,text,text,text,text,text) from public;
grant execute on function public.review_duplicate_invoice_pair_v1(text,text,text,text,text,text) to anon, authenticated;
