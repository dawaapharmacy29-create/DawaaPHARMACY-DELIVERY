-- REVIEW ONLY. Deploy and smoke-test before protected frontend activation.
-- Branch-scoped review actions. Never change invoice identity, amount or paid earnings.
create or replace function public.delivery_branch_manager_order_action_v1(
  p_token text, p_order_id text, p_action text, p_reason text,
  p_target_rider_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  v_role text;
  v_branch_id uuid;
  v_actor text;
  v_order public.delivery_orders%rowtype;
  v_target public.riders%rowtype;
begin
  if coalesce(length(btrim(p_token)),0) < 20
    or coalesce(btrim(p_order_id),'') = ''
    or p_action is null or p_action not in ('reassign','exclude','order_to_trip')
    or coalesce(length(btrim(p_reason)),0) < 5 or length(p_reason) > 500 then
    raise exception 'invalid_manager_order_action' using errcode='22023';
  end if;
  select a.role, a.branch_id, a.display_name into v_role, v_branch_id, v_actor
    from public.rider_sessions s
    join public.rider_accounts a on a.id=s.account_id
    where s.session_token=p_token and s.expires_at > now()
      and s.revoked_at is null and coalesce(s.revoked,false)=false
      and a.status='active' and a.role in ('general_manager','branch_manager')
    limit 1;
  if v_role is null then
    raise exception 'manager_session_required' using errcode='42501';
  end if;
  select * into v_order from public.delivery_orders
    where id=p_order_id and deleted_at is null for update;
  if v_order.id is null or v_order.branch_id is null
    or (v_role='branch_manager' and
        (v_branch_id is null or v_branch_id is distinct from v_order.branch_id)) then
    raise exception 'manager_order_branch_mismatch' using errcode='42501';
  end if;
  if lower(coalesce(v_order.status,'')) in
      ('delivered','failed','cancelled','canceled','تم التسليم')
    or v_order.delivered_at is not null then
    raise exception 'closed_order_requires_separate_review' using errcode='22023';
  end if;
  if p_action='reassign' then
    if p_target_rider_id is null or v_order.picked_up_at is not null then
      raise exception 'order_not_eligible_for_reassign' using errcode='22023'; end if;
    select * into v_target from public.riders
      where id=p_target_rider_id and status='active'
        and branch_id=v_order.branch_id;
    if v_target.id is null then
      raise exception 'target_rider_branch_mismatch' using errcode='42501'; end if;
    update public.delivery_orders set
      rider_id=v_target.id, rider_name=v_target.name,
      reassigned_from_rider_id=v_order.rider_id,
      reassigned_to_rider_id=v_target.id,
      reassignment_reason=btrim(p_reason), reassigned_by_name=v_actor,
      reassigned_at=now(), needs_review=true,
      review_status='branch_manager_reassigned', updated_at=now()
      where id=v_order.id;
  elsif p_action='exclude' then
    if v_order.picked_up_at is not null then
      raise exception 'picked_order_requires_separate_review' using errcode='22023'; end if;
    update public.delivery_orders set deleted_at=now(),
      deleted_by_name=v_actor, deletion_reason=btrim(p_reason),
      is_countable=false, final_count_status='excluded_by_branch_manager',
      review_status='deleted_by_branch_manager', updated_at=now()
      where id=v_order.id;
  else
    if v_order.picked_up_at is not null then
      raise exception 'picked_order_requires_separate_review' using errcode='22023'; end if;
    update public.delivery_orders set
      review_status='converted_to_trip_request', approval_status='pending',
      review_reason=btrim(p_reason), is_countable=false, updated_at=now()
      where id=v_order.id;
  end if;
  return pg_catalog.jsonb_build_object('success',true,'order_id',v_order.id,
    'action',p_action,'actor',v_actor);
end;
$body$;
revoke all on function public.delivery_branch_manager_order_action_v1(text,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.delivery_branch_manager_order_action_v1(text,text,text,text,uuid)
  to anon, authenticated;
