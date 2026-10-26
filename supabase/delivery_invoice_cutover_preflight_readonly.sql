-- READ ONLY. Re-run immediately before a coordinated Delivery cutover.
-- Never delete, auto-merge or auto-credit historical rows from this report.
-- A historical duplicated key is an unresolved identity, not proof of fraud.
with orders as (
  select id, branch_id, status, source,
    public.normalize_delivery_reconciliation_invoice(
      coalesce(nullif(btrim(invoice_number), ''), invoice_no)) as legacy_invoice_key,
    public.normalize_delivery_reconciliation_invoice(pg_catalog.translate(
      coalesce(nullif(btrim(invoice_number), ''), invoice_no),
      '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')) as invoice_key,
    public.normalize_delivery_reconciliation_invoice(pg_catalog.translate(
      invoice_number, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')) as number_key,
    public.normalize_delivery_reconciliation_invoice(pg_catalog.translate(
      invoice_no, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')) as alternate_key
  from public.delivery_orders where deleted_at is null
), groups as (
  select branch_id, invoice_key, count(*) as claims
  from orders
  where branch_id is not null and coalesce(invoice_key, '') <> ''
  group by branch_id, invoice_key
)
select
  (select count(*) from orders) as active_orders,
  (select count(*) from orders
    where branch_id is null or coalesce(invoice_key, '') = '') as rows_missing_identity,
  (select count(*) from orders
    where coalesce(number_key, '') <> '' and coalesce(alternate_key, '') <> ''
      and number_key <> alternate_key) as rows_with_conflicting_invoice_columns,
  (select count(*) from groups where claims > 1) as historical_duplicate_keys,
  (select count(*) from (
    select branch_id, invoice_key
    from orders
    where branch_id is not null and coalesce(invoice_key, '') <> ''
    group by branch_id, invoice_key
    having count(*) > 1
      and count(*) filter (where coalesce(legacy_invoice_key, '') = '') > 0
  ) arabic_digit_collisions) as duplicate_keys_involving_legacy_unreadable_digits,
  (select coalesce(max(claims), 0) from groups) as largest_claim_group,
  to_regclass('dawaa_private.delivery_invoice_identities_v1')::text as identity_registry,
  to_regclass('dawaa_private.delivery_invoice_visit_events_v1')::text as visit_events,
  to_regprocedure('public.rider_register_repeated_visit_v1(text,text,text,text,text)')::text as visit_rpc,
  to_regprocedure('public.branch_manager_update_order_invoice_v2(text,text,text,text)')::text as protected_manager_correction_rpc,
  has_table_privilege('anon', 'public.delivery_orders', 'INSERT') as anon_can_insert_orders,
  has_table_privilege('anon', 'public.delivery_orders', 'UPDATE') as anon_can_update_orders,
  has_table_privilege('authenticated', 'public.delivery_orders', 'INSERT') as authenticated_can_insert_orders,
  has_table_privilege('authenticated', 'public.delivery_orders', 'UPDATE') as authenticated_can_update_orders,
  (select t.tgenabled from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.delivery_orders'::regclass
      and t.tgname = 'trg_delivery_invoice_guard_before_insert_v1'
      and not t.tgisinternal) as insert_guard_trigger_state,
  (select t.tgenabled from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.delivery_orders'::regclass
      and t.tgname = 'trg_delivery_invoice_guard_before_update_v1'
      and not t.tgisinternal) as update_guard_trigger_state,
  case when to_regprocedure('public.branch_manager_update_order_invoice(uuid,text,text,text)') is not null
    then has_function_privilege('anon',
      to_regprocedure('public.branch_manager_update_order_invoice(uuid,text,text,text)'), 'EXECUTE')
  end as legacy_manager_invoice_correction_callable_by_anon;

-- Release is blocked until:
-- * New and historical orders are classified; no automatic selection of the
--   canonical commercial owner for disputed historical keys.
-- * Arabic-digit rows that collide with ASCII-digit invoice keys remain
--   separate historical visit claims pending manager review.
-- * Existing admin order corrections have an audited alternative to direct
--   UPDATE of invoice number or branch.
-- * legacy_manager_invoice_correction_callable_by_anon must be FALSE after
--   every caller migrates to the token-bound V2 RPC.
-- * The original-order insert guard and repeated-visit RPC are tested against
--   the same branch+invoice lock and live compatibility permissions.
-- * Compensation/reporting reads from visit events only after separate
--   manager approval, without multiplying commercial invoice amount.
-- * An authorized manager smoke and concurrent-rider DB test both pass.
