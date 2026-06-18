-- 58_delivery_order_edit_receipt_open_orders.sql
-- تعديل الأوردر قبل التسليم، تتبع الريسيت، والأوردرات المفتوحة. متوافق مع delivery_orders.id من نوع text.

begin;

alter table public.delivery_orders
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists receipt_image_url text,
  add column if not exists receipt_upload_status text default 'not_uploaded',
  add column if not exists receipt_uploaded_at timestamptz,
  add column if not exists receipt_upload_error text,
  add column if not exists edit_count integer default 0,
  add column if not exists last_edited_at timestamptz,
  add column if not exists last_edited_by uuid;

update public.delivery_orders set receipt_upload_status = case
  when nullif(receipt_image_url,'') is not null then 'uploaded' else 'not_uploaded' end
where receipt_upload_status is null;

create table if not exists public.delivery_order_edit_logs (
  id uuid primary key default gen_random_uuid(), order_id text not null, rider_id uuid,
  edited_by_account_id uuid, edited_by_name text, field_name text not null,
  old_value text, new_value text, edit_reason text, created_at timestamptz default now()
);
create index if not exists idx_delivery_order_edit_logs_order on public.delivery_order_edit_logs(order_id,created_at desc);
create index if not exists idx_delivery_order_edit_logs_rider on public.delivery_order_edit_logs(rider_id,created_at desc);

create or replace view public.rider_open_orders_view as
select o.id::text order_id,o.rider_id,coalesce(o.rider_name,r.name) rider_name,o.invoice_number,
  coalesce(o.customer_name_snapshot,o.customer_name) customer_name,
  coalesce(o.customer_code_snapshot,o.customer_code) customer_code,
  coalesce(o.customer_phone_snapshot,o.customer_phone) customer_phone,
  coalesce(o.customer_address_snapshot,o.customer_address) address,
  o.registered_at,greatest(0,floor(extract(epoch from(now()-o.registered_at))/60)::int) minutes_open,
  o.status,coalesce(o.receipt_upload_status,'not_uploaded') receipt_upload_status,o.attendance_id,o.work_date,o.needs_review
from public.delivery_orders o left join public.riders r on r.id=o.rider_id
where lower(coalesce(o.status,'registered')) not in('delivered','تم التسليم','failed','cancelled','canceled');

create or replace function public.rider_update_order_before_delivery(
  p_token text,p_order_id text,p_patch jsonb,p_edit_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session record;v_account record;v_old record;v_new record;v_old_json jsonb;v_new_json jsonb;v_field text;
begin
  select s.* into v_session from public.rider_sessions s where s.session_token=p_token and coalesce(s.revoked,false)=false and s.revoked_at is null and(s.expires_at is null or s.expires_at>now()) limit 1;
  if not found then return jsonb_build_object('success',false,'error','expired_session','message','انتهت الجلسة'); end if;
  select * into v_account from public.rider_accounts where id=v_session.account_id and status='active' limit 1;
  select * into v_old from public.delivery_orders where id::text=p_order_id and rider_id=coalesce(v_session.rider_id,v_account.rider_id) for update;
  if not found then return jsonb_build_object('success',false,'error','order_not_found','message','الأوردر غير موجود'); end if;
  if lower(coalesce(v_old.status,'')) in('delivered','تم التسليم') or v_old.delivered_at is not null then
    return jsonb_build_object('success',false,'error','already_delivered','message','لا يمكن تعديل أوردر تم تسليمه');
  end if;
  update public.delivery_orders set
    invoice_number=coalesce(nullif(p_patch->>'invoice_number',''),invoice_number),invoice_no=coalesce(nullif(p_patch->>'invoice_number',''),invoice_no),
    customer_name_snapshot=coalesce(p_patch->>'customer_name',customer_name_snapshot),customer_name=coalesce(p_patch->>'customer_name',customer_name),
    customer_code_snapshot=coalesce(p_patch->>'customer_code',customer_code_snapshot),customer_code=coalesce(p_patch->>'customer_code',customer_code),
    customer_phone_snapshot=coalesce(p_patch->>'customer_phone',customer_phone_snapshot),customer_phone=coalesce(p_patch->>'customer_phone',customer_phone),
    customer_address_snapshot=coalesce(p_patch->>'customer_address',customer_address_snapshot),customer_address=coalesce(p_patch->>'customer_address',customer_address),
    invoice_amount=case when p_patch?'invoice_amount' then coalesce((p_patch->>'invoice_amount')::numeric,0) else invoice_amount end,
    invoice_value=case when p_patch?'invoice_amount' then coalesce((p_patch->>'invoice_amount')::numeric,0) else invoice_value end,
    order_multiplier=case when p_patch?'order_multiplier' then greatest(1,coalesce((p_patch->>'order_multiplier')::numeric,1)) else order_multiplier end,
    is_multiplier_order=case when p_patch?'order_multiplier' then coalesce((p_patch->>'order_multiplier')::numeric,1)>=1.5 else is_multiplier_order end,
    multiplier_reason=coalesce(p_patch->>'multiplier_reason',multiplier_reason),notes=coalesce(p_patch->>'notes',notes),
    receipt_image_url=coalesce(p_patch->>'receipt_image_url',receipt_image_url),receipt_image_path=coalesce(p_patch->>'receipt_image_path',receipt_image_path),
    receipt_upload_status=coalesce(p_patch->>'receipt_upload_status',receipt_upload_status),
    receipt_uploaded_at=case when p_patch->>'receipt_upload_status'='uploaded' then now() else receipt_uploaded_at end,
    receipt_upload_error=case when p_patch?'receipt_upload_error' then nullif(p_patch->>'receipt_upload_error','') else receipt_upload_error end,
    edit_count=coalesce(edit_count,0)+1,last_edited_at=now(),last_edited_by=v_account.id,updated_at=now()
  where id::text=p_order_id returning * into v_new;
  v_old_json:=jsonb_build_object('invoice_number',v_old.invoice_number,'customer_name',v_old.customer_name_snapshot,'customer_code',v_old.customer_code_snapshot,'customer_phone',v_old.customer_phone_snapshot,'customer_address',v_old.customer_address_snapshot,'invoice_amount',v_old.invoice_amount,'order_multiplier',v_old.order_multiplier,'notes',v_old.notes,'receipt_image_url',v_old.receipt_image_url,'receipt_upload_status',v_old.receipt_upload_status);
  v_new_json:=jsonb_build_object('invoice_number',v_new.invoice_number,'customer_name',v_new.customer_name_snapshot,'customer_code',v_new.customer_code_snapshot,'customer_phone',v_new.customer_phone_snapshot,'customer_address',v_new.customer_address_snapshot,'invoice_amount',v_new.invoice_amount,'order_multiplier',v_new.order_multiplier,'notes',v_new.notes,'receipt_image_url',v_new.receipt_image_url,'receipt_upload_status',v_new.receipt_upload_status);
  for v_field in select jsonb_object_keys(v_new_json) loop
    if coalesce(v_old_json->>v_field,'') is distinct from coalesce(v_new_json->>v_field,'') then
      insert into public.delivery_order_edit_logs(order_id,rider_id,edited_by_account_id,edited_by_name,field_name,old_value,new_value,edit_reason)
      values(p_order_id,v_new.rider_id,v_account.id,coalesce(v_account.display_name,v_account.username),v_field,v_old_json->>v_field,v_new_json->>v_field,p_edit_reason);
    end if;
  end loop;
  return jsonb_build_object('success',true,'message','تم تعديل الأوردر بنجاح','order',to_jsonb(v_new));
end $$;

create or replace function public.rider_mark_order_delivered(p_token text,p_order_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session record;v_account record;v_order record;
begin
  select * into v_session from public.rider_sessions where session_token=p_token and coalesce(revoked,false)=false and revoked_at is null and(expires_at is null or expires_at>now()) limit 1;
  if not found then return jsonb_build_object('success',false,'message','انتهت الجلسة'); end if;
  select * into v_account from public.rider_accounts where id=v_session.account_id limit 1;
  update public.delivery_orders set status='delivered',delivered_at=now(),arrived_at=now(),dispatch_status='delivered',review_status='pending',reconciliation_status='pending_reconciliation',final_count_status='pending_reconciliation',is_countable=false,updated_at=now()
  where id::text=p_order_id and rider_id=coalesce(v_session.rider_id,v_account.rider_id) and lower(coalesce(status,'')) not in('delivered','تم التسليم') returning * into v_order;
  if not found then return jsonb_build_object('success',false,'message','الأوردر تم تسليمه بالفعل أو غير متاح'); end if;
  return jsonb_build_object('success',true,'message','تم تأكيد التسليم بنجاح','order',to_jsonb(v_order));
end $$;

create or replace function public.rider_mark_order_failed(p_token text,p_order_id text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session record;v_account record;v_order record;
begin
  select * into v_session from public.rider_sessions where session_token=p_token and coalesce(revoked,false)=false and revoked_at is null and(expires_at is null or expires_at>now()) limit 1;
  if not found then return jsonb_build_object('success',false,'message','انتهت الجلسة'); end if;
  select * into v_account from public.rider_accounts where id=v_session.account_id limit 1;
  update public.delivery_orders set status='failed',failed_at=now(),failed_reason=coalesce(nullif(trim(p_reason),''),'أخرى'),needs_review=true,review_status='failed',approval_status='rejected',bconnect_match_status='pending',final_count_status='excluded_failed',is_countable=false,count_exclusion_reason='failed_order',order_earning=0,updated_at=now()
  where id::text=p_order_id and rider_id=coalesce(v_session.rider_id,v_account.rider_id) and lower(coalesce(status,'')) not in('delivered','تم التسليم') returning * into v_order;
  if not found then return jsonb_build_object('success',false,'message','الأوردر غير متاح أو تم تسليمه'); end if;
  return jsonb_build_object('success',true,'message','تم تسجيل فشل التوصيل للمراجعة','order',to_jsonb(v_order));
end $$;

create or replace function public.rider_get_dashboard_data(p_token text,p_date_start date default null,p_date_end date default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_session record;v_account record;v_rider record;v_att record;v_today date:=((now() at time zone 'Africa/Cairo')::date);v_start date:=coalesce(p_date_start,v_today-31);v_end date:=coalesce(p_date_end,v_today);v_work_date date;v_orders_today jsonb;v_orders_cycle jsonb;v_trips_today jsonb;v_trips_cycle jsonb;v_latest_orders jsonb;v_open_count int;
begin
  select * into v_session from public.rider_sessions where session_token=p_token and coalesce(revoked,false)=false and revoked_at is null and(expires_at is null or expires_at>now()) limit 1;
  if not found then return jsonb_build_object('success',false,'error','expired_session'); end if;
  update public.rider_sessions set last_seen=now() where id=v_session.id;
  select * into v_account from public.rider_accounts where id=v_session.account_id limit 1;
  select * into v_rider from public.riders where id=coalesce(v_session.rider_id,v_account.rider_id) limit 1;
  select * into v_att from public.delivery_attendance where rider_id=v_rider.id and check_in_time is not null and check_out_time is null order by check_in_time desc nulls last,created_at desc limit 1;
  v_work_date:=coalesce(v_att.shift_date,v_today);
  select coalesce(jsonb_agg(to_jsonb(o) order by o.registered_at desc),'[]'::jsonb) into v_orders_today from public.delivery_orders o where o.rider_id=v_rider.id and(coalesce(o.attendance_id=v_att.id,false) or coalesce(o.work_date,o.delivery_date)=v_work_date);
  select coalesce(jsonb_agg(to_jsonb(o) order by coalesce(o.work_date,o.delivery_date) desc,o.registered_at desc),'[]'::jsonb) into v_orders_cycle from public.delivery_orders o where o.rider_id=v_rider.id and coalesce(o.work_date,o.delivery_date) between v_start and v_end;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.registered_at desc),'[]'::jsonb) into v_trips_today from public.internal_trips t where t.rider_id=v_rider.id and(coalesce(t.attendance_id=v_att.id,false) or coalesce(t.work_date,t.trip_date)=v_work_date);
  select coalesce(jsonb_agg(to_jsonb(t) order by coalesce(t.work_date,t.trip_date) desc,t.registered_at desc),'[]'::jsonb) into v_trips_cycle from public.internal_trips t where t.rider_id=v_rider.id and coalesce(t.work_date,t.trip_date) between v_start and v_end;
  select count(*)::int into v_open_count from public.delivery_orders o where o.rider_id=v_rider.id and lower(coalesce(o.status,'registered')) not in('delivered','تم التسليم','failed','cancelled','canceled');
  select coalesce(jsonb_agg(x.row_json),'[]'::jsonb) into v_latest_orders from(select to_jsonb(o) row_json from public.delivery_orders o where o.rider_id=v_rider.id order by o.registered_at desc limit 10)x;
  return jsonb_build_object('success',true,'session_valid',true,'rider',to_jsonb(v_rider),'attendance',case when v_att.id is null then null else jsonb_build_object('id',v_att.id,'rider_id',v_att.rider_id,'branch_id',v_att.branch_id,'work_date',v_att.shift_date,'shift_date',v_att.shift_date,'check_in_at',v_att.check_in_time,'check_out_at',v_att.check_out_time,'total_minutes',v_att.total_minutes,'status',v_att.status) end,'current_work_date',v_work_date,'shift_open',v_att.id is not null,'current_shift_orders',jsonb_array_length(v_orders_today),'current_shift_trips',jsonb_array_length(v_trips_today),'open_orders_count',v_open_count,'latest_orders',v_latest_orders,'orders',jsonb_build_object('today',v_orders_today,'cycle',v_orders_cycle),'trips',jsonb_build_object('today',v_trips_today,'cycle',v_trips_cycle),'notifications','[]'::jsonb,'cycle_start',v_start,'cycle_end',v_end,'session_expires_at',v_session.expires_at);
end $$;

alter table public.delivery_order_edit_logs enable row level security;
drop policy if exists delivery_order_edit_logs_authenticated_read on public.delivery_order_edit_logs;
create policy delivery_order_edit_logs_authenticated_read on public.delivery_order_edit_logs for select to authenticated using(true);

grant select on public.rider_open_orders_view to anon,authenticated;
grant execute on function public.rider_update_order_before_delivery(text,text,jsonb,text) to anon,authenticated;
grant execute on function public.rider_mark_order_delivered(text,text) to anon,authenticated;
grant execute on function public.rider_mark_order_failed(text,text,text) to anon,authenticated;
grant execute on function public.rider_get_dashboard_data(text,date,date) to anon,authenticated;

notify pgrst,'reload schema';
commit;
