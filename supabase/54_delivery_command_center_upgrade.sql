-- 54_delivery_command_center_upgrade.sql
-- V4 Command Center safe upgrade
-- تشغيل هذا الملف بعد 53_rider_compensation_profiles.sql
-- الهدف: توحيد الفروع + تنظيف flags الخاطئة + إنشاء Views نهائية للداشبورد التنفيذي

-- 1) أعمدة تحليلية آمنة لو غير موجودة
alter table public.delivery_orders
  add column if not exists excluded_from_incentive boolean default false,
  add column if not exists not_countable boolean default false,
  add column if not exists is_countable boolean default true,
  add column if not exists is_duplicate_invoice boolean default false,
  add column if not exists duplicate_warning boolean default false,
  add column if not exists needs_review boolean default false,
  add column if not exists is_multiplier_order boolean default false,
  add column if not exists order_multiplier numeric default 1,
  add column if not exists delivery_date date,
  add column if not exists failed_at timestamptz;

-- 2) توحيد أسماء الفروع اعتمادًا على branch_id أولًا
update public.delivery_orders
set branch = 'فرع شكري', branch_name = 'فرع شكري', updated_at = now()
where branch_id = '1a1d5a29-46d6-4f9c-9763-b768114fac9f'
   or lower(coalesce(branch, '')) in ('shkri','shukri','shokry','shoukry')
   or lower(coalesce(branch_name, '')) in ('shkri','shukri','shokry','shoukry');

update public.delivery_orders
set branch = 'فرع الشامي', branch_name = 'فرع الشامي', updated_at = now()
where branch_id = '5950c09b-d45b-4e61-aa0a-388a0c9c92c7'
   or lower(coalesce(branch, '')) in ('shamy','shami','elshamy','alshamy')
   or lower(coalesce(branch_name, '')) in ('shamy','shami','elshamy','alshamy');

update public.delivery_customers
set branch = 'فرع شكري'
where lower(coalesce(branch, '')) in ('shkri','shukri','shokry','shoukry');

update public.delivery_customers
set branch = 'فرع الشامي'
where lower(coalesce(branch, '')) in ('shamy','shami','elshamy','alshamy');

-- 3) تنظيف is_countable من الأوردرات العادية، مع تثبيت الفاشل كغير محتسب
update public.delivery_orders
set is_countable = true, updated_at = now()
where lower(coalesce(status, '')) in ('registered', 'delivered', 'completed', 'done')
  and lower(coalesce(review_status, '')) = 'pending'
  and coalesce(not_countable, false) = false
  and coalesce(excluded_from_incentive, false) = false
  and coalesce(is_countable, true) = false;

update public.delivery_orders
set is_countable = false, updated_at = now()
where lower(coalesce(status, '')) in ('failed', 'fail', 'cancelled', 'canceled')
   or lower(coalesce(review_status, '')) = 'failed'
   or failed_at is not null;

-- 4) تنظيف needs_review من pending العادي فقط، مع ترك المكرر كما هو للمراجعة الإدارية
update public.delivery_orders
set needs_review = false, updated_at = now()
where lower(coalesce(status, '')) in ('registered', 'delivered', 'completed', 'done')
  and lower(coalesce(review_status, '')) = 'pending'
  and coalesce(needs_review, false) = true
  and coalesce(not_countable, false) = false
  and coalesce(excluded_from_incentive, false) = false
  and coalesce(is_duplicate_invoice, false) = false
  and coalesce(duplicate_warning, false) = false;

-- 5) جودة البيانات
create or replace view public.delivery_data_quality_dashboard as
select
  count(*) filter (where branch_id is null and nullif(coalesce(branch_name, branch), '') is null) as orders_without_branch,
  count(*) filter (where rider_id is null) as orders_without_rider,
  count(*) filter (where nullif(coalesce(invoice_no, invoice_number, order_no), '') is null) as orders_without_invoice,
  count(*) filter (where lower(coalesce(branch, branch_name, '')) like '%shkri%') as non_canonical_branch_names,
  count(*) filter (where lower(coalesce(review_status, '')) = 'pending' and coalesce(needs_review, false) is false) as pending_reconciliation_orders,
  count(*) filter (where coalesce(needs_review, false) is true or lower(coalesce(review_status, '')) in ('needs_review','manual_review','not_found','missing_invoice')) as real_review_orders,
  count(*) filter (where coalesce(is_duplicate_invoice, false) is true or coalesce(duplicate_warning, false) is true) as duplicate_invoices,
  count(*) filter (where lower(coalesce(status, '')) in ('failed','fail','cancelled','canceled') or failed_at is not null or lower(coalesce(review_status,'')) = 'failed') as failed_orders
from public.delivery_orders;

-- 6) Scorecard الدورة الحالية 26 → 25
create or replace view public.delivery_rider_cycle_scorecard as
with cycle_bounds as (
  select
    case
      when extract(day from current_date) >= 26
      then (date_trunc('month', current_date)::date + interval '25 days')::date
      else (date_trunc('month', current_date - interval '1 month')::date + interval '25 days')::date
    end as cycle_start,
    case
      when extract(day from current_date) >= 26
      then (date_trunc('month', current_date + interval '1 month')::date + interval '24 days')::date
      else (date_trunc('month', current_date)::date + interval '24 days')::date
    end as cycle_end
),
base as (
  select
    o.id as order_id,
    o.rider_id,
    coalesce(o.rider_name, o.driver_name, r.name, 'غير محدد') as rider_name,
    coalesce(o.branch_id, r.branch_id) as branch_id,
    case
      when coalesce(o.branch_id, r.branch_id)::text = '1a1d5a29-46d6-4f9c-9763-b768114fac9f' then 'فرع شكري'
      when coalesce(o.branch_id, r.branch_id)::text = '5950c09b-d45b-4e61-aa0a-388a0c9c92c7' then 'فرع الشامي'
      when lower(coalesce(o.branch_name, o.branch, '')) in ('shkri','shukri','shokry','shoukry','شكري','شكرى') then 'فرع شكري'
      when lower(coalesce(o.branch_name, o.branch, '')) in ('shamy','shami','elshamy','alshamy','الشامي') then 'فرع الشامي'
      else coalesce(o.branch_name, o.branch, 'غير محدد')
    end as branch_name,
    lower(coalesce(o.status, '')) as status_text,
    lower(coalesce(o.review_status, '')) as review_status_text,
    o.delivered_at,
    o.order_multiplier,
    o.is_multiplier_order,
    o.is_duplicate_invoice,
    o.duplicate_warning,
    o.failed_at,
    o.needs_review,
    o.excluded_from_incentive,
    o.not_countable,
    o.is_countable,
    coalesce(o.delivery_date, o.created_at::date) as order_date
  from public.delivery_orders o
  left join public.riders r on r.id = o.rider_id
  cross join cycle_bounds cb
  where coalesce(o.delivery_date, o.created_at::date) between cb.cycle_start and cb.cycle_end
),
flags as (
  select
    b.*,
    (b.status_text in ('registered', 'delivered', 'completed', 'done')) as is_registered,
    (b.status_text in ('delivered', 'completed', 'done') or b.delivered_at is not null) as is_delivered,
    (coalesce(b.order_multiplier, case when coalesce(b.is_multiplier_order, false) then 1.5 else 1 end) >= 1.5) as is_multiplier,
    (coalesce(b.is_duplicate_invoice, false) is true or coalesce(b.duplicate_warning, false) is true) as is_duplicate,
    (b.status_text in ('failed', 'fail', 'cancelled', 'canceled') or b.failed_at is not null or b.review_status_text = 'failed') as is_failed,
    (b.review_status_text = 'pending' and coalesce(b.needs_review, false) is false) as is_pending_reconciliation,
    (coalesce(b.needs_review, false) is true or b.review_status_text in ('needs_review','manual_review','not_found','missing_invoice')) as is_review,
    (coalesce(b.excluded_from_incentive, false) is true or coalesce(b.not_countable, false) is true or b.is_countable is false) as is_uncounted
  from base b
),
scored_orders as (
  select
    f.*,
    least(
      100,
      case when f.is_duplicate then 35 else 0 end
      + case when f.is_failed then 30 else 0 end
      + case when f.is_review then 25 else 0 end
      + case when f.is_uncounted then 15 else 0 end
      + case when f.is_pending_reconciliation then 3 else 0 end
    ) as order_risk_score
  from flags f
),
agg as (
  select
    rider_id,
    rider_name,
    branch_id,
    branch_name,
    count(*) as total_orders,
    count(*) filter (where is_registered) as registered_orders,
    count(*) filter (where is_delivered) as delivered_orders,
    count(*) filter (where is_multiplier) as multiplier_orders,
    count(*) filter (where is_duplicate) as duplicate_orders,
    count(*) filter (where is_failed) as failed_orders,
    count(*) filter (where is_pending_reconciliation) as pending_reconciliation_orders,
    count(*) filter (where is_review) as review_orders,
    count(*) filter (where is_uncounted) as uncounted_orders,
    round(avg(order_risk_score)::numeric, 2) as risk_rate
  from scored_orders
  group by rider_id, rider_name, branch_id, branch_name
)
select
  a.*,
  greatest(0, round((100 - coalesce(a.risk_rate, 0))::numeric, 2)) as accuracy_score,
  round(case when a.total_orders > 0 then (a.registered_orders::numeric / a.total_orders) * 100 else 0 end, 2) as operation_rate,
  round(case when a.total_orders > 0 then (a.delivered_orders::numeric / a.total_orders) * 100 else 0 end, 2) as delivery_rate
from agg a;

grant select on public.delivery_data_quality_dashboard to anon, authenticated;
grant select on public.delivery_rider_cycle_scorecard to anon, authenticated;
notify pgrst, 'reload schema';
