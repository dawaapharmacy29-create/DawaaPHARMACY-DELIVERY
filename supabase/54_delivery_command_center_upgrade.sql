-- 54_delivery_command_center_upgrade.sql
-- غرفة التحكم التنفيذية: توحيد الفروع + Views تحليلية آمنة للداشبورد

-- 1) تنظيف أسماء فرع شكري والشامي من الأعمدة النصية الشائعة
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

-- 2) View جودة البيانات في الداشبورد
create or replace view public.delivery_data_quality_dashboard as
select
  count(*) filter (where branch_id is null and nullif(coalesce(branch_name, branch), '') is null) as orders_without_branch,
  count(*) filter (where rider_id is null) as orders_without_rider,
  count(*) filter (where nullif(coalesce(invoice_no, invoice_number, order_no), '') is null) as orders_without_invoice,
  count(*) filter (where lower(coalesce(branch, branch_name, '')) like '%shkri%') as non_canonical_branch_names,
  count(*) filter (where needs_review is true or review_status in ('pending','needs_review','registered')) as orders_need_review,
  count(*) filter (where is_duplicate_invoice is true or duplicate_warning is true) as duplicate_invoices,
  count(*) filter (where lower(coalesce(status, '')) like '%fail%' or failed_at is not null) as failed_orders
from public.delivery_orders;

-- 3) View Scorecard لكل دليفري في الدورة الحالية 26→25 تقريبًا اعتمادًا على بيانات الأوردرات
create or replace view public.delivery_rider_cycle_scorecard as
with base as (
  select
    o.rider_id,
    coalesce(o.rider_name, o.driver_name, r.name, 'غير محدد') as rider_name,
    coalesce(o.branch_id, r.branch_id) as branch_id,
    case
      when coalesce(o.branch_id, r.branch_id)::text = '1a1d5a29-46d6-4f9c-9763-b768114fac9f' then 'فرع شكري'
      when coalesce(o.branch_id, r.branch_id)::text = '5950c09b-d45b-4e61-aa0a-388a0c9c92c7' then 'فرع الشامي'
      else coalesce(o.branch_name, o.branch, 'غير محدد')
    end as branch_name,
    o.*
  from public.delivery_orders o
  left join public.riders r on r.id = o.rider_id
  where coalesce(o.delivery_date, o.created_at::date) between
    case when extract(day from current_date) >= 26
      then date_trunc('month', current_date)::date + interval '25 days'
      else date_trunc('month', current_date - interval '1 month')::date + interval '25 days'
    end
    and
    case when extract(day from current_date) >= 26
      then date_trunc('month', current_date + interval '1 month')::date + interval '24 days'
      else date_trunc('month', current_date)::date + interval '24 days'
    end
)
select
  rider_id,
  rider_name,
  branch_id,
  branch_name,
  count(*) as total_orders,
  count(*) filter (where lower(coalesce(status,'')) = 'delivered' or delivered_at is not null) as delivered_orders,
  count(*) filter (where coalesce(order_multiplier, case when is_multiplier_order then 1.5 else 1 end) >= 1.5) as multiplier_orders,
  count(*) filter (where is_duplicate_invoice is true or duplicate_warning is true) as duplicate_orders,
  count(*) filter (where lower(coalesce(status,'')) like '%fail%' or failed_at is not null) as failed_orders,
  count(*) filter (where needs_review is true or review_status in ('pending','needs_review','registered')) as review_orders,
  count(*) filter (where excluded_from_incentive is true or not_countable is true or is_countable is false) as uncounted_orders,
  round(
    greatest(0, least(100,
      100 - (
        (count(*) filter (where is_duplicate_invoice is true or duplicate_warning is true) * 12) +
        (count(*) filter (where lower(coalesce(status,'')) like '%fail%' or failed_at is not null) * 10) +
        (count(*) filter (where needs_review is true or review_status in ('pending','needs_review','registered')) * 5)
      )
    ))::numeric, 2
  ) as accuracy_score
from base
group by rider_id, rider_name, branch_id, branch_name;

grant select on public.delivery_data_quality_dashboard to anon, authenticated;
grant select on public.delivery_rider_cycle_scorecard to anon, authenticated;
notify pgrst, 'reload schema';
