-- REVIEW ONLY; NOT APPLIED. Deploy with identity registry and UPDATE guard.
-- Replace the legacy unauthenticated branch_manager_update_order_invoice RPC
-- and migrate every caller before turning on the identity UPDATE trigger.
-- Corrections have one order identity, one branch, and one transaction.

create or replace function public.branch_manager_update_order_invoice_v2(
  p_token text, p_order_id text, p_new_invoice_number text, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  v_actor uuid;
  v_actor_name text;
  v_role text;
  v_manager_branch uuid;
  v_order public.delivery_orders%rowtype;
  v_old_key text;
  v_new_key text;
begin
  if coalesce(length(btrim(p_reason)),0) < 5 or length(p_reason) > 500
    or coalesce(length(btrim(p_new_invoice_number)),0) = 0
    or length(p_new_invoice_number) > 100 or p_order_id is null then
    raise exception 'invalid_invoice_correction' using errcode = '22023';
  end if;

  -- The browser-supplied name, role and branch are never authority.
  if coalesce(length(p_token),0) >= 20 then
    select a.id, a.display_name, a.role, a.branch_id
      into v_actor, v_actor_name, v_role, v_manager_branch
    from public.rider_sessions s join public.rider_accounts a on a.id=s.account_id
    where s.session_token=p_token and s.expires_at > now()
      and s.revoked_at is null and coalesce(s.revoked,false)=false
      and a.status='active' and a.role in ('general_manager','branch_manager')
    limit 1;
  end if;
  if v_actor is null and auth.uid() is not null then
    select u.id, 'مدير النظام', 'admin', null::uuid
      into v_actor, v_actor_name, v_role, v_manager_branch
    from public.user_profiles u
    where u.id=auth.uid() and u.role='admin' and u.status='active';
  end if;
  if v_actor is null then
    raise exception 'manager_session_required' using errcode = '42501';
  end if;

  select * into v_order from public.delivery_orders
    where id=p_order_id and deleted_at is null for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode='22023';
  end if;
  if v_role='branch_manager' and
    (v_manager_branch is null or v_manager_branch is distinct from v_order.branch_id) then
    raise exception 'manager_branch_mismatch' using errcode='42501';
  end if;
  v_old_key := dawaa_private.delivery_invoice_key_v1(
    coalesce(nullif(btrim(v_order.invoice_number),''),v_order.invoice_no));
  v_new_key := dawaa_private.delivery_invoice_key_v1(p_new_invoice_number);
  if coalesce(v_new_key,'')='' or v_order.branch_id is null then
    raise exception 'invalid_invoice_identity' using errcode='22023';
  end if;

  -- Serialize the old and new identities in a stable order to avoid deadlocks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_order.branch_id::text || ':' ||
      least(coalesce(v_old_key,''),v_new_key),0));
  if v_old_key is distinct from v_new_key then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_order.branch_id::text || ':' ||
        greatest(coalesce(v_old_key,''),v_new_key),0));
  end if;

  if exists (select 1 from public.delivery_orders o
      where o.id<>v_order.id and o.deleted_at is null
        and o.branch_id=v_order.branch_id
        and dawaa_private.delivery_invoice_key_v1(
          coalesce(nullif(btrim(o.invoice_number),''),o.invoice_no))=v_new_key)
    or exists (select 1 from dawaa_private.delivery_invoice_identities_v1 i
      where i.branch_id=v_order.branch_id and i.invoice_key=v_new_key
        and i.canonical_order_id is distinct from v_order.id)
  then raise exception 'invoice_already_registered_use_review' using errcode='23505'; end if;

  -- The UPDATE guard accepts only the exact order, branch, and new identity
  -- set by this manager-authorized transaction. Never disable the trigger.
  perform pg_catalog.set_config('dawaa.invoice_correction_identity_v1',
    v_order.id || ':' || v_order.branch_id::text || ':' || v_new_key, true);
  update public.delivery_orders set invoice_number=btrim(p_new_invoice_number),
    invoice_no=btrim(p_new_invoice_number),
    invoice_number_original=coalesce(invoice_number_original,invoice_number,invoice_no),
    invoice_edit_count=coalesce(invoice_edit_count,0)+1,
    invoice_edited_at=now(), invoice_edited_by_name=coalesce(v_actor_name,'مدير'),
    invoice_edit_reason=btrim(p_reason), is_countable=false,
    bconnect_match_status='pending', final_count_status='pending_reconciliation',
    needs_review=true, review_status='invoice_edited_by_branch_manager',updated_at=now()
  where id=v_order.id;
  perform pg_catalog.set_config('dawaa.invoice_correction_identity_v1','',true);

  if v_old_key is distinct from v_new_key then
    -- Preserve any historical visit events on the OLD key; do not move them.
    update dawaa_private.delivery_invoice_identities_v1
      set canonical_order_id=null,review_state='unresolved',reviewed_at=null
    where branch_id=v_order.branch_id and invoice_key=v_old_key
      and canonical_order_id=v_order.id;
    insert into dawaa_private.delivery_invoice_identities_v1
      (branch_id,invoice_key,canonical_order_id,review_state,reviewed_at)
    values (v_order.branch_id,v_new_key,v_order.id,'verified',now())
    on conflict (branch_id,invoice_key) do update
      set canonical_order_id=excluded.canonical_order_id,
        review_state='verified',reviewed_at=now();
  end if;

  -- Audit and order mutation commit or roll back TOGETHER.
  insert into public.delivery_order_invoice_edit_history
    (order_id,old_invoice_number,new_invoice_number,edited_by,edited_by_name,
     reason,branch_id,branch_name,rider_id,rider_name)
  values (v_order.id::uuid,coalesce(v_order.invoice_number,v_order.invoice_no),
    btrim(p_new_invoice_number),v_actor,coalesce(v_actor_name,'مدير'),
    btrim(p_reason),v_order.branch_id,v_order.branch_name,v_order.rider_id,v_order.rider_name);

  return pg_catalog.jsonb_build_object('success',true,'order_id',v_order.id,
    'old_invoice',coalesce(v_order.invoice_number,v_order.invoice_no),
    'new_invoice',btrim(p_new_invoice_number),'reconciliation_required',true);
end;
$body$;

revoke all on function public.branch_manager_update_order_invoice_v2(text,text,text,text) from public;
grant execute on function public.branch_manager_update_order_invoice_v2(text,text,text,text) to anon,authenticated;

-- Cutover requirement: revoke execute on LEGACY four-argument RPC only after
-- BranchManagerDashboard and all other callers use V2. Until then, it remains
-- an authorization bypass and the production protection is NOT complete.
