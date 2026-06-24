-- 0062_overdue_order_alerts_view.sql
-- Read-only view for open delivery orders delayed more than 60 minutes.

create or replace view overdue_delivery_order_alerts as
select
  o.id,
  o.rider_id,
  o.invoice_number,
  coalesce(o.customer_name, o.customer_name_snapshot, 'عميل غير محدد') as customer_name,
  coalesce(o.customer_phone, o.customer_phone_snapshot) as customer_phone,
  o.status,
  o.work_date,
  o.registered_at,
  o.created_at,
  floor(extract(epoch from (now() - coalesce(o.registered_at, o.created_at))) / 60)::int as open_minutes,
  case
    when floor(extract(epoch from (now() - coalesce(o.registered_at, o.created_at))) / 60) >= 120 then 'danger'
    else 'warning'
  end as alert_level
from delivery_orders o
where coalesce(o.status, '') not in ('delivered', 'completed', 'failed', 'cancelled')
  and coalesce(o.registered_at, o.created_at) is not null
  and now() - coalesce(o.registered_at, o.created_at) >= interval '60 minutes';
