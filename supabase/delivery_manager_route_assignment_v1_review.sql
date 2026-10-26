-- REVIEW ONLY. Install and smoke-test before enabling the protected frontend.
-- Does not edit invoice identity, amounts, earnings, or historical count status.

create or replace function public.delivery_manager_assign_route_v1(
  p_token text, p_order_ids text[], p_rider_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  v_manager_branch uuid;
  v_role text;
  v_actor text;
  v_rider public.riders%rowtype;
  v_order public.delivery_orders%rowtype;
  v_id text;
  v_count integer := 0;
begin
  if coalesce(length(p_token),0) < 20
    or p_rider_id is null or p_order_ids is null
    or cardinality(p_order_ids) = 0 or cardinality(p_order_ids) > 100
    or coalesce(length(btrim(p_reason)),0) < 5
    or length(p_reason) > 500 then
    raise exception 'invalid_route_assignment' using errcode='22023';
  end if;

  select a.branch_id, a.role, a.display_name
    into v_manager_branch, v_role, v_actor
  from public.rider_sessions s
  join public.rider_accounts a on a.id=s.account_id
  where s.session_token=p_token and s.expires_at > now()
    and s.revoked_at is null and coalesce(s.revoked,false)=false
    and a.status='active' and a.role in ('general_manager','branch_manager')
  limit 1;
  if v_role is null then
    raise exception 'manager_session_required' using errcode='42501';
  end if;

  select * into v_rider from public.riders
    where id=p_rider_id and status='active';
  if v_rider.id is null or v_rider.branch_id is null then
    raise exception 'active_rider_branch_required' using errcode='22023';
  end if;
  if v_role='branch_manager' and
    (v_manager_branch is null or v_manager_branch is distinct from v_rider.branch_id) then
    raise exception 'manager_branch_mismatch' using errcode='42501';
  end if;
  -- Do not report success for a partially de-duplicated client selection.
  if (select count(distinct btrim(x)) from unnest(p_order_ids) as x)
      <> cardinality(p_order_ids) then
    raise exception 'duplicate_order_ids_in_route' using errcode='22023';
  end if;

  -- Consistent lock order prevents opposing simultaneous reassignment deadlocks.
  for v_id in
    select distinct btrim(x)
    from unnest(p_order_ids) as x
    order by 1
  loop
    if coalesce(v_id,'')='' then
      raise exception 'invalid_order_id' using errcode='22023';
    end if;
    select * into v_order from public.delivery_orders
      where id=v_id for update;
    if v_order.id is null or v_order.deleted_at is not null
      or v_order.branch_id is distinct from v_rider.branch_id
      or coalesce(v_order.status,'') not in ('registered','needs_review') then
      raise exception 'route_order_not_eligible' using errcode='42501';
    end if;
    update public.delivery_orders set
      rider_id=v_rider.id, rider_name=v_rider.name,
      dispatch_status='ready',
      dispatch_notes=btrim(p_reason), updated_at=now()
    where id=v_id;
    v_count := v_count + 1;
  end loop;

  return pg_catalog.jsonb_build_object('success',true,
    'assigned_count',v_count,'rider_id',v_rider.id,
    'actor',v_actor);
end;
$body$;

revoke all on function public.delivery_manager_assign_route_v1(text,text[],uuid,text)
  from public, anon, authenticated;
grant execute on function public.delivery_manager_assign_route_v1(text,text[],uuid,text)
  to anon, authenticated;
