-- 0066_customer_frequency_safe_views.sql
-- Safe customer frequency views based only on delivery_orders fields already used by the app.

create or replace view customer_monthly_frequency as
select
  date_trunc('month', coalesce(work_date::timestamp, delivery_date::timestamp, registered_at, created_at))::date as month_start,
  coalesce(nullif(customer_code_snapshot, ''), nullif(customer_phone_snapshot, ''), nullif(customer_name_snapshot, ''), 'unknown') as customer_key,
  max(customer_code_snapshot) as customer_code,
  max(coalesce(customer_name_snapshot, 'عميل غير محدد')) as customer_name,
  max(customer_phone_snapshot) as customer_phone,
  count(*) as invoices_count,
  count(*) filter (where status in ('delivered', 'completed')) as delivered_count,
  count(*) filter (where status in ('failed', 'cancelled', 'canceled')) as failed_count,
  coalesce(sum(coalesce(invoice_amount, 0)), 0) as total_sales,
  min(coalesce(work_date::date, delivery_date::date, registered_at::date, created_at::date)) as first_order_date,
  max(coalesce(work_date::date, delivery_date::date, registered_at::date, created_at::date)) as last_order_date,
  case
    when count(*) >= 10 then '10_plus'
    when count(*) >= 5 then '5_plus'
    when count(*) >= 3 then '3_plus'
    when count(*) >= 1 then 'active'
    else 'inactive'
  end as frequency_segment
from delivery_orders
where coalesce(customer_code_snapshot, customer_phone_snapshot, customer_name_snapshot) is not null
group by 1, 2;

create or replace view customer_monthly_frequency_summary as
select
  month_start,
  count(*) as active_customers,
  count(*) filter (where invoices_count >= 3) as customers_3_plus,
  count(*) filter (where invoices_count >= 5) as customers_5_plus,
  count(*) filter (where invoices_count >= 10) as customers_10_plus,
  sum(invoices_count) as total_invoices,
  sum(total_sales) as total_sales
from customer_monthly_frequency
group by month_start;
