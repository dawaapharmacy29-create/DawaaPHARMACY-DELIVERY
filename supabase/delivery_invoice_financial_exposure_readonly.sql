-- READ ONLY. Run before any visit-gateway cutover and after deployment.
-- Scope manual remediation to the previous cycle (2026-09-26 to 2026-10-25),
-- the current cycle (from 2026-10-26), and all future registrations.
-- Older delivery_orders remain untouched and continue to exist for duplicate
-- detection by the production guard; do not re-open their payroll.
-- This audit reports exposure, not an automatic adjustment.
-- Invoice grouping is branch-scoped and independent of work/delivery dates.

with normalized as (
  select o.id, o.branch_id, o.rider_id, o.invoice_number, o.invoice_no,
    o.work_date, o.delivery_date, o.invoice_amount, o.invoice_value,
    o.is_countable, o.final_count_status, o.duplicate_review_status,
    o.order_earning,
    public.normalize_delivery_reconciliation_invoice(
      pg_catalog.translate(
        coalesce(nullif(pg_catalog.btrim(o.invoice_number), ''), o.invoice_no),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'
      )
    ) as invoice_key
  from public.delivery_orders o
  where o.deleted_at is null
    and coalesce(o.work_date, o.delivery_date,
      (o.registered_at at time zone 'Africa/Cairo')::date) >= date '2026-09-26'
),
groups as (
  select branch_id, invoice_key,
    count(*) as registrations,
    count(distinct rider_id) as riders,
    count(distinct work_date) as distinct_work_dates,
    count(*) filter (
      where is_countable is true
        or coalesce(final_count_status, '') like 'counted%'
    ) as potentially_paid_registrations,
    count(*) filter (
      where duplicate_review_status = 'pending'
    ) as pending_legacy_reviews,
    sum(coalesce(order_earning,0)) filter (
      where is_countable is true
        or coalesce(final_count_status, '') like 'counted%'
    ) as potentially_counted_rider_earnings,
    min(work_date) as earliest_work_date,
    max(work_date) as latest_work_date,
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'order_id', id, 'rider_id', rider_id,
      'invoice_number', invoice_number, 'invoice_no', invoice_no,
      'is_countable', is_countable,
      'final_count_status', final_count_status,
      'duplicate_review_status', duplicate_review_status,
      'invoice_amount', invoice_amount, 'invoice_value', invoice_value
    ) order by work_date, id) as evidence
  from normalized
  where branch_id is not null and coalesce(invoice_key, '') <> ''
  group by branch_id, invoice_key
)
select * from groups
where registrations > 1
order by potentially_paid_registrations desc, registrations desc,
  branch_id, invoice_key;
