-- Cumulative reconciliation for delivery cycles (26 -> 25).
-- Safe migration: preserves upload batches/history while making the cycle invoice inventory idempotent.

alter table if exists public.monthly_system_invoices
  add column if not exists first_imported_at timestamptz not null default now(),
  add column if not exists last_imported_at timestamptz not null default now(),
  add column if not exists last_seen_batch_id uuid null;

update public.monthly_system_invoices
set last_seen_batch_id = coalesce(last_seen_batch_id, batch_id),
    first_imported_at = coalesce(first_imported_at, created_at, now()),
    last_imported_at = coalesce(last_imported_at, created_at, now())
where last_seen_batch_id is null
   or first_imported_at is null
   or last_imported_at is null;

-- Remove only duplicate inventory rows for the same cycle/branch/invoice.
-- Keep the newest row because later partial uploads may contain corrected customer data.
with ranked as (
  select id,
         row_number() over (
           partition by period_start, period_end, coalesce(normalized_branch_name, ''), invoice_number
           order by coalesce(last_imported_at, created_at, now()) desc, created_at desc nulls last, id desc
         ) as rn
  from public.monthly_system_invoices
  where nullif(trim(invoice_number), '') is not null
)
delete from public.monthly_system_invoices target
using ranked
where target.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists monthly_system_invoices_cycle_branch_invoice_uidx
  on public.monthly_system_invoices(period_start, period_end, normalized_branch_name, invoice_number)
  where nullif(trim(invoice_number), '') is not null;

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

-- Expose cumulative progress per cycle without replacing prior upload history.
create or replace view public.delivery_reconciliation_cycle_progress as
select
  i.period_start,
  i.period_end,
  count(*)::bigint as cumulative_system_invoices,
  count(distinct i.batch_id)::bigint as contributing_batches,
  min(i.first_imported_at) as first_upload_at,
  max(i.last_imported_at) as last_upload_at,
  count(*) filter (where r.match_status = 'matched_customer_name_mismatch')::bigint as customer_name_mismatches,
  count(*) filter (where coalesce(r.is_countable, false))::bigint as counted_orders,
  count(*) filter (where r.match_status = 'system_only')::bigint as system_only_invoices
from public.monthly_system_invoices i
left join public.monthly_invoice_reconciliation_results r
  on r.period_start = i.period_start
 and r.period_end = i.period_end
 and r.invoice_number = i.invoice_number
group by i.period_start, i.period_end;

comment on view public.delivery_reconciliation_cycle_progress is
  'Cumulative reconciliation progress across all uploaded files in the same 26-to-25 delivery cycle.';
