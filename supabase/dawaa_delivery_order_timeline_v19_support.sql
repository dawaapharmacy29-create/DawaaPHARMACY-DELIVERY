-- Dawaa Pharmacy Delivery Control - V19 Order Timeline System
-- إضافة توقيت خروج الأوردر من الفرع وربطه بالدليفري ومدير الفرع/الدكتور.
-- آمن: لا يحذف بيانات، ويضيف أعمدة ودوال فقط.

begin;

alter table if exists public.delivery_orders
  add column if not exists prepared_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists dispatched_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists dispatch_by uuid,
  add column if not exists dispatch_by_name text,
  add column if not exists picked_up_by uuid,
  add column if not exists picked_up_by_name text,
  add column if not exists dispatch_status text default 'not_ready',
  add column if not exists dispatch_notes text,
  add column if not exists pickup_notes text,
  add column if not exists delivery_duration_minutes integer;

-- Backfill خفيف للأوردرات القديمة: أي أوردر مسجل قديمًا وله dispatched_at مفقود نتركه كما هو؛
-- وأي أوردر delivered بدون dispatch_status نضبط حالته فقط بدون اختراع وقت خروج.
update public.delivery_orders
set dispatch_status = case
  when delivered_at is not null then 'delivered'
  when picked_up_at is not null then 'picked_up'
  when dispatched_at is not null then 'dispatched'
  when ready_at is not null then 'ready'
  else coalesce(dispatch_status, 'not_ready')
end
where dispatch_status is null
   or dispatch_status = ''
   or dispatch_status = 'not_ready';

create index if not exists idx_delivery_orders_dispatched_at
  on public.delivery_orders (dispatched_at);

create index if not exists idx_delivery_orders_dispatch_status
  on public.delivery_orders (dispatch_status);

create index if not exists idx_delivery_orders_timeline_branch_date
  on public.delivery_orders (branch_id, delivery_date, dispatch_status);

-- جدول سجل أحداث اختياري للتايملاين
create table if not exists public.delivery_order_timeline_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  event_type text not null,
  event_at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_order_timeline_events_order
  on public.delivery_order_timeline_events(order_id, event_at desc);

-- View متابعة تشغيلية
create or replace view public.delivery_order_timeline_v19 as
select
  o.id,
  o.branch_id,
  o.rider_id,
  coalesce(o.rider_name, o.driver_name) as rider_name,
  o.delivery_date,
  coalesce(o.invoice_number, o.invoice_no, o.order_no) as invoice_number,
  coalesce(o.customer_name_snapshot, o.customer_name) as customer_name,
  coalesce(o.customer_phone_snapshot, o.customer_phone) as customer_phone,
  o.status,
  o.registered_at,
  o.prepared_at,
  o.ready_at,
  o.dispatched_at,
  o.picked_up_at,
  o.arrived_at,
  o.delivered_at,
  o.failed_at,
  o.dispatch_status,
  o.dispatch_by_name,
  o.picked_up_by_name,
  case
    when o.delivered_at is not null then 'تم التسليم'
    when o.failed_at is not null or o.status = 'failed' then 'فشل التسليم'
    when o.picked_up_at is not null then 'مع الدليفري'
    when o.dispatched_at is not null then 'خرج من الفرع'
    when o.ready_at is not null then 'جاهز للخروج'
    else 'لم يخرج بعد'
  end as timeline_label,
  case
    when o.dispatched_at is null and o.delivered_at is null and o.failed_at is null then
      greatest(0, round(extract(epoch from (now() - coalesce(o.registered_at, o.created_at))) / 60))::int
    else null
  end as waiting_dispatch_minutes,
  case
    when o.dispatched_at is not null then
      greatest(0, round(extract(epoch from (coalesce(o.delivered_at, now()) - o.dispatched_at)) / 60))::int
    else null
  end as minutes_since_dispatch,
  case
    when o.dispatched_at is not null and o.picked_up_at is not null then
      greatest(0, round(extract(epoch from (o.picked_up_at - o.dispatched_at)) / 60))::int
    else null
  end as pickup_delay_minutes
from public.delivery_orders o;

grant select on public.delivery_order_timeline_v19 to anon, authenticated;

-- تسجيل خروج الأوردر من الفرع
create or replace function public.mark_order_dispatched_v19(
  p_order_id uuid,
  p_actor_name text default null,
  p_notes text default null
)
returns public.delivery_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.delivery_orders;
  v_now timestamptz := now();
begin
  update public.delivery_orders
  set
    ready_at = coalesce(ready_at, v_now),
    dispatched_at = coalesce(dispatched_at, v_now),
    dispatch_status = 'dispatched',
    dispatch_by_name = coalesce(nullif(p_actor_name, ''), dispatch_by_name),
    dispatch_notes = coalesce(nullif(p_notes, ''), dispatch_notes),
    updated_at = v_now
  where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'order_not_found';
  end if;

  insert into public.delivery_order_timeline_events(order_id, event_type, event_at, actor_name, notes)
  values (p_order_id, 'dispatched', v_order.dispatched_at, p_actor_name, p_notes);

  return v_order;
end;
$$;

grant execute on function public.mark_order_dispatched_v19(uuid, text, text) to anon, authenticated;

-- تسجيل استلام الدليفري للأوردر
create or replace function public.mark_order_picked_up_v19(
  p_order_id uuid,
  p_rider_id uuid default null,
  p_rider_name text default null,
  p_notes text default null
)
returns public.delivery_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.delivery_orders;
  v_now timestamptz := now();
begin
  update public.delivery_orders
  set
    picked_up_at = coalesce(picked_up_at, v_now),
    picked_up_by = coalesce(p_rider_id, picked_up_by),
    picked_up_by_name = coalesce(nullif(p_rider_name, ''), picked_up_by_name),
    dispatch_status = case
      when delivered_at is not null then 'delivered'
      else 'picked_up'
    end,
    pickup_notes = coalesce(nullif(p_notes, ''), pickup_notes),
    updated_at = v_now
  where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'order_not_found';
  end if;

  insert into public.delivery_order_timeline_events(order_id, event_type, event_at, actor_id, actor_name, notes)
  values (p_order_id, 'picked_up', v_order.picked_up_at, p_rider_id, p_rider_name, p_notes);

  return v_order;
end;
$$;

grant execute on function public.mark_order_picked_up_v19(uuid, uuid, text, text) to anon, authenticated;

-- ملخص تشغيلي للداشببورد/مدير الفرع
create or replace function public.get_delivery_timeline_summary_v19(
  p_branch_id uuid default null,
  p_start date default current_date,
  p_end date default current_date
)
returns table (
  orders_count bigint,
  dispatched_count bigint,
  not_dispatched_count bigint,
  picked_up_count bigint,
  delivered_count bigint,
  failed_count bigint,
  avg_minutes_to_dispatch numeric,
  avg_minutes_from_dispatch_to_delivery numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::bigint as orders_count,
    count(*) filter (where dispatched_at is not null)::bigint as dispatched_count,
    count(*) filter (where dispatched_at is null and delivered_at is null and failed_at is null)::bigint as not_dispatched_count,
    count(*) filter (where picked_up_at is not null)::bigint as picked_up_count,
    count(*) filter (where delivered_at is not null or status = 'delivered')::bigint as delivered_count,
    count(*) filter (where failed_at is not null or status = 'failed')::bigint as failed_count,
    round(avg(extract(epoch from (dispatched_at - coalesce(registered_at, created_at))) / 60) filter (where dispatched_at is not null), 2)::numeric as avg_minutes_to_dispatch,
    round(avg(extract(epoch from (delivered_at - dispatched_at)) / 60) filter (where dispatched_at is not null and delivered_at is not null), 2)::numeric as avg_minutes_from_dispatch_to_delivery
  from public.delivery_orders
  where delivery_date between p_start and p_end
    and (p_branch_id is null or branch_id = p_branch_id);
$$;

grant execute on function public.get_delivery_timeline_summary_v19(uuid, date, date) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- اختبار سريع
select * from public.get_delivery_timeline_summary_v19(null, current_date, current_date);
