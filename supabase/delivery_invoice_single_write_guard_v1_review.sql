-- REVIEW ONLY; DO NOT APPLY TO PRODUCTION.
-- Requires delivery_invoice_identity_registry_v1_review.sql and the existing
-- public.normalize_delivery_reconciliation_invoice(text) function.
-- Release blocker: old duplicate UI/RPC must route to the visit-event gateway
-- before this guard is enabled; otherwise those old writes will be rejected.
-- This protects INSERTs from all clients (including old RPCs and direct REST
-- writes), with no calendar-day condition and no rider in the identity key.

create or replace function dawaa_private.guard_delivery_invoice_insert_v1()
returns trigger language plpgsql security definer set search_path = '' as $body$
declare
  v_key text;
begin
  -- Both legacy invoice columns are read by different screens. Never permit
  -- them to identify two different commercial invoices on the same row.
  if coalesce(btrim(new.invoice_number), '') <> ''
    and coalesce(btrim(new.invoice_no), '') <> ''
    and dawaa_private.delivery_invoice_key_v1(new.invoice_number)
      is distinct from dawaa_private.delivery_invoice_key_v1(new.invoice_no)
  then
    raise exception 'invoice_number_columns_disagree' using errcode = '23514';
  end if;
  v_key := dawaa_private.delivery_invoice_key_v1(
    coalesce(nullif(btrim(new.invoice_number), ''), new.invoice_no));
  if new.branch_id is null or coalesce(v_key, '') = '' then
    raise exception 'invoice_branch_and_number_required' using errcode = '23514';
  end if;

  -- Same lock as public.rider_register_repeated_visit_v1. The uniqueness
  -- decision stays valid even for simultaneous requests from two riders.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.branch_id::text || ':' || v_key, 0));

  if exists (
    select 1 from dawaa_private.delivery_invoice_identities_v1 i
    where i.branch_id = new.branch_id and i.invoice_key = v_key
  ) or exists (
    select 1 from public.delivery_orders old
    where old.deleted_at is null and old.branch_id = new.branch_id
      and dawaa_private.delivery_invoice_key_v1(
        coalesce(nullif(btrim(old.invoice_number), ''), old.invoice_no)) = v_key
  ) then
    raise exception 'invoice_already_registered_use_repeated_visit_gateway'
      using errcode = '23505';
  end if;
  return new;
end;
$body$;

create or replace function dawaa_private.record_delivery_invoice_identity_v1()
returns trigger language plpgsql security definer set search_path = '' as $body$
declare
  v_key text;
begin
  v_key := dawaa_private.delivery_invoice_key_v1(
    coalesce(nullif(btrim(new.invoice_number), ''), new.invoice_no));
  insert into dawaa_private.delivery_invoice_identities_v1
    (branch_id, invoice_key, canonical_order_id, review_state)
  values (new.branch_id, v_key, new.id, 'verified');
  return new;
end;
$body$;

create or replace function dawaa_private.guard_delivery_invoice_identity_update_v1()
returns trigger language plpgsql security definer set search_path = '' as $body$
declare
  v_old_key text;
  v_new_key text;
begin
  if coalesce(btrim(new.invoice_number), '') <> ''
    and coalesce(btrim(new.invoice_no), '') <> ''
    and dawaa_private.delivery_invoice_key_v1(new.invoice_number)
      is distinct from dawaa_private.delivery_invoice_key_v1(new.invoice_no)
  then
    raise exception 'invoice_number_columns_disagree' using errcode = '23514';
  end if;
  v_old_key := dawaa_private.delivery_invoice_key_v1(
    coalesce(nullif(btrim(old.invoice_number), ''), old.invoice_no));
  v_new_key := dawaa_private.delivery_invoice_key_v1(
    coalesce(nullif(btrim(new.invoice_number), ''), new.invoice_no));
  if old.branch_id is not distinct from new.branch_id
    and pg_catalog.current_setting('dawaa.invoice_correction_identity_v1', true)
      = new.id || ':' || new.branch_id::text || ':' || v_new_key then
    return new;
  end if;
  if old.branch_id is distinct from new.branch_id
    or v_old_key is distinct from v_new_key then
    -- Identity corrections require a separate manager-authorized, audited
    -- transaction which updates both the order and identity registry.
    raise exception 'invoice_identity_change_requires_manager_review'
      using errcode = '42501';
  end if;
  if dawaa_private.delivery_invoice_key_v1(old.invoice_number)
       is distinct from dawaa_private.delivery_invoice_key_v1(new.invoice_number)
    or dawaa_private.delivery_invoice_key_v1(old.invoice_no)
       is distinct from dawaa_private.delivery_invoice_key_v1(new.invoice_no)
  then
    -- Even if the COALESCE-derived key is unchanged, a secondary invoice
    -- field must not be repurposed to reference another invoice.
    raise exception 'invoice_identity_change_requires_manager_review'
      using errcode = '42501';
  end if;
  return new;
end;
$body$;

revoke all on function dawaa_private.guard_delivery_invoice_insert_v1()
  from public, anon, authenticated;
revoke all on function dawaa_private.record_delivery_invoice_identity_v1()
  from public, anon, authenticated;
revoke all on function dawaa_private.guard_delivery_invoice_identity_update_v1()
  from public, anon, authenticated;

-- Do not enable these triggers until historical keys, all order-edit paths,
-- the visit-event UI, reporting and compensation are checked together.
-- Existing admin invoice correction screens currently update the table
-- directly; switching this UPDATE guard on without a reviewed correction RPC
-- will intentionally block those corrections.
-- create trigger trg_delivery_invoice_guard_before_insert_v1
--   before insert on public.delivery_orders for each row
--   execute function dawaa_private.guard_delivery_invoice_insert_v1();
-- create trigger trg_delivery_invoice_identity_after_insert_v1
--   after insert on public.delivery_orders for each row
--   execute function dawaa_private.record_delivery_invoice_identity_v1();
-- create trigger trg_delivery_invoice_guard_before_update_v1
--   before update of branch_id, invoice_number, invoice_no on public.delivery_orders
--   for each row
--   execute function dawaa_private.guard_delivery_invoice_identity_update_v1();
