create table if not exists reconciliation_upload_log (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  file_name text,
  match_date date,
  period_start date,
  period_end date,
  rows_count integer not null default 0,
  matched_count integer not null default 0,
  unmatched_count integer not null default 0,
  uploaded_by text,
  notes text
);

create index if not exists idx_reconciliation_upload_log_uploaded_at on reconciliation_upload_log (uploaded_at desc);
create index if not exists idx_reconciliation_upload_log_match_date on reconciliation_upload_log (match_date desc);

create or replace view reconciliation_upload_history as
select
  id,
  uploaded_at,
  uploaded_at::date as upload_date,
  coalesce(file_name, 'ملف مطابقة') as file_name,
  match_date,
  period_start,
  period_end,
  rows_count,
  matched_count,
  unmatched_count,
  uploaded_by,
  notes,
  coalesce(match_date, period_end, uploaded_at::date) as last_reconciliation_day
from reconciliation_upload_log
order by uploaded_at desc;
