-- 57_delivery_stability_and_lite_dashboard.sql
-- ثبات جلسة الدليفري والشيفت وتسجيل الأوردر بدون تعطيل التشغيل.

begin;

alter table public.rider_sessions
  add column if not exists account_id uuid,
  add column if not exists expires_at timestamptz default (now() + interval '30 days'),
  add column if not exists last_seen timestamptz default now(),
  add column if not exists revoked boolean default false,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

alter table public.delivery_orders
  add column if not exists attendance_id uuid,
  add column if not exists work_date date,
  add column if not exists review_status text default 'pending',
  add column if not exists reconciliation_notes text,
  add column if not exists security_flags jsonb default '{}'::jsonb;

alter table public.internal_trips
  add column if not exists attendance_id uuid,
  add column if not exists work_date date;

-- تنظيف الجلسات الفعالة المكررة والإبقاء على الأحدث فقط لكل حساب.
with ranked as (
  select id, row_number() over (partition by account_id order by created_at desc, id desc) as rn
  from public.rider_sessions
  where account_id is not null and coalesce(revoked, false) = false and revoked_at is null
)
update public.rider_sessions s
set revoked = true, revoked_at = now(), revoked_reason = 'superseded_by_latest_session'
from ranked r where s.id = r.id and r.rn > 1;

update public.rider_sessions
set expires_at = greatest(coalesce(expires_at, now()), created_at + interval '30 days')
where coalesce(revoked, false) = false and revoked_at is null;

create unique index if not exists uq_rider_sessions_one_active_per_account
on public.rider_sessions(account_id)
where account_id is not null and coalesce(revoked, false) = false and revoked_at is null;

create or replace function public.enforce_single_active_rider_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.account_id is not null then
    update public.rider_sessions
    set revoked = true, revoked_at = now(), revoked_reason = 'new_login_created'
    where account_id = new.account_id
      and coalesce(revoked, false) = false
      and revoked_at is null
      and id <> new.id;
  end if;
  new.revoked := false;
  new.revoked_at := null;
  new.expires_at := coalesce(new.expires_at, now() + interval '30 days');
  if new.expires_at < now() + interval '29 days' then new.expires_at := now() + interval '30 days'; end if;
  new.last_seen := now();
  return new;
end $$;

drop trigger if exists trg_single_active_rider_session on public.rider_sessions;
create trigger trg_single_active_rider_session
before insert on public.rider_sessions
for each row execute function public.enforce_single_active_rider_session();

create or replace function public.rider_check_in_out(
  p_token text, p_action text, p_lat double precision default null,
  p_lng double precision default null, p_accuracy_m int default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_session record; v_account record; v_rider record; v_att public.delivery_attendance%rowtype;
  v_now timestamptz := now(); v_shift_date date := ((now() at time zone 'Africa/Cairo')::date);
begin
  select * into v_session from public.rider_sessions
  where session_token = p_token and coalesce(revoked,false) = false and revoked_at is null
    and (expires_at is null or expires_at > v_now) limit 1;
  if not found then return jsonb_build_object('success',false,'error','expired_session','message','انتهت الجلسة، سجل الدخول مرة أخرى'); end if;
  update public.rider_sessions set last_seen = v_now where id = v_session.id;
  select * into v_account from public.rider_accounts where id = v_session.account_id and status = 'active' limit 1;
  if not found then return jsonb_build_object('success',false,'error','inactive_account','message','الحساب غير نشط'); end if;
  select * into v_rider from public.riders where id = coalesce(v_session.rider_id,v_account.rider_id) limit 1;

  select * into v_att from public.delivery_attendance
  where rider_id = coalesce(v_session.rider_id,v_account.rider_id)
    and check_in_time is not null and check_out_time is null
  order by check_in_time desc nulls last, created_at desc limit 1;

  if p_action in ('check_in','checkin') then
    if found then
      return jsonb_build_object('success',true,'action','already_open','message','الشيفت مفتوح بالفعل.','attendance_id',v_att.id,'work_date',v_att.shift_date,
        'attendance',jsonb_build_object('id',v_att.id,'rider_id',v_att.rider_id,'branch_id',v_att.branch_id,'work_date',v_att.shift_date,'shift_date',v_att.shift_date,'check_in_at',v_att.check_in_time,'check_out_at',v_att.check_out_time,'check_in_time',v_att.check_in_time,'check_out_time',v_att.check_out_time,'total_minutes',v_att.total_minutes,'status',v_att.status));
    end if;
    insert into public.delivery_attendance(rider_id,account_id,rider_name,branch_id,shift_date,check_in_time,check_in_lat,check_in_lng,check_in_accuracy,total_minutes,status,needs_review,created_at,updated_at)
    values(coalesce(v_session.rider_id,v_account.rider_id),v_account.id,coalesce(v_rider.name,v_account.display_name,v_account.username),coalesce(v_account.branch_id,v_rider.branch_id),v_shift_date,v_now,p_lat,p_lng,p_accuracy_m,0,'present',false,v_now,v_now)
    returning * into v_att;
    return jsonb_build_object('success',true,'action','check_in','message','تم بدء الشيفت','attendance_id',v_att.id,'work_date',v_att.shift_date,
      'attendance',jsonb_build_object('id',v_att.id,'rider_id',v_att.rider_id,'branch_id',v_att.branch_id,'work_date',v_att.shift_date,'shift_date',v_att.shift_date,'check_in_at',v_att.check_in_time,'check_out_at',null,'check_in_time',v_att.check_in_time,'check_out_time',null,'total_minutes',0,'status',v_att.status));
  elsif p_action in ('check_out','checkout') then
    if not found then return jsonb_build_object('success',false,'error','no_open_shift','message','لا يوجد شيفت مفتوح حاليًا.'); end if;
    update public.delivery_attendance set check_out_time=v_now,check_out_lat=p_lat,check_out_lng=p_lng,check_out_accuracy=p_accuracy_m,
      total_minutes=greatest(0,floor(extract(epoch from (v_now-check_in_time))/60)::int),status='completed',updated_at=v_now
    where id=v_att.id and rider_id=coalesce(v_session.rider_id,v_account.rider_id) returning * into v_att;
    return jsonb_build_object('success',true,'action','check_out','message','تم إنهاء الشيفت','attendance_id',v_att.id,'work_date',v_att.shift_date,'total_minutes',v_att.total_minutes,
      'attendance',jsonb_build_object('id',v_att.id,'rider_id',v_att.rider_id,'branch_id',v_att.branch_id,'work_date',v_att.shift_date,'shift_date',v_att.shift_date,'check_in_at',v_att.check_in_time,'check_out_at',v_att.check_out_time,'check_in_time',v_att.check_in_time,'check_out_time',v_att.check_out_time,'total_minutes',v_att.total_minutes,'status',v_att.status));
  end if;
  return jsonb_build_object('success',false,'error','invalid_action','message','إجراء غير صحيح');
end $$;

create or replace function public.rider_create_order(
  p_token text, p_customer_id uuid default null, p_customer_code text default null,
  p_customer_name text default null, p_customer_phone text default null, p_customer_address text default null,
  p_invoice_number text default null, p_invoice_amount numeric default 0, p_order_multiplier numeric default 1,
  p_notes text default null, p_gps_lat double precision default null, p_gps_lng double precision default null,
  p_gps_accuracy_m int default null, p_receipt_image_path text default null,
  p_receipt_image_url text default null, p_receipt_ocr_json jsonb default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_session record; v_account record; v_rider record; v_att record;
  v_order_id text; v_duplicate_id text; v_today date := ((now() at time zone 'Africa/Cairo')::date);
  v_work_date date; v_missing_shift boolean := false; v_needs_review boolean := false; v_review_reason text := null; v_review_status text := 'pending';
begin
  if coalesce(trim(p_invoice_number),'')='' then return jsonb_build_object('success',false,'error','invoice_required','message','رقم الفاتورة مطلوب'); end if;
  select * into v_session from public.rider_sessions
  where session_token=p_token and coalesce(revoked,false)=false and revoked_at is null and (expires_at is null or expires_at>now()) limit 1;
  if not found then return jsonb_build_object('success',false,'error','expired_session','message','انتهت الجلسة، سجل الدخول مرة أخرى'); end if;
  update public.rider_sessions set last_seen=now() where id=v_session.id;
  select * into v_account from public.rider_accounts where id=v_session.account_id and status='active' limit 1;
  if not found then return jsonb_build_object('success',false,'error','inactive_account','message','الحساب غير نشط'); end if;
  select * into v_rider from public.riders where id=coalesce(v_session.rider_id,v_account.rider_id) limit 1;

  select * into v_att from public.delivery_attendance
  where rider_id=coalesce(v_session.rider_id,v_account.rider_id) and check_in_time is not null and check_out_time is null
  order by check_in_time desc nulls last,created_at desc limit 1;
  if found then v_work_date:=coalesce(v_att.shift_date,v_today); else v_work_date:=v_today; v_missing_shift:=true; end if;

  select id into v_duplicate_id from public.delivery_orders
  where invoice_number=trim(p_invoice_number) and branch_id=coalesce(v_account.branch_id,v_rider.branch_id)
    and coalesce(work_date,delivery_date)=v_work_date limit 1;

  if v_missing_shift then v_needs_review:=true;v_review_reason:='missing_shift';v_review_status:='missing_shift';
  elsif v_duplicate_id is not null then v_needs_review:=true;v_review_reason:='duplicate_invoice';
  elsif p_gps_accuracy_m is not null and p_gps_accuracy_m>100 then v_needs_review:=true;v_review_reason:='gps_accuracy_weak';
  elsif coalesce(p_order_multiplier,1)>=1.5 then v_needs_review:=true;v_review_reason:='multiplier_order'; end if;

  insert into public.delivery_orders(
    rider_id,rider_name,branch_id,customer_id,delivery_date,work_date,attendance_id,invoice_number,invoice_no,invoice_amount,invoice_value,
    customer_code,customer_name,customer_phone,customer_address,customer_code_snapshot,customer_name_snapshot,customer_phone_snapshot,customer_address_snapshot,
    status,registered_at,prepared_at,ready_at,dispatched_at,dispatch_status,dispatch_by,dispatch_by_name,picked_up_at,picked_up_by,picked_up_by_name,
    notes,source,created_source,is_duplicate_invoice,duplicate_warning,duplicate_review_status,needs_review,review_reason,review_status,approval_status,
    order_multiplier,is_multiplier_order,order_rate,order_earning,bconnect_match_status,reconciliation_status,is_countable,final_count_status,
    gps_lat,gps_lng,gps_accuracy_m,receipt_image_path,receipt_image_url,receipt_ocr_json,receipt_review_status,reconciliation_notes,security_flags,updated_at
  ) values(
    coalesce(v_session.rider_id,v_account.rider_id),coalesce(v_rider.name,v_account.display_name,v_account.username),coalesce(v_account.branch_id,v_rider.branch_id),p_customer_id,
    v_today,v_work_date,case when v_missing_shift then null else v_att.id end,trim(p_invoice_number),trim(p_invoice_number),coalesce(p_invoice_amount,0),coalesce(p_invoice_amount,0),
    p_customer_code,coalesce(nullif(p_customer_name,''),'عميل غير مسجل'),p_customer_phone,p_customer_address,p_customer_code,coalesce(nullif(p_customer_name,''),'عميل غير مسجل'),p_customer_phone,p_customer_address,
    'registered',now(),now(),now(),now(),'dispatched',coalesce(v_session.rider_id,v_account.rider_id),coalesce(v_rider.name,v_account.display_name),now(),coalesce(v_session.rider_id,v_account.rider_id),coalesce(v_rider.name,v_account.display_name),
    p_notes,'rider_app','secure_rpc_stable_v6',v_duplicate_id is not null,v_duplicate_id is not null,case when v_duplicate_id is not null then 'pending' else 'not_required' end,
    v_needs_review,v_review_reason,v_review_status,'pending',coalesce(p_order_multiplier,1),coalesce(p_order_multiplier,1)>=1.5,0,0,'pending','pending_reconciliation',not v_missing_shift,'pending_reconciliation',
    p_gps_lat,p_gps_lng,p_gps_accuracy_m,p_receipt_image_path,p_receipt_image_url,p_receipt_ocr_json,case when coalesce(p_receipt_image_path,'')<>'' then 'pending_admin_review' else 'not_uploaded' end,
    case when v_missing_shift then 'تم تسجيل الأوردر بدون شيفت مفتوح - يحتاج مراجعة إدارية' else null end,
    jsonb_build_object('created_via','secure_rpc_stable_v6','missing_shift',v_missing_shift,'attendance_id',case when v_missing_shift then null else v_att.id end,'session_id',v_session.id),now()
  ) returning id into v_order_id;
  return jsonb_build_object('success',true,'order_id',v_order_id,'attendance_id',case when v_missing_shift then null else v_att.id end,'work_date',v_work_date,
    'missing_shift',v_missing_shift,'is_duplicate',v_duplicate_id is not null,'needs_review',v_needs_review,'review_reason',v_review_reason,
    'message',case when v_missing_shift then 'تم تسجيل الأوردر، وسيتم مراجعته إداريًا لأن الشيفت غير ظاهر.' else 'تم تسجيل الأوردر بنجاح' end);
end $$;

create or replace function public.rider_get_dashboard_data(p_token text,p_date_start date default null,p_date_end date default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_session record;v_account record;v_rider record;v_att record;v_today date:=((now() at time zone 'Africa/Cairo')::date);
  v_start date:=coalesce(p_date_start,v_today-31);v_end date:=coalesce(p_date_end,v_today);v_work_date date;
  v_orders_today jsonb;v_orders_cycle jsonb;v_trips_today jsonb;v_trips_cycle jsonb;
begin
  select * into v_session from public.rider_sessions where session_token=p_token and coalesce(revoked,false)=false and revoked_at is null and (expires_at is null or expires_at>now()) limit 1;
  if not found then return jsonb_build_object('success',false,'error','expired_session'); end if;
  update public.rider_sessions set last_seen=now() where id=v_session.id;
  select * into v_account from public.rider_accounts where id=v_session.account_id limit 1;
  select * into v_rider from public.riders where id=coalesce(v_session.rider_id,v_account.rider_id) limit 1;
  select * into v_att from public.delivery_attendance where rider_id=coalesce(v_session.rider_id,v_account.rider_id) and check_in_time is not null and check_out_time is null order by check_in_time desc nulls last,created_at desc limit 1;
  v_work_date:=coalesce(v_att.shift_date,v_today);
  select coalesce(jsonb_agg(to_jsonb(o) order by o.registered_at desc),'[]'::jsonb) into v_orders_today from public.delivery_orders o where o.rider_id=v_rider.id and (coalesce(o.attendance_id=v_att.id,false) or coalesce(o.work_date,o.delivery_date)=v_work_date);
  select coalesce(jsonb_agg(to_jsonb(o) order by coalesce(o.work_date,o.delivery_date) desc,o.registered_at desc),'[]'::jsonb) into v_orders_cycle from public.delivery_orders o where o.rider_id=v_rider.id and coalesce(o.work_date,o.delivery_date) between v_start and v_end;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.registered_at desc),'[]'::jsonb) into v_trips_today from public.internal_trips t where t.rider_id=v_rider.id and (coalesce(t.attendance_id=v_att.id,false) or coalesce(t.work_date,t.trip_date)=v_work_date);
  select coalesce(jsonb_agg(to_jsonb(t) order by coalesce(t.work_date,t.trip_date) desc,t.registered_at desc),'[]'::jsonb) into v_trips_cycle from public.internal_trips t where t.rider_id=v_rider.id and coalesce(t.work_date,t.trip_date) between v_start and v_end;
  return jsonb_build_object('success',true,'session_valid',true,'rider',to_jsonb(v_rider),'attendance',case when v_att.id is null then null else jsonb_build_object('id',v_att.id,'rider_id',v_att.rider_id,'branch_id',v_att.branch_id,'work_date',v_att.shift_date,'shift_date',v_att.shift_date,'check_in_at',v_att.check_in_time,'check_out_at',v_att.check_out_time,'total_minutes',v_att.total_minutes,'status',v_att.status) end,
    'current_work_date',v_work_date,'shift_open',v_att.id is not null,'current_shift_orders',jsonb_array_length(v_orders_today),'current_shift_trips',jsonb_array_length(v_trips_today),
    'orders',jsonb_build_object('today',v_orders_today,'cycle',v_orders_cycle),'trips',jsonb_build_object('today',v_trips_today,'cycle',v_trips_cycle),'notifications','[]'::jsonb,'cycle_start',v_start,'cycle_end',v_end,'session_expires_at',v_session.expires_at);
end $$;

create or replace view public.rider_live_status_view as
select a.id as account_id,a.username,coalesce(a.rider_id,s_latest.rider_id) as rider_id,coalesce(r.name,a.display_name,a.username) as rider_name,
  coalesce(a.branch_id,r.branch_id) as branch_id,b.name as branch_name,coalesce(sc.active_sessions_count,0)::int as active_sessions_count,
  s_latest.created_at as latest_session_at,case when coalesce(sc.active_sessions_count,0)>0 then 'logged_in' else 'logged_out' end as login_status,
  att.id as open_attendance_id,att.shift_date,att.check_in_time,case when att.id is not null then 'shift_open' when coalesce(sc.active_sessions_count,0)>0 then 'no_open_shift' else 'offline' end as shift_status,
  coalesce(oc.orders_count,0)::int as current_shift_orders,coalesce(tc.trips_count,0)::int as current_shift_trips,lo.last_order_at
from public.rider_accounts a
left join public.riders r on r.id=a.rider_id
left join public.branches b on b.id=coalesce(a.branch_id,r.branch_id)
left join lateral(select count(*) as active_sessions_count from public.rider_sessions s where s.account_id=a.id and coalesce(s.revoked,false)=false and s.revoked_at is null and (s.expires_at is null or s.expires_at>now())) sc on true
left join lateral(select s.* from public.rider_sessions s where s.account_id=a.id order by s.created_at desc limit 1) s_latest on true
left join lateral(select d.* from public.delivery_attendance d where d.rider_id=coalesce(a.rider_id,s_latest.rider_id) and d.check_in_time is not null and d.check_out_time is null order by d.check_in_time desc,d.created_at desc limit 1) att on true
left join lateral(select count(*) as orders_count from public.delivery_orders o where o.rider_id=coalesce(a.rider_id,s_latest.rider_id) and (o.attendance_id=att.id or (att.id is null and coalesce(o.work_date,o.delivery_date)=current_date))) oc on true
left join lateral(select count(*) as trips_count from public.internal_trips t where t.rider_id=coalesce(a.rider_id,s_latest.rider_id) and (t.attendance_id=att.id or (att.id is null and coalesce(t.work_date,t.trip_date)=current_date))) tc on true
left join lateral(select max(o.registered_at) as last_order_at from public.delivery_orders o where o.rider_id=coalesce(a.rider_id,s_latest.rider_id)) lo on true
where a.role='rider' and a.status='active';

create or replace view public.delivery_orders_missing_shift_view as
select o.*,coalesce(r.name,o.rider_name) as resolved_rider_name,b.name as resolved_branch_name
from public.delivery_orders o left join public.riders r on r.id=o.rider_id left join public.branches b on b.id=o.branch_id
where o.attendance_id is null or coalesce(o.needs_review,false)=true or o.review_status='missing_shift';

create or replace view public.rider_shift_daily_summary as
select a.id attendance_id,a.rider_id,coalesce(a.rider_name,r.name) rider_name,a.branch_id,coalesce(a.branch_name,b.name) branch_name,a.shift_date work_date,a.check_in_time,a.check_out_time,
  coalesce(a.total_minutes,case when a.check_in_time is not null then floor(extract(epoch from (coalesce(a.check_out_time,now())-a.check_in_time))/60)::int else 0 end) total_minutes,
  round(coalesce(a.total_minutes,case when a.check_in_time is not null then floor(extract(epoch from (coalesce(a.check_out_time,now())-a.check_in_time))/60)::int else 0 end)::numeric/60,2) total_hours,
  count(distinct o.id)::bigint total_orders,count(distinct o.id) filter(where coalesce(o.order_multiplier,1)<1.5)::bigint orders_1x,count(distinct o.id) filter(where coalesce(o.order_multiplier,1)>=1.5)::bigint orders_1_5x,
  count(distinct o.id) filter(where coalesce(o.is_duplicate_invoice,false) or coalesce(o.duplicate_warning,false))::bigint duplicate_orders,
  count(distinct o.id) filter(where o.status='failed' or o.failed_at is not null)::bigint failed_orders,
  count(distinct o.id) filter(where coalesce(o.needs_review,false))::bigint review_orders,
  count(distinct o.id) filter(where coalesce(o.is_countable,true)=false or coalesce(o.not_countable,false) or coalesce(o.excluded_from_incentive,false))::bigint uncounted_orders,
  count(distinct t.id)::bigint total_trips
from public.delivery_attendance a left join public.riders r on r.id=a.rider_id left join public.branches b on b.id=a.branch_id
left join public.delivery_orders o on o.attendance_id=a.id or (o.attendance_id is null and o.rider_id=a.rider_id and o.work_date=a.shift_date)
left join public.internal_trips t on t.attendance_id=a.id or (t.attendance_id is null and t.rider_id=a.rider_id and t.work_date=a.shift_date)
group by a.id,a.rider_id,coalesce(a.rider_name,r.name),a.branch_id,coalesce(a.branch_name,b.name),a.shift_date,a.check_in_time,a.check_out_time,a.total_minutes;

create or replace function public.admin_open_rider_shift(p_token text,p_rider_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_admin record;v_account record;v_rider record;v_att record;
begin
  select a.* into v_admin from public.rider_sessions s join public.rider_accounts a on a.id=s.account_id where s.session_token=p_token and coalesce(s.revoked,false)=false and s.revoked_at is null and a.role in('admin','shift_manager') limit 1;
  if not found then return jsonb_build_object('success',false,'message','غير مصرح'); end if;
  select * into v_att from public.delivery_attendance where rider_id=p_rider_id and check_in_time is not null and check_out_time is null order by check_in_time desc limit 1;
  if found then return jsonb_build_object('success',true,'message','الشيفت مفتوح بالفعل.','attendance_id',v_att.id); end if;
  select * into v_rider from public.riders where id=p_rider_id limit 1;select * into v_account from public.rider_accounts where rider_id=p_rider_id limit 1;
  insert into public.delivery_attendance(rider_id,account_id,rider_name,branch_id,shift_date,check_in_time,status,needs_review,review_reason)
  values(p_rider_id,v_account.id,v_rider.name,v_rider.branch_id,((now() at time zone 'Africa/Cairo')::date),now(),'manual_review',true,'فتح إداري بواسطة '||v_admin.username) returning * into v_att;
  return jsonb_build_object('success',true,'message','تم فتح الشيفت يدويًا','attendance_id',v_att.id);
end $$;

create or replace function public.admin_close_old_rider_sessions(p_token text,p_rider_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_admin record;v_count int;
begin
  select a.* into v_admin from public.rider_sessions s join public.rider_accounts a on a.id=s.account_id where s.session_token=p_token and coalesce(s.revoked,false)=false and s.revoked_at is null and a.role in('admin','shift_manager') limit 1;
  if not found then return jsonb_build_object('success',false,'message','غير مصرح'); end if;
  with ranked as(select s.id,row_number() over(partition by s.account_id order by s.created_at desc) rn from public.rider_sessions s where coalesce(s.revoked,false)=false and s.revoked_at is null and (p_rider_id is null or s.rider_id=p_rider_id))
  update public.rider_sessions s set revoked=true,revoked_at=now(),revoked_reason='admin_cleanup' from ranked r where s.id=r.id and r.rn>1;
  get diagnostics v_count=row_count;return jsonb_build_object('success',true,'closed_sessions',v_count,'message','تم إغلاق الجلسات القديمة');
end $$;

grant execute on function public.rider_check_in_out(text,text,double precision,double precision,int) to anon,authenticated;
grant execute on function public.rider_create_order(text,uuid,text,text,text,text,text,numeric,numeric,text,double precision,double precision,int,text,text,jsonb) to anon,authenticated;
grant execute on function public.rider_get_dashboard_data(text,date,date) to anon,authenticated;
grant execute on function public.admin_open_rider_shift(text,uuid) to anon,authenticated;
grant execute on function public.admin_close_old_rider_sessions(text,uuid) to anon,authenticated;
grant select on public.rider_live_status_view,public.delivery_orders_missing_shift_view,public.rider_shift_daily_summary to anon,authenticated;

notify pgrst,'reload schema';
commit;
