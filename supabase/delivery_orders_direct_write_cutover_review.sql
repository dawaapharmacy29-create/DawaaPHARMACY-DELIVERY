-- REVIEW ONLY. NEVER APPLY BY ITSELF OR BEFORE ALL CLIENT WRITE PATHS
-- HAVE MIGRATED TO SERVER-VALIDATED RPCs AND BEEN SMOKE TESTED.
-- Existing clients still write directly to delivery_orders: dispatch, rider,
-- reconciliation, administration. Cutting grants prematurely breaks them.
-- This is the final atomic permission cutover, not the feature install step.

begin;

do $preflight$
begin
  if to_regclass('dawaa_private.delivery_invoice_identities_v1') is null
    or to_regclass('dawaa_private.delivery_invoice_visit_events_v1') is null
    or to_regprocedure('public.rider_register_repeated_visit_v1(text,text,text,text,text)') is null
    or to_regprocedure('public.branch_manager_update_order_invoice_v2(text,text,text,text)') is null
  then
    raise exception 'delivery_invoice_cutover_gateways_missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid='public.delivery_orders'::regclass
      and tgname='trg_delivery_invoice_guard_before_insert_v1'
      and tgenabled in ('O','A') and not tgisinternal
  ) or not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid='public.delivery_orders'::regclass
      and tgname='trg_delivery_invoice_guard_before_update_v1'
      and tgenabled in ('O','A') and not tgisinternal
  ) then
    raise exception 'delivery_invoice_guard_triggers_not_active';
  end if;
end;
$preflight$;

-- Retain SELECT access for existing screens, but remove the public ALL
-- policy. PostgreSQL grants are separately revoked below.
drop policy if exists delivery_orders_public_all on public.delivery_orders;
create policy delivery_orders_read_compatibility_v1
  on public.delivery_orders for select to anon, authenticated using (true);

revoke insert, update, delete on public.delivery_orders from anon, authenticated;
revoke execute on function public.branch_manager_update_order_invoice(
  uuid, text, text, text) from public, anon, authenticated;

do $postcheck$
begin
  if has_table_privilege('anon','public.delivery_orders','INSERT')
    or has_table_privilege('anon','public.delivery_orders','UPDATE')
    or has_table_privilege('anon','public.delivery_orders','DELETE')
    or has_table_privilege('authenticated','public.delivery_orders','INSERT')
    or has_table_privilege('authenticated','public.delivery_orders','UPDATE')
    or has_table_privilege('authenticated','public.delivery_orders','DELETE')
    or has_function_privilege('anon',
      'public.branch_manager_update_order_invoice(uuid,text,text,text)', 'EXECUTE')
  then
    raise exception 'delivery_direct_write_exposure_remains';
  end if;
  if not has_table_privilege('service_role','public.delivery_orders','INSERT')
    or not has_table_privilege('service_role','public.delivery_orders','UPDATE')
  then
    raise exception 'delivery_service_role_write_access_missing';
  end if;
end;
$postcheck$;

commit;
