-- NOT APPLIED. Execute ONLY after the updated Delivery app is live and
-- write_delivery_reconciliation_chunk_v1 + finish_delivery_reconciliation_batch_v1
-- have passed a runtime smoke with authorized general-manager session.
-- service_role keeps direct write access for explicitly authorized operators.

begin;

do $guard$
begin
  if to_regprocedure('public.save_monthly_invoice_import_batch_v2(text,date,date,text,integer,integer)') is null
    or to_regprocedure('public.write_delivery_reconciliation_chunk_v1(text,uuid,text,jsonb)') is null
    or to_regprocedure('public.finish_delivery_reconciliation_batch_v1(text,uuid,integer)') is null
  then raise exception 'secure_reconciliation_functions_missing'; end if;
end;
$guard$;

revoke insert, update, delete on public.monthly_system_invoices
  from anon, authenticated;
revoke insert, update, delete on public.monthly_invoice_reconciliation_results
  from anon, authenticated;
revoke insert, update, delete on public.monthly_invoice_import_batches
  from anon, authenticated;

-- The old SECURITY DEFINER entry point deletes stale batches and has no
-- server-side general-manager authorization. Do not expose it after cutover.
revoke execute on function public.save_monthly_invoice_import_batch(
  date, date, text, integer, integer
) from public, anon, authenticated;

do $postcheck$
declare
  t text;
begin
  foreach t in array array[
    'monthly_system_invoices',
    'monthly_invoice_reconciliation_results',
    'monthly_invoice_import_batches'
  ] loop
    if has_table_privilege('anon', format('public.%I',t), 'INSERT')
      or has_table_privilege('anon', format('public.%I',t), 'UPDATE')
      or has_table_privilege('anon', format('public.%I',t), 'DELETE')
      or has_table_privilege('authenticated', format('public.%I',t), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I',t), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I',t), 'DELETE')
    then raise exception 'unsafe_write_grant_remains: %',t; end if;
    if not has_table_privilege('service_role',format('public.%I',t),'INSERT')
      or not has_table_privilege('service_role',format('public.%I',t),'UPDATE')
      or not has_table_privilege('service_role',format('public.%I',t),'DELETE')
    then raise exception 'service_role_access_missing: %',t; end if;
  end loop;

  if has_function_privilege('anon',
      'public.save_monthly_invoice_import_batch(date,date,text,integer,integer)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.save_monthly_invoice_import_batch(date,date,text,integer,integer)','EXECUTE')
  then raise exception 'unsafe_legacy_batch_rpc_access_remains'; end if;
end;
$postcheck$;

commit;
