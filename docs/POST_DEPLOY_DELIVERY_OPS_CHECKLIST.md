# Dawaa Delivery Ops - Post Deploy Checklist

## 1) Confirm Vercel

- Latest Production deployment should be Ready.
- Open the production app and hard refresh the admin dashboard.
- Test these routes:
  - `/admin`
  - `/admin/ops`
  - `/admin/reports`
  - `/admin/cash-flow`
  - `/admin/fraud-alerts`
  - `/admin/trips`
  - `/admin/customer-analytics`
  - `/admin/rider-schedules`

## 2) Apply Supabase SQL migrations

Apply the following migrations in order if they are not already applied:

1. `0060_delivery_trip_proof_fields.sql`
2. `0061_require_customer_details_for_orders.sql`
3. `0062_overdue_order_alerts_view.sql`
4. `0063_trip_proof_alerts_view.sql`
5. `0064_rider_device_status_battery.sql`
6. `0066_customer_frequency_safe_views.sql`
7. `0067_reconciliation_upload_log.sql`

## 3) Battery status test

- Open the rider app on a rider phone.
- Keep the app open for one minute.
- Go to `/admin`.
- Check `صحة تشغيل الدليفري`.
- Confirm the battery column appears.
- If low battery appears, press the `شحن` alert button and confirm a notification row is inserted.

## 4) Customer protection test

Try saving an order with no customer code and no full customer details.
Expected result: the order should be rejected.

Try saving an order with:
- customer name
- phone
- address

Expected result: the order should be accepted.

## 5) Overdue order alerts test

Open Supabase and check:

```sql
select * from overdue_delivery_order_alerts order by open_minutes desc;
```

Expected result:
- Orders older than 60 minutes appear.
- Orders older than 120 minutes are marked danger.

## 6) Trip proof alerts test

Check:

```sql
select * from internal_trip_proof_alerts order by created_at desc;
```

Expected result:
- Trips without invoice and without proof appear as high risk.
- Trips with proof appear for manual review.

## 7) Customer frequency test

Check:

```sql
select * from customer_monthly_frequency_summary order by month_start desc;
```

Then:

```sql
select *
from customer_monthly_frequency
where month_start = date_trunc('month', current_date)::date
order by invoices_count desc
limit 50;
```

Expected result:
- Active customers count appears.
- Customers with 3+, 5+, and 10+ monthly orders are counted.

## 8) Reconciliation history test

After any reconciliation upload, insert or confirm a log row exists in `reconciliation_upload_log`.

Check:

```sql
select * from reconciliation_upload_history order by uploaded_at desc limit 20;
```

Expected result:
- Last uploaded file appears.
- Last reconciliation day appears.

## 9) Dashboard layout test

- Open `/admin` on desktop.
- Confirm the right sidebar stays fixed.
- Confirm dashboard cards do not overflow outside the page.
- Confirm table horizontal scroll stays inside the card only.

## 10) Rider workflow test

- Login from `/rider-login`.
- Refresh page.
- Confirm the session persists.
- Register an order.
- Register a trip.
- Confirm both appear in admin pages.

