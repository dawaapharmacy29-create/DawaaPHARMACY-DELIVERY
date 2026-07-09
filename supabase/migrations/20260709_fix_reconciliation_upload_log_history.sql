-- Fix reconciliation upload log/history persistence for /admin/reconciliation
-- المشكلة:
-- - صفحة المطابقة تقرأ آخر سجل من reconciliation_upload_history.
-- - رفع ملف B-Connect يحفظ السجل في reconciliation_upload_log.
-- - لذلك يظهر كارت "سجل آخر مطابقة" فارغًا رغم وجود سجلات في reconciliation_upload_log.
--
-- هذا migration آمن:
-- 1) لا يحذف أي بيانات قديمة.
-- 2) يضمن وجود الجدولين والأعمدة القديمة والجديدة.
-- 3) ينسخ السجلات القديمة من reconciliation_upload_log إلى reconciliation_upload_history.
-- 4) يضيف trigger يجعل أي سجل جديد في reconciliation_upload_log يتنسخ تلقائيًا إلى reconciliation_upload_history.

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

create table if not exists public.reconciliation_upload_history (
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
  notes text null,
  last_reconciliation_day date null
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

alter table public.reconciliation_upload_history
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

create index if not exists idx_reconciliation_upload_history_uploaded_at
  on public.reconciliation_upload_history (uploaded_at desc);

create index if not exists idx_reconciliation_upload_history_period
  on public.reconciliation_upload_history (period_start, period_end);

-- Backfill: انسخ السجلات القديمة من log إلى history حتى تظهر في كارت آخر مطابقة.
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
)
select
  l.id,
  l.uploaded_at,
  l.file_name,
  l.match_date,
  l.period_start,
  l.period_end,
  coalesce(l.rows_count, 0),
  coalesce(l.matched_count, 0),
  coalesce(l.unmatched_count, 0),
  l.uploaded_by,
  l.notes,
  coalesce(l.last_reconciliation_day, l.match_date),
  coalesce(nullif(l.delivery_records_count, 0), 0),
  coalesce(nullif(l.bconnect_invoices_count, 0), nullif(l.rows_count, 0), 0),
  coalesce(l.review_count, 0),
  coalesce(l.not_found_count, 0),
  coalesce(l.duplicates_count, 0),
  coalesce(l.failed_count, 0),
  coalesce(l.saved_deleted_count, 0),
  coalesce(l.risk_count, 0),
  coalesce(l.multiplier_1_5_count, 0),
  coalesce(l.cash_sales_total, 0),
  coalesce(l.delivery_sales_total, 0),
  coalesce(l.total_sales, 0),
  coalesce(l.summary_json, '{}'::jsonb)
from public.reconciliation_upload_log l
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

create or replace function public.sync_reconciliation_upload_log_to_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    coalesce(new.uploaded_at, now()),
    new.file_name,
    new.match_date,
    new.period_start,
    new.period_end,
    coalesce(new.rows_count, 0),
    coalesce(new.matched_count, 0),
    coalesce(new.unmatched_count, 0),
    new.uploaded_by,
    new.notes,
    coalesce(new.last_reconciliation_day, new.match_date),
    coalesce(new.delivery_records_count, 0),
    coalesce(nullif(new.bconnect_invoices_count, 0), nullif(new.rows_count, 0), 0),
    coalesce(new.review_count, 0),
    coalesce(new.not_found_count, 0),
    coalesce(new.duplicates_count, 0),
    coalesce(new.failed_count, 0),
    coalesce(new.saved_deleted_count, 0),
    coalesce(new.risk_count, 0),
    coalesce(new.multiplier_1_5_count, 0),
    coalesce(new.cash_sales_total, 0),
    coalesce(new.delivery_sales_total, 0),
    coalesce(new.total_sales, 0),
    coalesce(new.summary_json, '{}'::jsonb)
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
after insert or update on public.reconciliation_upload_log
for each row execute function public.sync_reconciliation_upload_log_to_history();

-- Policies مرنة للقراءة من لوحة الإدارة. لا تفعل RLS لو لم تكن مفعلة عندك بالفعل.
do $$
begin
  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'reconciliation_upload_history'
      and rowsecurity = true
  ) then
    drop policy if exists "Allow reconciliation history read" on public.reconciliation_upload_history;
    create policy "Allow reconciliation history read"
      on public.reconciliation_upload_history
      for select
      using (true);
  end if;

  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'reconciliation_upload_log'
      and rowsecurity = true
  ) then
    drop policy if exists "Allow reconciliation log read" on public.reconciliation_upload_log;
    create policy "Allow reconciliation log read"
      on public.reconciliation_upload_log
      for select
      using (true);

    drop policy if exists "Allow reconciliation log insert" on public.reconciliation_upload_log;
    create policy "Allow reconciliation log insert"
      on public.reconciliation_upload_log
      for insert
      with check (true);
  end if;
end $$;
