-- Safe fix for projects where public.reconciliation_upload_history is a VIEW, not a table.
-- شغّل هذا الملف فقط بعد ظهور الخطأ:
-- ALTER action ADD COLUMN cannot be performed on relation "reconciliation_upload_history" because it is a view.
--
-- الفكرة:
-- - جدول reconciliation_upload_log هو المصدر الحقيقي للسجل.
-- - لو reconciliation_upload_history عبارة عن view، نعيد بناءها كـ view تقرأ من reconciliation_upload_log.
-- - لا نحاول عمل ALTER COLUMN على view.

create extension if not exists pgcrypto;

create table if not exists public.reconciliation_upload_log (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  file_name text null,
  match_date date null,
  period_start date null,
  period_end date null,
  rows_count integer not null default 0,
  matched_count integer not null default 0,
  unmatched_count integer not null default 0,
  uploaded_by text null,
  notes text null
);

alter table public.reconciliation_upload_log
  add column if not exists uploaded_at timestamptz not null default now(),
  add column if not exists file_name text null,
  add column if not exists match_date date null,
  add column if not exists period_start date null,
  add column if not exists period_end date null,
  add column if not exists rows_count integer not null default 0,
  add column if not exists matched_count integer not null default 0,
  add column if not exists unmatched_count integer not null default 0,
  add column if not exists uploaded_by text null,
  add column if not exists notes text null,
  add column if not exists last_reconciliation_day date null,
  add column if not exists delivery_records_count integer not null default 0,
  add column if not exists bconnect_invoices_count integer not null default 0,
  add column if not exists review_count integer not null default 0,
  add column if not exists not_found_count integer not null default 0,
  add column if not exists duplicates_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists saved_deleted_count integer not null default 0,
  add column if not exists risk_count integer not null default 0,
  add column if not exists multiplier_1_5_count integer not null default 0,
  add column if not exists cash_sales_total numeric(14,2) not null default 0,
  add column if not exists delivery_sales_total numeric(14,2) not null default 0,
  add column if not exists total_sales numeric(14,2) not null default 0,
  add column if not exists summary_json jsonb not null default '{}'::jsonb;

create index if not exists idx_reconciliation_upload_log_uploaded_at
  on public.reconciliation_upload_log (uploaded_at desc);

-- لو history موجودة كـ VIEW أو MATERIALIZED VIEW، احذفها فقط وأعد إنشاءها كـ VIEW من log.
do $$
declare
  v_relkind char;
begin
  select c.relkind
  into v_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'reconciliation_upload_history';

  if v_relkind = 'v' then
    drop view if exists public.reconciliation_upload_history;
  elsif v_relkind = 'm' then
    drop materialized view if exists public.reconciliation_upload_history;
  elsif v_relkind is null then
    -- لا يوجد relation بهذا الاسم، سننشئ view بعد الـ block.
    null;
  elsif v_relkind = 'r' then
    -- لو عند نسخة أخرى history جدول حقيقي، لا نلمسه هنا حتى لا نكسر بياناته.
    null;
  else
    raise notice 'public.reconciliation_upload_history exists with relkind %, leaving it unchanged', v_relkind;
  end if;
end $$;

-- أنشئ الـ view فقط إذا لم يكن هناك جدول حقيقي بنفس الاسم.
do $$
declare
  v_relkind char;
begin
  select c.relkind
  into v_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'reconciliation_upload_history';

  if v_relkind is null then
    execute $view$
      create view public.reconciliation_upload_history as
      select
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
        coalesce(last_reconciliation_day, match_date, period_end) as last_reconciliation_day,
        coalesce(delivery_records_count, 0) as delivery_records_count,
        coalesce(nullif(bconnect_invoices_count, 0), nullif(rows_count, 0), 0) as bconnect_invoices_count,
        coalesce(review_count, 0) as review_count,
        coalesce(not_found_count, 0) as not_found_count,
        coalesce(duplicates_count, 0) as duplicates_count,
        coalesce(failed_count, 0) as failed_count,
        coalesce(saved_deleted_count, 0) as saved_deleted_count,
        coalesce(risk_count, 0) as risk_count,
        coalesce(multiplier_1_5_count, 0) as multiplier_1_5_count,
        coalesce(cash_sales_total, 0) as cash_sales_total,
        coalesce(delivery_sales_total, 0) as delivery_sales_total,
        coalesce(total_sales, 0) as total_sales,
        coalesce(summary_json, '{}'::jsonb) as summary_json
      from public.reconciliation_upload_log
    $view$;
  end if;
end $$;

-- Trigger يحسب ويخزن ملخص أساسي داخل reconciliation_upload_log نفسه.
create or replace function public.enrich_reconciliation_upload_log()
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
      coalesce(sum(coalesce(o.invoice_amount, 0)), 0)::numeric(14,2)
    into
      v_delivery_records_count,
      v_review_count,
      v_not_found_count,
      v_duplicates_count,
      v_failed_count,
      v_saved_deleted_count,
      v_multiplier_1_5_count,
      v_delivery_sales_total
    from public.delivery_orders o
    where o.delivery_date >= new.period_start
      and o.delivery_date <= new.period_end;
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
  new.delivery_sales_total := coalesce(nullif(new.delivery_sales_total, 0), v_delivery_sales_total, 0);
  new.total_sales := coalesce(nullif(new.total_sales, 0), v_delivery_sales_total, 0);
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

  return new;
end;
$$;

drop trigger if exists trg_enrich_reconciliation_upload_log on public.reconciliation_upload_log;
create trigger trg_enrich_reconciliation_upload_log
before insert or update on public.reconciliation_upload_log
for each row execute function public.enrich_reconciliation_upload_log();

-- حدث السجلات القديمة عشان الـ view يعرض تفاصيلها.
update public.reconciliation_upload_log
set notes = notes
where period_start is not null
  and period_end is not null;

grant select on public.reconciliation_upload_history to anon, authenticated;
grant select, insert, update on public.reconciliation_upload_log to anon, authenticated;
