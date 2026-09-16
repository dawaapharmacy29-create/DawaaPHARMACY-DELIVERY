create or replace function public.rider_get_operating_dashboard_fast(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare
  v_session record; v_account record; v_rider record; v_att record; v_branch jsonb;
  v_today date := ((now() at time zone 'Africa/Cairo')::date); v_work_date date; v_cycle_start date; v_cycle_end date;
  v_orders jsonb := '[]'::jsonb; v_trips jsonb := '[]'::jsonb; v_cycle_summary jsonb := '{}'::jsonb;
  v_rejected_orders jsonb := '[]'::jsonb; v_rejected_trips jsonb := '[]'::jsonb;
begin
  if coalesce(length(trim(p_token)),0) < 20 then return jsonb_build_object('success',false,'error','invalid_token'); end if;
  select id,account_id,rider_id,expires_at into v_session from public.rider_sessions
  where session_token=p_token and coalesce(revoked,false)=false and revoked_at is null and (expires_at is null or expires_at>now()) limit 1;
  if not found then return jsonb_build_object('success',false,'error','expired_session'); end if;
  update public.rider_sessions set last_seen=now() where id=v_session.id;
  select id,rider_id,display_name,username,role,branch_id,status into v_account from public.rider_accounts where id=v_session.account_id and status='active' limit 1;
  if not found then return jsonb_build_object('success',false,'error','inactive_account'); end if;
  select * into v_rider from public.riders where id=coalesce(v_session.rider_id,v_account.rider_id) and status='active' limit 1;
  if not found then return jsonb_build_object('success',false,'error','rider_inactive'); end if;
  select * into v_att from public.delivery_attendance where rider_id=v_rider.id and check_in_time is not null and check_out_time is null and check_in_time>=now()-interval '16 hours' order by check_in_time desc limit 1;
  v_work_date := coalesce(v_att.shift_date,v_today);
  if extract(day from v_today)::int >= 26 then
    v_cycle_start := make_date(extract(year from v_today)::int,extract(month from v_today)::int,26);
  else
    v_cycle_start := (make_date(extract(year from v_today)::int,extract(month from v_today)::int,26)-interval '1 month')::date;
  end if;
  v_cycle_end := (v_cycle_start+interval '1 month - 1 day')::date;

  select jsonb_build_object('id',b.id,'name',b.name) into v_branch from public.branches b where b.id=coalesce(v_account.branch_id,v_rider.branch_id) limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'rider_id',o.rider_id,'work_date',o.work_date,'status',o.status,'invoice_number',o.invoice_number,'invoice_no',o.invoice_no,
    'invoice_amount',o.invoice_amount,'invoice_value',o.invoice_value,'order_multiplier',o.order_multiplier,'approval_status',o.approval_status,
    'customer_name_snapshot',o.customer_name_snapshot,'customer_name',o.customer_name,
    'customer_phone_snapshot',o.customer_phone_snapshot,'customer_phone',o.customer_phone,'customer_address_snapshot',o.customer_address_snapshot,'customer_address',o.customer_address,
    'registered_at',o.registered_at,'created_at',o.created_at,'prepared_at',o.prepared_at) order by o.registered_at desc),'[]'::jsonb)
  into v_orders from public.delivery_orders o where o.rider_id=v_rider.id and o.deleted_at is null and o.work_date in (v_work_date,v_today);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'rider_id',t.rider_id,'work_date',t.work_date,'trip_type',t.trip_type,'from_label',t.from_label,'to_label',t.to_label,
    'reason',t.reason,'notes',t.notes,'status',t.status,'review_status',t.review_status,'registered_at',t.registered_at,'created_at',t.created_at) order by t.registered_at desc),'[]'::jsonb)
  into v_trips from public.internal_trips t where t.rider_id=v_rider.id and t.work_date in (v_work_date,v_today);

  with order_stats as (
    select
      count(*)::int as orders_total,
      count(*) filter(where coalesce(o.order_multiplier,1) < 1.5)::int as orders_x1_total,
      count(*) filter(where coalesce(o.order_multiplier,1) >= 1.5)::int as orders_x15_total,
      count(*) filter(where coalesce(o.order_multiplier,1) >= 1.5 and lower(coalesce(o.approval_status,'pending'))='pending')::int as orders_x15_pending_approval,
      count(*) filter(where coalesce(o.order_multiplier,1) >= 1.5 and lower(coalesce(o.approval_status,''))='approved')::int as orders_x15_approved,
      count(*) filter(where coalesce(o.order_multiplier,1) >= 1.5 and lower(coalesce(o.approval_status,''))='rejected')::int as orders_x15_rejected,
      count(*) filter(where coalesce(o.final_count_status,'') like 'counted%')::int as orders_accepted,
      count(*) filter(where lower(coalesce(o.status,'')) in ('failed','rejected','فشل','مرفوض') or coalesce(o.final_count_status,'') like 'excluded_%')::int as orders_rejected,
      count(*) filter(where not (coalesce(o.final_count_status,'') like 'counted%') and not (lower(coalesce(o.status,'')) in ('failed','rejected','فشل','مرفوض') or coalesce(o.final_count_status,'') like 'excluded_%'))::int as orders_pending,
      count(*) filter(where coalesce(o.delivery_date,o.work_date,(o.registered_at at time zone 'Africa/Cairo')::date)=v_today)::int as orders_today
    from public.delivery_orders o
    where o.rider_id=v_rider.id and o.deleted_at is null
      and coalesce(o.delivery_date,o.work_date,(o.registered_at at time zone 'Africa/Cairo')::date) between v_cycle_start and v_cycle_end
  ), trip_stats as (
    select
      count(*)::int as trips_total,
      count(*) filter(where lower(coalesce(t.status,''))='approved' or lower(coalesce(t.review_status,''))='approved')::int as trips_accepted,
      count(*) filter(where lower(coalesce(t.status,''))='rejected' or lower(coalesce(t.review_status,''))='rejected')::int as trips_rejected,
      count(*) filter(where lower(coalesce(t.status,''))='pending_approval' or lower(coalesce(t.review_status,'')) in ('pending','pending_evidence_review','exception_review'))::int as trips_pending
    from public.internal_trips t
    where t.rider_id=v_rider.id
      and coalesce(t.work_date,t.trip_date,(t.registered_at at time zone 'Africa/Cairo')::date) between v_cycle_start and v_cycle_end
  )
  select jsonb_build_object(
    'cycle_start',v_cycle_start,'cycle_end',v_cycle_end,
    'orders_total',o.orders_total,
    'orders_x1_total',o.orders_x1_total,
    'orders_x15_total',o.orders_x15_total,
    'orders_x15_pending_approval',o.orders_x15_pending_approval,
    'orders_x15_approved',o.orders_x15_approved,
    'orders_x15_rejected',o.orders_x15_rejected,
    'orders_accepted',o.orders_accepted,
    'orders_rejected',o.orders_rejected,
    'orders_pending',o.orders_pending,
    'orders_today',o.orders_today,
    'trips_total',t.trips_total,
    'trips_accepted',t.trips_accepted,
    'trips_rejected',t.trips_rejected,
    'trips_pending',t.trips_pending
  ) into v_cycle_summary
  from order_stats o cross join trip_stats t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'work_date',coalesce(o.work_date,o.delivery_date),
    'invoice_number',coalesce(o.invoice_number,o.invoice_no),
    'invoice_amount',coalesce(o.invoice_amount,o.invoice_value,0),
    'customer_name',coalesce(o.customer_name_snapshot,o.customer_name,o.customer_code_snapshot,o.customer_code,'عميل غير محدد'),
    'customer_address',coalesce(o.customer_address_snapshot,o.customer_address,''),
    'status',o.status,'approval_status',o.approval_status,'final_count_status',o.final_count_status,
    'failure_reason',o.failure_reason,'review_reason',o.review_reason,'reconciliation_notes',o.reconciliation_notes,
    'registered_at',o.registered_at,'created_at',o.created_at
  ) order by coalesce(o.registered_at,o.created_at) desc),'[]'::jsonb)
  into v_rejected_orders
  from public.delivery_orders o
  where o.rider_id=v_rider.id and o.deleted_at is null
    and coalesce(o.delivery_date,o.work_date,(o.registered_at at time zone 'Africa/Cairo')::date) between v_cycle_start and v_cycle_end
    and (lower(coalesce(o.status,'')) in ('failed','rejected','فشل','مرفوض') or coalesce(o.final_count_status,'') like 'excluded_%');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'work_date',coalesce(t.work_date,t.trip_date),'trip_type',t.trip_type,
    'from_label',t.from_label,'to_label',t.to_label,'reason',t.reason,'notes',t.notes,
    'status',t.status,'review_status',t.review_status,'rejection_reason',t.rejection_reason,
    'registered_at',t.registered_at,'created_at',t.created_at
  ) order by coalesce(t.registered_at,t.created_at) desc),'[]'::jsonb)
  into v_rejected_trips
  from public.internal_trips t
  where t.rider_id=v_rider.id
    and coalesce(t.work_date,t.trip_date,(t.registered_at at time zone 'Africa/Cairo')::date) between v_cycle_start and v_cycle_end
    and (lower(coalesce(t.status,''))='rejected' or lower(coalesce(t.review_status,''))='rejected');

  v_cycle_summary := v_cycle_summary || jsonb_build_object('rejected_orders',v_rejected_orders,'rejected_trips',v_rejected_trips);

  return jsonb_build_object('success',true,'rider',to_jsonb(v_rider),'branch',v_branch,
    'attendance',case when v_att.id is null then null else jsonb_build_object('id',v_att.id,'rider_id',v_att.rider_id,'branch_id',v_att.branch_id,'work_date',v_att.shift_date,'shift_date',v_att.shift_date,'check_in_at',v_att.check_in_time,'check_out_at',v_att.check_out_time,'check_in_time',v_att.check_in_time,'check_out_time',v_att.check_out_time,'status',v_att.status) end,
    'current_work_date',v_work_date,'cycle_summary',v_cycle_summary,'orders',v_orders,'trips',v_trips,'session_expires_at',v_session.expires_at);
end;
$$;
