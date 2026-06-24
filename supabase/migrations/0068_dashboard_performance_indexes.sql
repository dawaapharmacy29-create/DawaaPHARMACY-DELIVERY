create index if not exists idx_delivery_orders_dashboard_period on delivery_orders (delivery_date, work_date, registered_at);
create index if not exists idx_delivery_orders_dashboard_rider on delivery_orders (rider_id, work_date, delivery_date);
create index if not exists idx_delivery_orders_dashboard_status on delivery_orders (status, work_date, delivery_date);
create index if not exists idx_delivery_orders_dashboard_invoice on delivery_orders (invoice_number);
create index if not exists idx_delivery_orders_dashboard_customer_code on delivery_orders (customer_code_snapshot);
create index if not exists idx_delivery_orders_dashboard_customer_phone on delivery_orders (customer_phone_snapshot);
create index if not exists idx_internal_trips_dashboard_rider on internal_trips (rider_id, work_date, trip_date);
create index if not exists idx_internal_trips_dashboard_status on internal_trips (status, work_date, trip_date);
create index if not exists idx_rider_device_status_dashboard on rider_device_status (rider_id, last_seen_at desc);
