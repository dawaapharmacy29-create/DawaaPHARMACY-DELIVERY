-- Cumulative reconciliation for delivery cycles (26 -> 25).
-- Safe migration: preserves every upload batch/history while making the cycle invoice inventory idempotent.

alter table if exists public.monthly_system_invoices
  add column if not exists invoice_cycle_key text,
  add column if not exists first_imported_at timestamptz not null default now(),
  add column if not exists last_imported_at timestamptz not null default now(),
  add column if not exists last_seen_batch_id uuid null;

update public.monthly_system_invoices
set normalized_branch_name = coalesce(normalized_branch_name, ''),
    invoice_cycle_key = concat(period_start, '|', period_end, '|', coalesce(normalized_branch_name, ''), '|', trim(invoice_number)),
    last_seen_batch_id = coalesce(last_seen_batch_id, batch_id),
    first_imported_at = coalesce(first_imported_at, created_at, now()),
    last_imported_at = coalesce(last_imported_at, created_at, now())
where invoice_cycle_key is null
   or normalized_branch_name is null
   or last_seen_batch_id is null
   or first_imported_at is null
   or last_imported_at is null;

-- Keep the newest inventory row when the same invoice was imported more than once.
with ranked as (
  select id,
         row_number() over (
           partition by invoice_cycle_key
           order by coalesce(last_imported_at, created_at, now()) desc, created_at desc nulls last, id desc
         ) as rn
  from public.monthly_system_invoices
  where nullif(trim(invoice_number), '') is not null
)
delete from public.monthly_system_invoices target
using ranked
where target.id = ranked.id
  and ranked.rn > 1;

alter table if exists public.monthly_system_invoices
  alter column invoice_cycle_key set not null;

create unique index if not exists monthly_system_invoices_invoice_cycle_key_uidx
  on public.monthly_system_invoices(invoice_cycle_key);

create index if not exists monthly_system_invoices_cycle_invoice_idx
  on public.monthly_system_invoices(period_start, period_end, invoice_number);

alter table if exists public.monthly_invoice_reconciliation_results
  add column if not exists customer_name_mismatch boolean not null default false,
  add column if not exists app_customer_name_normalized text null,
  add column if not exists system_customer_name_normalized text null;

create index if not exists monthly_reconciliation_cycle_status_idx
  on public.monthly_invoice_reconciliation_results(period_start, period_end, match_status);

create index if not exists monthly_reconciliation_customer_mismatch_idx
  on public.monthly_invoice_reconciliation_results(period_start, period_end, customer_name_mismatch)
  where customer_name_mismatch = true;

-- Aggregate each source independently first to avoid count multiplication on joins.
create or replace view public.delivery_reconciliation_cycle_progress as
with invoice_totals as (
  select period_start,
         period_end,
         count(*)::bigint as cumulative_system_invoices,
         count(distinct batch_id)::bigint as contributing_batches,
         min(first_imported_at) as first_upload_at,
         max(last_imported_at) as last_upload_at
  from public.monthly_system_invoices
  group by period_start, period_end
), result_totals as (
  select period_start,
         period_end,
         count(*) filter (where match_status = 'matched_customer_name_mismatch')::bigint as customer_name_mismatches,
         count(*) filter (where coalesce(is_countable, false))::bigint as counted_orders,
         count(*) filter (where match_status = 'system_only')::bigint as system_only_invoices
  from public.monthly_invoice_reconciliation_results
  group by period_start, period_end
)
select i.period_start,
       i.period_end,
       i.cumulative_system_invoices,
       i.contributing_batches,
       i.first_upload_at,
       i.last_upload_at,
       coalesce(r.customer_name_mismatches, 0)::bigint as customer_name_mismatches,
       coalesce(r.counted_orders, 0)::bigint as counted_orders,
       coalesce(r.system_only_invoices, 0)::bigint as system_only_invoices
from invoice_totals i
left join result_totals r using (period_start, period_end);

comment on view public.delivery_reconciliation_cycle_progress is
  'Cumulative reconciliation progress across all uploaded files in the same 26-to-25 delivery cycle.';
