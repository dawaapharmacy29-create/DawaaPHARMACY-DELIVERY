-- Regression fix: rider_accounts no longer exposes branch_name.
-- Resolve branch identity from the canonical rider/branches tables instead.

do $migration$
declare
  v_def text;
  v_old text := 'coalesce(nullif(v_account.branch_name,''''),nullif(v_rider.branch_name,''''),' || chr(13) || chr(10) || '              (select b.name from public.branches b where b.id=coalesce(v_account.branch_id,v_rider.branch_id) limit 1))';
  v_new text := 'coalesce(nullif(v_rider.branch_name,''''),' || chr(13) || chr(10) || '              (select b.name from public.branches b where b.id=coalesce(v_account.branch_id,v_rider.branch_id) limit 1))';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rider_create_order'
  limit 1;

  if v_def is null then
    raise exception 'rider_create_order not found';
  end if;

  if position('v_account.branch_name' in v_def)=0 then
    return;
  end if;

  if position(v_old in v_def)=0 then
    raise exception 'Expected rider_create_order branch block not found; safe patch aborted';
  end if;

  execute replace(v_def, v_old, v_new);
end
$migration$;

notify pgrst,'reload schema';
