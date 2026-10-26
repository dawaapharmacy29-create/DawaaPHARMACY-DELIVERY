-- REVIEW ONLY; NOT APPLIED. Requires the identity + visit event tables and
-- dawaa_private.assert_delivery_reconciliation_manager_v1(text).
-- A visit approval is NOT a commercial invoice approval or financial credit.
-- Compensation reports must separately opt into verified visit approvals.

create table if not exists dawaa_private.delivery_visit_review_audit_v1 (
  id bigint generated always as identity primary key,
  event_id bigint not null references dawaa_private.delivery_invoice_visit_events_v1(id),
  invoice_identity_id bigint not null references dawaa_private.delivery_invoice_identities_v1(id),
  previous_status text not null,
  decided_status text not null check (decided_status in ('approved','rejected')),
  actor_id uuid not null,
  evidence_note text not null check (length(btrim(evidence_note)) >= 10),
  rejection_reason text,
  recorded_at timestamptz not null default now()
);
revoke all on dawaa_private.delivery_visit_review_audit_v1 from public, anon, authenticated;

create or replace function public.review_delivery_visit_v1(
  p_token text,
  p_event_id bigint,
  p_decision text,
  p_evidence_note text,
  p_rejection_reason text default null
) returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  v_event dawaa_private.delivery_invoice_visit_events_v1%rowtype;
  v_actor uuid;
begin
  perform dawaa_private.assert_delivery_reconciliation_manager_v1(p_token);
  if p_event_id is null or p_decision not in ('approved','rejected')
    or p_decision is null or coalesce(length(btrim(p_evidence_note)),0) < 10
    or length(p_evidence_note) > 2000
    or (p_decision = 'rejected' and coalesce(length(btrim(p_rejection_reason)),0) < 5)
    or length(coalesce(p_rejection_reason,'')) > 500
  then raise exception 'invalid_visit_review' using errcode = '22023'; end if;

  select * into v_event from dawaa_private.delivery_invoice_visit_events_v1
  where id = p_event_id for update;
  if v_event.id is null then raise exception 'visit_not_found' using errcode = '22023'; end if;
  if v_event.visit_credit_status <> 'pending' then
    raise exception 'visit_review_already_final' using errcode = '40001'; end if;

  -- Actor resolved on the server from an authenticated admin or manager
  -- session. Never trust a client-supplied reviewer ID.
  v_actor := auth.uid();
  if v_actor is null then
    select a.id into v_actor from public.rider_sessions s
      join public.rider_accounts a on a.id = s.account_id
    where s.session_token = p_token and s.revoked_at is null
      and coalesce(s.revoked,false) = false and s.expires_at > now()
      and a.role = 'general_manager' and a.status = 'active'
    limit 1;
  end if;
  if v_actor is null then raise exception 'manager_identity_missing' using errcode = '42501'; end if;

  update dawaa_private.delivery_invoice_visit_events_v1
  set visit_credit_status = p_decision, reviewed_by = v_actor,
    reviewed_at = now(), review_evidence = btrim(p_evidence_note),
    rejection_reason = case when p_decision = 'rejected' then btrim(p_rejection_reason) end
  where id = v_event.id;

  insert into dawaa_private.delivery_visit_review_audit_v1
    (event_id, invoice_identity_id, previous_status, decided_status,
     actor_id, evidence_note, rejection_reason)
  values (v_event.id, v_event.invoice_identity_id, v_event.visit_credit_status,
    p_decision, v_actor, btrim(p_evidence_note),
    case when p_decision = 'rejected' then btrim(p_rejection_reason) end);

  return pg_catalog.jsonb_build_object('success',true,'visit_id',v_event.id,
    'visit_credit_status',p_decision,'commercial_invoice_created',false,
    'commercial_amount_credited',false);
end;
$body$;

revoke all on function public.review_delivery_visit_v1(text,bigint,text,text,text) from public;
grant execute on function public.review_delivery_visit_v1(text,bigint,text,text,text) to anon,authenticated;

-- Manager queue: includes only minimum information needed for a decision.
create or replace function public.list_delivery_visit_reviews_v1(
  p_token text,
  p_limit integer default 100
) returns table (
  visit_id bigint, branch_id uuid, invoice_key text, rider_id uuid,
  visit_reason text, visit_note text, visit_status text, occurred_at timestamptz
) language plpgsql security definer set search_path = '' as $body$
begin
  perform dawaa_private.assert_delivery_reconciliation_manager_v1(p_token);
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'invalid_page_limit' using errcode = '22023'; end if;
  return query select e.id, i.branch_id, i.invoice_key, e.rider_id,
    e.reason, e.note, e.visit_credit_status, e.occurred_at
  from dawaa_private.delivery_invoice_visit_events_v1 e
    join dawaa_private.delivery_invoice_identities_v1 i on i.id = e.invoice_identity_id
  where e.visit_credit_status = 'pending'
  order by e.occurred_at asc, e.id asc limit p_limit;
end;
$body$;
revoke all on function public.list_delivery_visit_reviews_v1(text,integer) from public;
grant execute on function public.list_delivery_visit_reviews_v1(text,integer) to anon,authenticated;

-- Financial eligibility ledger: manager can inspect approved/pending/rejected
-- physical visits by rider and Cairo calendar work period. This RPC intentionally
-- returns NO money or commercial invoice amount: rate/payout are separate policy.
create or replace function public.list_delivery_rider_visit_credit_v1(
  p_token text, p_rider_id uuid, p_from date, p_to date
) returns table (
  visit_id bigint, invoice_key text, branch_id uuid, visit_status text,
  reason text, evidence_note text, occurred_at timestamptz
) language plpgsql security definer set search_path = '' as $body$
begin
  perform dawaa_private.assert_delivery_reconciliation_manager_v1(p_token);
  if p_rider_id is null or p_from is null or p_to is null
    or p_to < p_from or p_to > p_from + 93
  then raise exception 'invalid_visit_credit_period' using errcode = '22023'; end if;
  return query select e.id, i.invoice_key, i.branch_id,
    e.visit_credit_status, e.reason, e.review_evidence, e.occurred_at
  from dawaa_private.delivery_invoice_visit_events_v1 e
    join dawaa_private.delivery_invoice_identities_v1 i on i.id = e.invoice_identity_id
  where e.rider_id = p_rider_id
    and (e.occurred_at at time zone 'Africa/Cairo')::date between p_from and p_to
  order by e.occurred_at, e.id;
end;
$body$;
revoke all on function public.list_delivery_rider_visit_credit_v1(text,uuid,date,date) from public;
grant execute on function public.list_delivery_rider_visit_credit_v1(text,uuid,date,date) to anon,authenticated;
