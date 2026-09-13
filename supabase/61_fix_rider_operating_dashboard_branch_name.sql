-- Fix rider_get_operating_dashboard_fast after rider_accounts stopped exposing branch_name.
-- Branch display data is resolved canonically through branches using branch_id.

create or replace function public.rider_get_operating_dashboard_fast(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_session record;
  v_account record;
  v_rider record;
  v_att record;
  v_branch jsonb;
  v_today date := ((now() at time zone 'Africa/Cairo')::date);
  v_work_date date;
  v_orders jsonb := '[]'::jsonb;
  v_trips jsonb := '[]'::jsonb;
begin
  if coalesce(length(trim(p_token)),0) < 20 then
    return jsonb_build_object('success',false,'error','invalid_token');
  end if;

  select id,account_id,rider_id,expires_at into v_session
  from public.rider_sessions
  where session_token=p_token
    and coalesce(revoked,false)=false
    and revoked_at is null
    and (expires_at is null or expires_at>now())
  limit 1;
  if not found then return jsonb_build_object('success',false,'error','expired_session'); end if;

  update public.rider_sessions set last_seen=now() where id=v_session.id;

  select id,rider_id,display_name,username,role,branch_id,status into v_account
  from public.rider_accounts
  where id=v_session.account_id and status='active'
  limit 1;
  if not found then return jsonb_build_object('success',false,'error','inactive_account'); end if;

  select * into v_rider
  from public.riders
  where id=coalesce(v_session.rider_id,v_account.rider_id) and status='active'
  limit 1;
  if not found then return jsonb_build_object('success',false,'error','rider_inactive'); end if;

  select * into v_att
  from public.delivery_attendance
  where rider_id=v_rider.id
    and check_in_time is not null
    and check_out_time is null
    and check_in_time >= now()-interval '16 hours'
  order by check_in_time desc
  limit 1;

  v_work_date := coalesce(v_att.shift_date,v_today);

  select to_jsonb(b) into v_branch
  from public.branches b
  where b.id=coalesce(v_account.branch_id,v_rider.branch_id)
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.registered_at desc),'[]'::jsonb)
  into v_orders
  from public.delivery_orders o
  where o.rider_id=v_rider.id
    and o.deleted_at is null
    and o.work_date in (v_work_date,v_today);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.registered_at desc),'[]'::jsonb)
  into v_trips
  from public.internal_trips t
  where t.rider_id=v_rider.id
    and t.work_date in (v_work_date,v_today);

  return jsonb_build_object(
    'success',true,
    'rider',to_jsonb(v_rider),
    'branch',v_branch,
    'attendance',case when v_att.id is null then null else jsonb_build_object(
      'id',v_att.id,
      'rider_id',v_att.rider_id,
      'branch_id',v_att.branch_id,
      'work_date',v_att.shift_date,
      'shift_date',v_att.shift_date,
      'check_in_at',v_att.check_in_time,
      'check_out_at',v_att.check_out_time,
      'check_in_time',v_att.check_in_time,
      'check_out_time',v_att.check_out_time,
      'status',v_att.status
    ) end,
    'current_work_date',v_work_date,
    'orders',v_orders,
    'trips',v_trips,
    'session_expires_at',v_session.expires_at
  );
end;
$function$;

grant execute on function public.rider_get_operating_dashboard_fast(text) to anon,authenticated;
notify pgrst,'reload schema';
