-- Enrich reconciliation upload history with the same dashboard counters used in /admin/reconciliation.
-- يعتمد على period_start/period_end الموجودة في سجل الرفع ويحسب التفاصيل من delivery_orders.
-- ملاحظة: نستخدم الأعمدة الأساسية الموجودة في delivery_orders فقط لتجنب فشل migration على اختلاف الـ schema.

create or replace function public.sync_reconciliation_upload_log_to_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery_records_count integer := 0;
  v_review_count integer := 0;
  v_not_found_count integer := 0;
  v_duplicates_count integer := 0;
  v_failed_count integer := 0;
  v_saved_deleted_count integer := 0;
  v_risk_count integer := 0;
  v_multiplier_1_5_count integer := 0;
  v_delivery_sales_total numeric(14,2) := 0;
  v_total_sales numeric(14,2) := 0;
begin
  if new.period_start is not null and new.period_end is not null then
    select
      count(*)::integer,
      count(*) filter (
        where coalesce((o.final_count_status)::text, '') like 'pending%'
           or (coalesce(o.is_countable, false) = false and coalesce(o.status, '') <> 'failed' and o.deleted_at is null)
      )::integer,
      count(*) filter (where coalesce(o.bconnect_match_status, '') = 'invoice_not_found')::integer,
      count(*) filter (where coalesce(o.is_duplicate_invoice, false) = true)::integer,
      count(*) filter (where coalesce(o.status, '') = 'failed')::integer,
      count(*) filter (where o.deleted_at is not null)::integer,
      count(*) filter (where coalesce(o.order_multiplier, 1) >= 1.5)::integer,
      coalesce(sum(coalesce(o.invoice_amount, 0)), 0)::numeric(14,2),
      coalesce(sum(coalesce(o.invoice_amount, 0)), 0)::numeric(14,2)
    into
      v_delivery_records_count,
      v_review_count,
      v_not_found_count,
      v_duplicates_count,
      v_failed_count,
      v_saved_deleted_count,
      v_multiplier_1_5_count,
      v_delivery_sales_total,
      v_total_sales
    from public.delivery_orders o
    where o.delivery_date >= new.period_start
      and o.delivery_date <= new.period_end;

    -- احسب التكرار الحقيقي من أرقام الفواتير حتى لو is_duplicate_invoice لم يتم تحديثه لبعض السجلات.
    select greatest(v_duplicates_count, coalesce(sum(cnt), 0)::integer)
    into v_duplicates_count
    from (
      select count(*)::integer as cnt
      from public.delivery_orders o
      where o.delivery_date >= new.period_start
        and o.delivery_date <= new.period_end
        and o.deleted_at is null
        and nullif(regexp_replace(coalesce(o.invoice_number, ''), '[^0-9A-Za-zء-ي-]', '', 'g'), '') is not null
      group by regexp_replace(coalesce(o.invoice_number, ''), '[^0-9A-Za-zء-ي-]', '', 'g')
      having count(*) > 1
    ) d;
  end if;

  v_risk_count := coalesce(v_failed_count, 0) + coalesce(v_not_found_count, 0) + coalesce(v_duplicates_count, 0) + coalesce(v_saved_deleted_count, 0);

  new.uploaded_at := coalesce(new.uploaded_at, now());
  new.rows_count := coalesce(new.rows_count, 0);
  new.matched_count := coalesce(new.matched_count, 0);
  new.unmatched_count := coalesce(new.unmatched_count, 0);
  new.last_reconciliation_day := coalesce(new.last_reconciliation_day, new.match_date, new.period_end);
  new.delivery_records_count := coalesce(nullif(new.delivery_records_count, 0), v_delivery_records_count, 0);
  new.bconnect_invoices_count := coalesce(nullif(new.bconnect_invoices_count, 0), nullif(new.rows_count, 0), 0);
  new.review_count := coalesce(nullif(new.review_count, 0), v_review_count, 0);
  new.not_found_count := coalesce(nullif(new.not_found_count, 0), v_not_found_count, 0);
  new.duplicates_count := coalesce(nullif(new.duplicates_count, 0), v_duplicates_count, 0);
  new.failed_count := coalesce(nullif(new.failed_count, 0), v_failed_count, 0);
  new.saved_deleted_count := coalesce(nullif(new.saved_deleted_count, 0), v_saved_deleted_count, 0);
  new.risk_count := coalesce(nullif(new.risk_count, 0), v_risk_count, 0);
  new.multiplier_1_5_count := coalesce(nullif(new.multiplier_1_5_count, 0), v_multiplier_1_5_count, 0);
  new.cash_sales_total := coalesce(new.cash_sales_total, 0);
  new.delivery_sales_total := coalesce(nullif(new.delivery_sales_total, 0), v_delivery_sales_total, 0);
  new.total_sales := coalesce(nullif(new.total_sales, 0), v_total_sales, 0);
  new.summary_json := coalesce(new.summary_json, '{}'::jsonb)
    || jsonb_build_object(
      'delivery_records_count', new.delivery_records_count,
      'bconnect_invoices_count', new.bconnect_invoices_count,
      'matched_count', new.matched_count,
      'unmatched_count', new.unmatched_count,
      'review_count', new.review_count,
      'not_found_count', new.not_found_count,
      'duplicates_count', new.duplicates_count,
      'failed_count', new.failed_count,
      'saved_deleted_count', new.saved_deleted_count,
      'risk_count', new.risk_count,
      'multiplier_1_5_count', new.multiplier_1_5_count,
      'delivery_sales_total', new.delivery_sales_total,
      'total_sales', new.total_sales
    );

  insert into public.reconciliation_upload_history (
    id,
    uploaded_at,
    file_name,
    match_date,
    period_start,
    period_end,
    rows_count,
    matched_count,
    unmatched_count,
    uploaded_by,
    notes,
    last_reconciliation_day,
    delivery_records_count,
    bconnect_invoices_count,
    review_count,
    not_found_count,
    duplicates_count,
    failed_count,
    saved_deleted_count,
    risk_count,
    multiplier_1_5_count,
    cash_sales_total,
    delivery_sales_total,
    total_sales,
    summary_json
  ) values (
    new.id,
    new.uploaded_at,
    new.file_name,
    new.match_date,
    new.period_start,
    new.period_end,
    new.rows_count,
    new.matched_count,
    new.unmatched_count,
    new.uploaded_by,
    new.notes,
    new.last_reconciliation_day,
    new.delivery_records_count,
    new.bconnect_invoices_count,
    new.review_count,
    new.not_found_count,
    new.duplicates_count,
    new.failed_count,
    new.saved_deleted_count,
    new.risk_count,
    new.multiplier_1_5_count,
    new.cash_sales_total,
    new.delivery_sales_total,
    new.total_sales,
    new.summary_json
  )
  on conflict (id) do update set
    uploaded_at = excluded.uploaded_at,
    file_name = excluded.file_name,
    match_date = excluded.match_date,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    rows_count = excluded.rows_count,
    matched_count = excluded.matched_count,
    unmatched_count = excluded.unmatched_count,
    uploaded_by = excluded.uploaded_by,
    notes = excluded.notes,
    last_reconciliation_day = excluded.last_reconciliation_day,
    delivery_records_count = excluded.delivery_records_count,
    bconnect_invoices_count = excluded.bconnect_invoices_count,
    review_count = excluded.review_count,
    not_found_count = excluded.not_found_count,
    duplicates_count = excluded.duplicates_count,
    failed_count = excluded.failed_count,
    saved_deleted_count = excluded.saved_deleted_count,
    risk_count = excluded.risk_count,
    multiplier_1_5_count = excluded.multiplier_1_5_count,
    cash_sales_total = excluded.cash_sales_total,
    delivery_sales_total = excluded.delivery_sales_total,
    total_sales = excluded.total_sales,
    summary_json = excluded.summary_json;

  return new;
end;
$$;

drop trigger if exists trg_sync_reconciliation_upload_log_to_history on public.reconciliation_upload_log;
create trigger trg_sync_reconciliation_upload_log_to_history
before insert or update on public.reconciliation_upload_log
for each row execute function public.sync_reconciliation_upload_log_to_history();

-- Re-sync old records so history gets the enriched summary_json/counts.
update public.reconciliation_upload_log
set notes = notes
where period_start is not null
  and period_end is not null;
