-- Keep Rider V3 startup fast: one server-validated payload with only operational fields.
create or replace function public.rider_get_operating_dashboard_fast(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
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

  select id,account_id,rider_id,expires_at,last_seen into v_session
  from public.rider_sessions
  where session_token=p_token
    and coalesce(revoked,false)=false
    and revoked_at is null
    and (expires_at is null or expires_at>now())
  limit 1;
  if not found then return jsonb_build_object('success',false,'error','expired_session'); end if;

  if v_session.last_seen is null or v_session.last_seen < now()-interval '2 minutes' then
    update public.rider_sessions set last_seen=now() where id=v_session.id;
  end if;

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

  select jsonb_build_object('id',b.id,'name',b.name,'display_name',b.display_name,'code',b.code)
  into v_branch
  from public.branches b
  where b.id=coalesce(v_account.branch_id,v_rider.branch_id)
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'rider_id',o.rider_id,'status',o.status,
    'invoice_number',o.invoice_number,'invoice_no',o.invoice_no,
    'invoice_amount',o.invoice_amount,'invoice_value',o.invoice_value,
    'customer_name_snapshot',o.customer_name_snapshot,'customer_name',o.customer_name,
    'customer_phone_snapshot',o.customer_phone_snapshot,'customer_phone',o.customer_phone,
    'customer_address_snapshot',o.customer_address_snapshot,'customer_address',o.customer_address,
    'registered_at',o.registered_at,'created_at',o.created_at,'prepared_at',o.prepared_at,'work_date',o.work_date
  ) order by o.registered_at desc),'[]'::jsonb)
  into v_orders
  from public.delivery_orders o
  where o.rider_id=v_rider.id
    and o.deleted_at is null
    and o.work_date in (v_work_date,v_today);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'rider_id',t.rider_id,'from_label',t.from_label,'to_label',t.to_label,
    'reason',t.reason,'notes',t.notes,'status',t.status,'trip_type',t.trip_type,
    'registered_at',t.registered_at,'created_at',t.created_at,'work_date',t.work_date
  ) order by t.registered_at desc),'[]'::jsonb)
  into v_trips
  from public.internal_trips t
  where t.rider_id=v_rider.id
    and t.work_date in (v_work_date,v_today);

  return jsonb_build_object(
    'success',true,
    'rider',jsonb_build_object(
      'id',v_rider.id,'name',v_rider.name,'branch_id',v_rider.branch_id,
      'branch_name',v_rider.branch_name,'status',v_rider.status
    ),
    'branch',v_branch,
    'attendance',case when v_att.id is null then null else jsonb_build_object(
      'id',v_att.id,'rider_id',v_att.rider_id,'branch_id',v_att.branch_id,
      'work_date',v_att.shift_date,'shift_date',v_att.shift_date,
      'check_in_at',v_att.check_in_time,'check_out_at',v_att.check_out_time,
      'check_in_time',v_att.check_in_time,'check_out_time',v_att.check_out_time,
      'status',v_att.status
    ) end,
    'current_work_date',v_work_date,
    'orders',v_orders,
    'trips',v_trips,
    'session_expires_at',v_session.expires_at
  );
end;
$$;

notify pgrst,'reload schema';
