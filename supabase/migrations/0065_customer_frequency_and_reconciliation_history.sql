-- 0065_customer_frequency_and_reconciliation_history.sql
-- Customer order frequency and reconciliation upload history views.

create or replace view customer_monthly_frequency as
select
  date_trunc('month', coalesce(work_date::timestamp, delivery_date::timestamp, registered_at, created_at))::date as month_start,
  coalesce(customer_id::text, nullif(customer_code, ''), nullif(customer_code_snapshot, ''), nullif(customer_phone, ''), nullif(customer_phone_snapshot, ''), nullif(customer_name, ''), nullif(customer_name_snapshot, '')) as customer_key,
  max(coalesce(customer_code, customer_code_snapshot)) as customer_code,
  max(coalesce(customer_name, customer_name_snapshot, 'عميل غير محدد')) as customer_name,
  max(coalesce(customer_phone, customer_phone_snapshot)) as customer_phone,
  max(coalesce(branch_name, branch)) as branch_name,
  count(*) as invoices_count,
  count(*) filter (where status in ('delivered', 'completed')) as delivered_count,
  count(*) filter (where status in ('failed', 'cancelled', 'canceled')) as failed_count,
  coalesce(sum(coalesce(invoice_amount, invoice_value, amount, total_amount, 0)), 0) as total_sales,
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
where coalesce(customer_id::text, customer_code, customer_code_snapshot, customer_phone, customer_phone_snapshot, customer_name, customer_name_snapshot) is not null
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

create or replace view reconciliation_upload_history as
select
  id,
  created_at,
  coalesce(upload_date, created_at::date) as upload_date,
  coalesce(file_name, batch_name, source_file, 'ملف مطابقة') as file_name,
  coalesce(period_start, date_from, work_date) as period_start,
  coalesce(period_end, date_to, work_date) as period_end,
  coalesce(total_rows, invoices_count, matched_count, 0) as rows_count,
  coalesce(created_by_name, uploaded_by_name, created_by, uploaded_by) as uploaded_by
from monthly_invoice_reconciliation_batches
order by created_at desc;
