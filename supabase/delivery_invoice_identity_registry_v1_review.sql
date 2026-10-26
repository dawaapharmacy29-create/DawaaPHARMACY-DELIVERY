-- REVIEW ONLY: DO NOT APPLY TO PRODUCTION.
-- Found historical duplicate keys and direct delivery_orders writes.
-- These tables are an additive foundation; no data migrations, grants or cutover.
-- Never use the work date or rider identity as part of the invoice key.

create schema if not exists dawaa_private;

-- Normalize both Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Eastern Arabic-Indic
-- (۰۱۲۳۴۵۶۷۸۹) to ASCII BEFORE the existing public normalizer strips
-- non-ASCII characters. Historical rows keep their original display text.
create or replace function dawaa_private.delivery_invoice_key_v1(p_value text)
returns text language sql immutable security invoker set search_path = '' as $body$
  select public.normalize_delivery_reconciliation_invoice(
    pg_catalog.translate($1, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))
$body$;
revoke all on function dawaa_private.delivery_invoice_key_v1(text)
  from public, anon, authenticated;

-- One commercial invoice identity for (branch, normalized invoice) for all time.
-- A null canonical_order_id means the historical identity is unresolved;
-- do not pick one of the existing duplicate orders silently.
create table if not exists dawaa_private.delivery_invoice_identities_v1 (
  id bigint generated always as identity primary key,
  branch_id uuid not null references public.branches(id),
  invoice_key text not null check (invoice_key <> ''),
  canonical_order_id text null references public.delivery_orders(id),
  review_state text not null default 'unresolved'
    check (review_state in ('unresolved', 'verified')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (branch_id, invoice_key),
  constraint verified_needs_order check
    (review_state <> 'verified' or canonical_order_id is not null)
);

-- An attempted/repeated visit is not a second invoice or a second sale.
-- Approval of a physical visit must be separate from financial counting.
create table if not exists dawaa_private.delivery_invoice_visit_events_v1 (
  id bigint generated always as identity primary key,
  invoice_identity_id bigint not null
    references dawaa_private.delivery_invoice_identities_v1(id),
  rider_id uuid not null references public.riders(id),
  client_request_id text not null check (length(btrim(client_request_id)) >= 12),
  event_kind text not null
    check (event_kind in ('duplicate_attempt', 'rescheduled_visit', 'visit_completed', 'visit_cancelled')),
  reason text not null check (length(btrim(reason)) > 0),
  note text,
  related_legacy_order_id text references public.delivery_orders(id),
  visit_credit_status text not null default 'pending'
    check (visit_credit_status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_evidence text,
  rejection_reason text,
  -- No invoice amount here: commercial value always belongs to the identity.
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (rider_id, client_request_id)
);

-- Private by default; never grant raw table writes to a browser client.
revoke all on dawaa_private.delivery_invoice_identities_v1 from public, anon, authenticated;
revoke all on dawaa_private.delivery_invoice_visit_events_v1 from public, anon, authenticated;

-- Required before activation (not performed by this review file):
-- 1. Read-only mapping of all branch/invoice keys, classify 280 duplicate keys.
-- 2. Authenticated transactional RPC: branch from verified rider session, never client input.
-- 3. Acquire identity row lock or use unique-key insert on conflict, then append visit event.
-- 4. Block every direct INSERT/UPDATE bypass through grants/policies and existing RPCs.
-- 5. Preserve existing order/visit history and add read-side compatibility for reports.
-- 6. Verify cross-day, cross-branch, concurrency, manager audit and payroll calculations.
