-- REVIEW ONLY: deploy and smoke-test before enabling the final direct-write cutover.
-- The pickup transition is owned by the active rider session, not client-supplied rider data.
create or replace function public.rider_mark_order_picked_up_v1(p_token text, p_order_id text)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  v_rider_id uuid;
  v_rider_name text;
  v_order public.delivery_orders%rowtype;
begin
  if coalesce(length(btrim(p_token)), 0) < 20 or coalesce(btrim(p_order_id), '') = '' then
    raise exception 'rider_session_required' using errcode = '42501';
  end if;
  select a.rider_id, r.name into v_rider_id, v_rider_name
    from public.rider_sessions s
    join public.rider_accounts a on a.id = s.account_id
    join public.riders r on r.id = a.rider_id
    where s.session_token = p_token and coalesce(s.revoked, false) = false
      and s.revoked_at is null and s.expires_at > now()
      and a.status = 'active' and a.role = 'rider' and r.status = 'active'
    limit 1;
  if v_rider_id is null then
    raise exception 'active_rider_session_required' using errcode = '42501';
  end if;
  select * into v_order from public.delivery_orders
    where id = p_order_id and rider_id = v_rider_id and deleted_at is null
    for update;
  if not found then
    raise exception 'order_not_owned_by_rider' using errcode = '42501';
  end if;
  if v_order.picked_up_at is not null then
    return pg_catalog.jsonb_build_object('success', true, 'replayed', true, 'order', to_jsonb(v_order));
  end if;
  if lower(coalesce(v_order.status, '')) in ('delivered', 'failed', 'cancelled', 'canceled', 'تم التسليم')
    or v_order.delivered_at is not null then
    raise exception 'order_not_open_for_pickup' using errcode = '22023';
  end if;
  update public.delivery_orders
    set picked_up_at = now(), picked_up_by = v_rider_id,
        picked_up_by_name = v_rider_name, dispatch_status = 'picked_up', updated_at = now()
    where id = v_order.id returning * into v_order;
  return pg_catalog.jsonb_build_object('success', true, 'replayed', false, 'order', to_jsonb(v_order));
end;
$body$;
revoke all on function public.rider_mark_order_picked_up_v1(text,text) from public;
grant execute on function public.rider_mark_order_picked_up_v1(text,text) to anon, authenticated;
