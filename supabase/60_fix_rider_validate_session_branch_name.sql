-- Fix rider_validate_session after rider_accounts stopped exposing branch_name.
-- Resolve the canonical branch through branches, matching rider_pin_login.

create or replace function public.rider_validate_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session record;
  v_account record;
  v_rider record;
  v_att record;
  v_branch_id uuid;
  v_branch_name text;
begin
  if coalesce(length(trim(p_token)),0) < 20 then
    return jsonb_build_object('valid',false,'error','invalid_token');
  end if;

  select * into v_session
  from public.rider_sessions
  where session_token=p_token
    and coalesce(revoked,false)=false
    and revoked_at is null
    and expires_at>now()
  limit 1;

  if not found then
    return jsonb_build_object('valid',false,'error','session_expired_or_revoked');
  end if;

  select * into v_account
  from public.rider_accounts
  where id=v_session.account_id and status='active'
  limit 1;

  if not found then
    return jsonb_build_object('valid',false,'error','account_inactive');
  end if;

  select * into v_rider
  from public.riders
  where id=coalesce(v_session.rider_id,v_account.rider_id) and status='active'
  limit 1;

  if not found then
    return jsonb_build_object('valid',false,'error','rider_inactive');
  end if;

  update public.rider_sessions set last_seen=now() where id=v_session.id;

  select * into v_att
  from public.delivery_attendance
  where rider_id=v_rider.id
    and check_in_time is not null
    and check_out_time is null
  order by check_in_time desc nulls last,created_at desc
  limit 1;

  v_branch_id := coalesce(v_account.branch_id,v_rider.branch_id);

  select coalesce(b.display_name,b.name,v_rider.branch_name)
    into v_branch_name
  from public.branches b
  where b.id=v_branch_id
  limit 1;

  v_branch_name := coalesce(v_branch_name,v_rider.branch_name);

  return jsonb_build_object(
    'valid',true,
    'account_id',v_account.id,
    'rider_id',v_rider.id,
    'username',v_account.username,
    'rider_name',coalesce(v_rider.name,v_account.display_name,v_account.username),
    'branch_id',v_branch_id,
    'branch_name',v_branch_name,
    'role',coalesce(v_account.role,'rider'),
    'must_change_pin',coalesce(v_account.must_change_pin,false),
    'expires_at',v_session.expires_at,
    'open_attendance_id',v_att.id,
    'shift_date',v_att.shift_date,
    'check_in_time',v_att.check_in_time
  );
end
$$;

grant execute on function public.rider_validate_session(text) to anon,authenticated;
notify pgrst,'reload schema';
