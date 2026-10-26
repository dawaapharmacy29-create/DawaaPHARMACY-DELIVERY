-- Applied additively to Delivery Production on 2026-10-25 as
-- delivery_invoice_batch_manager_guard_v2_20261025.
-- Replacement for the unsafe batch-creation entry point.
-- Do not revoke the legacy entry point until every caller has migrated.
-- Do not treat this alone as closing direct table-write permissions.

create schema if not exists dawaa_private;

create or replace function dawaa_private.save_monthly_invoice_import_batch_internal_v2(
  p_session_token text,
  p_period_start date,
  p_period_end date,
  p_file_name text,
  p_total_rows integer,
  p_delivery_rows integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_authorized boolean := false;
  v_batch_id uuid;
begin
  if p_period_start is null or p_period_end is null
    or extract(day from p_period_start) <> 26
    or p_period_end <> (p_period_start + interval '1 month' - interval '1 day')::date
  then
    raise exception 'invalid_cycle' using errcode = '22023';
  end if;

  if p_total_rows is null or p_delivery_rows is null
    or p_total_rows < 0 or p_delivery_rows < 1
    or p_delivery_rows > p_total_rows
    or coalesce(length(btrim(p_file_name)), 0) = 0
    or length(p_file_name) > 255
  then
    raise exception 'invalid_batch_metadata' using errcode = '22023';
  end if;

  if auth.uid() is not null then
    select exists (
      select 1 from public.user_profiles u
      where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'
    ) into v_authorized;
  end if;

  if not v_authorized and coalesce(length(p_session_token), 0) >= 20 then
    select exists (
      select 1
      from public.rider_sessions s
      join public.rider_accounts a on a.id = s.account_id
      where s.session_token = p_session_token
        and s.expires_at > now()
        and s.revoked_at is null
        and coalesce(s.revoked, false) = false
        and a.status = 'active'
        and a.role = 'general_manager'
    ) into v_authorized;
  end if;

  if not v_authorized then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Append-only: never garbage-collect old batches or their dependent invoices.
  insert into public.monthly_invoice_import_batches (
    period_start, period_end, file_name, total_rows, delivery_rows,
    uploaded_by, uploaded_by_name, status, created_at, matched_at
  ) values (
    p_period_start, p_period_end, p_file_name, p_total_rows, p_delivery_rows,
    auth.uid(), 'verified_manager', 'started', now(), null
  ) returning id into v_batch_id;

  return v_batch_id;
end;
$body$;

revoke all on function dawaa_private.save_monthly_invoice_import_batch_internal_v2(
  text, date, date, text, integer, integer
) from public, anon, authenticated;

create or replace function public.save_monthly_invoice_import_batch_v2(
  p_session_token text,
  p_period_start date,
  p_period_end date,
  p_file_name text,
  p_total_rows integer,
  p_delivery_rows integer
) returns uuid
language sql
security definer
set search_path = ''
as $body$
  select dawaa_private.save_monthly_invoice_import_batch_internal_v2(
    p_session_token, p_period_start, p_period_end,
    p_file_name, p_total_rows, p_delivery_rows
  )
$body$;

revoke all on function public.save_monthly_invoice_import_batch_v2(
  text, date, date, text, integer, integer
) from public;
grant execute on function public.save_monthly_invoice_import_batch_v2(
  text, date, date, text, integer, integer
) to anon, authenticated;

-- Public wrapper is SECURITY DEFINER only to enter the unexposed private
-- function. The private function performs authorization before any mutation.
