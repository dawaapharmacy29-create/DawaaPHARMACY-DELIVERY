-- Reviewed against the two live Delivery function definitions on 2026-10-26.
-- The existing RPC signature, identity/session checks, and every other
-- business rule must remain unchanged. Only the extra note/doctor requirement
-- is relaxed; a duplicate still requires a recorded reason and human review.
begin;

do $guarded_patch$
declare
  v_rpc text;
  v_trigger text;
  v_rpc_note_condition constant text := 'or length(coalesce(trim(p_duplicate_note),'''')) < 5';
  v_trigger_note_condition constant text := 'or coalesce(trim(new.duplicate_note), '''') = ''''';
  v_trigger_doctor_condition constant text := 'or coalesce(trim(new.preparing_doctor_name), '''') = ''''';
begin
  select pg_get_functiondef(p.oid) into v_rpc
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='rider_create_order' and p.prokind='f';
  select pg_get_functiondef(p.oid) into v_trigger
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='delivery_orders_require_duplicate_invoice_reason' and p.prokind='f';

  if v_rpc is null or position(v_rpc_note_condition in v_rpc) = 0
    or v_trigger is null
    or position(v_trigger_note_condition in v_trigger) = 0
    or position(v_trigger_doctor_condition in v_trigger) = 0
  then raise exception 'duplicate_reason_production_contract_changed'; end if;

  v_rpc := replace(v_rpc, v_rpc_note_condition, '');
  v_trigger := replace(v_trigger, v_trigger_note_condition, '');
  v_trigger := replace(v_trigger, v_trigger_doctor_condition, '');
  v_trigger := replace(v_trigger,
    'لا يمكن تسجيل نفس الفاتورة في نفس الفرع ونفس اليوم بدون سبب التكرار وملاحظة واضحة واسم الدكتور',
    'لا يمكن تسجيل نفس الفاتورة في نفس الفرع ونفس اليوم بدون تحديد سبب التكرار');

  execute v_rpc;
  execute v_trigger;
end;
$guarded_patch$;

commit;
