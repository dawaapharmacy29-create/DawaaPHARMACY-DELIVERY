-- 59_rider_persistent_session_30_days.sql
-- جلسة دليفري ثابتة 30 يوم، أحدث Session فقط، تحقق واستدعاء Logout آمن.

begin;

alter table public.rider_sessions
  add column if not exists account_id uuid,
  add column if not exists expires_at timestamptz,
  add column if not exists last_seen timestamptz default now(),
  add column if not exists revoked boolean default false,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

alter table public.rider_sessions alter column expires_at set default (now() + interval '30 days');
update public.rider_sessions set expires_at=created_at+interval '30 days' where expires_at is null;

with ranked as(
  select id,row_number() over(partition by account_id order by created_at desc,id desc) rn
  from public.rider_sessions
  where account_id is not null and coalesce(revoked,false)=false and revoked_at is null and expires_at>now()
)
update public.rider_sessions s set revoked=true,revoked_at=now(),revoked_reason='superseded_session_cleanup'
from ranked r where s.id=r.id and r.rn>1;

create unique index if not exists uq_rider_sessions_one_active_per_account
on public.rider_sessions(account_id)
where account_id is not null and coalesce(revoked,false)=false and revoked_at is null;

create or replace function public.enforce_single_active_rider_session()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.account_id is not null then
    update public.rider_sessions set revoked=true,revoked_at=now(),revoked_reason='new_login_created'
    where account_id=new.account_id and coalesce(revoked,false)=false and revoked_at is null and id<>new.id;
  end if;
  new.revoked:=false;new.revoked_at:=null;new.revoked_reason:=null;
  new.expires_at:=now()+interval '30 days';new.last_seen:=now();
  return new;
end $$;

drop trigger if exists trg_single_active_rider_session on public.rider_sessions;
create trigger trg_single_active_rider_session before insert on public.rider_sessions
for each row execute function public.enforce_single_active_rider_session();

create or replace function public.rider_validate_session(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session record;v_account record;v_rider record;v_att record;
begin
  if coalesce(length(trim(p_token)),0)<20 then return jsonb_build_object('valid',false,'error','invalid_token'); end if;
  select * into v_session from public.rider_sessions where session_token=p_token and coalesce(revoked,false)=false and revoked_at is null and expires_at>now() limit 1;
  if not found then return jsonb_build_object('valid',false,'error','session_expired_or_revoked'); end if;
  select * into v_account from public.rider_accounts where id=v_session.account_id and status='active' limit 1;
  if not found then return jsonb_build_object('valid',false,'error','account_inactive'); end if;
  select * into v_rider from public.riders where id=coalesce(v_session.rider_id,v_account.rider_id) and status='active' limit 1;
  if not found then return jsonb_build_object('valid',false,'error','rider_inactive'); end if;
  update public.rider_sessions set last_seen=now() where id=v_session.id;
  select * into v_att from public.delivery_attendance where rider_id=v_rider.id and check_in_time is not null and check_out_time is null order by check_in_time desc nulls last,created_at desc limit 1;
  return jsonb_build_object('valid',true,'account_id',v_account.id,'rider_id',v_rider.id,'username',v_account.username,
    'rider_name',coalesce(v_rider.name,v_account.display_name,v_account.username),'branch_id',coalesce(v_account.branch_id,v_rider.branch_id),
    'branch_name',coalesce(v_account.branch_name,v_rider.branch_name),'role',coalesce(v_account.role,'rider'),'must_change_pin',coalesce(v_account.must_change_pin,false),
    'expires_at',v_session.expires_at,'open_attendance_id',v_att.id,'shift_date',v_att.shift_date,'check_in_time',v_att.check_in_time);
end $$;

create or replace function public.rider_logout(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_count int;
begin
  update public.rider_sessions set revoked=true,revoked_at=now(),revoked_reason='logout_this_device'
  where session_token=p_token and coalesce(revoked,false)=false;
  get diagnostics v_count=row_count;
  return jsonb_build_object('success',true,'revoked',v_count>0);
end $$;

grant execute on function public.rider_validate_session(text) to anon,authenticated;
grant execute on function public.rider_logout(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
