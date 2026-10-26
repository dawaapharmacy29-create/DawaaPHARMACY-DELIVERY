-- Applied additively to Delivery Production on 2026-10-26 as
-- delivery_reconciliation_secure_write_gateway_v1_20261026.
-- Final cutover must migrate all frontend callers and revoke direct table
-- writes for anon/authenticated in one coordinated release.

create schema if not exists dawaa_private;

create or replace function dawaa_private.assert_delivery_reconciliation_manager_v1(p_token text)
returns void language plpgsql security definer set search_path = '' as $body$
begin
  if auth.uid() is not null and exists (
    select 1 from public.user_profiles u
    where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'
  ) then return; end if;
  if coalesce(length(p_token), 0) >= 20 and exists (
    select 1 from public.rider_sessions s
    join public.rider_accounts a on a.id = s.account_id
    where s.session_token = p_token
      and s.expires_at > now() and s.revoked_at is null
      and coalesce(s.revoked, false) = false
      and a.role = 'general_manager' and a.status = 'active'
  ) then return; end if;
  raise exception 'not_authorized' using errcode = '42501';
end;
$body$;

revoke all on function dawaa_private.assert_delivery_reconciliation_manager_v1(text)
from public, anon, authenticated;

create or replace function dawaa_private.write_delivery_reconciliation_chunk_internal_v1(
  p_token text, p_batch_id uuid, p_kind text, p_rows jsonb
) returns integer language plpgsql security definer set search_path = '' as $body$
declare
  v_start date;
  v_end date;
  v_count integer;
begin
  perform dawaa_private.assert_delivery_reconciliation_manager_v1(p_token);
  if p_batch_id is null or p_kind is null or p_kind not in ('invoice', 'result')
    or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 40
  then raise exception 'invalid_chunk' using errcode = '22023'; end if;

  select b.period_start, b.period_end into v_start, v_end
  from public.monthly_invoice_import_batches b
  where b.id = p_batch_id and b.status = 'started'
  for update;
  if not found then raise exception 'batch_not_open' using errcode = '22023'; end if;

  if p_kind = 'invoice' then
    if exists (
      select 1 from jsonb_to_recordset(p_rows) as r(
        invoice_number text, normalized_branch_name text
      )
      group by r.invoice_number, r.normalized_branch_name having count(*) > 1
    ) then raise exception 'duplicate_invoice_in_chunk' using errcode = '23505'; end if;
    -- Normalize the cycle key server-side, regardless of client-provided fields.
    if exists (
      with incoming as (
        select r.invoice_number, r.normalized_branch_name,
          r.customer_code, r.net_total, r.gross_total,
          v_start::text || '|' || v_end::text || '|' || r.normalized_branch_name || '|' || r.invoice_number as k
        from jsonb_to_recordset(p_rows) as r(
          invoice_number text, normalized_branch_name text,
          customer_code text, net_total numeric, gross_total numeric
        )
      )
      select 1 from incoming i
      join public.monthly_system_invoices e on e.invoice_cycle_key = i.k
      where coalesce(btrim(e.customer_code), '') is distinct from coalesce(btrim(i.customer_code), '')
        or coalesce(e.net_total, e.gross_total, 0) is distinct from coalesce(i.net_total, i.gross_total, 0)
    ) then raise exception 'invoice_evidence_conflict' using errcode = '23505'; end if;

    insert into public.monthly_system_invoices (
      batch_id, period_start, period_end, invoice_number, invoice_type,
      branch_name, normalized_branch_name, customer_code, customer_name,
      customer_phone, delivery_address, invoice_date_text, gross_total,
      net_total, system_user_name, close_time_text, raw_json, invoice_cycle_key
    )
    select p_batch_id, v_start, v_end, r.invoice_number, r.invoice_type,
      r.branch_name, r.normalized_branch_name, r.customer_code, r.customer_name,
      r.customer_phone, r.delivery_address, r.invoice_date_text, r.gross_total,
      r.net_total, r.system_user_name, r.close_time_text, r.raw_json,
      v_start::text || '|' || v_end::text || '|' || r.normalized_branch_name || '|' || r.invoice_number
    from jsonb_to_recordset(p_rows) as r(
      invoice_number text, invoice_type text, branch_name text,
      normalized_branch_name text, customer_code text, customer_name text,
      customer_phone text, delivery_address text, invoice_date_text text,
      gross_total numeric, net_total numeric, system_user_name text,
      close_time_text text, raw_json jsonb
    )
    where coalesce(btrim(r.invoice_number), '') <> ''
      and coalesce(btrim(r.normalized_branch_name), '') <> ''
    on conflict (invoice_cycle_key) do nothing;
    get diagnostics v_count = row_count;

    -- Recheck AFTER ON CONFLICT: another batch may have committed a different
    -- invoice while our initial conflict lookup was waiting on its unique key.
    if exists (
      with incoming as (
        select r.invoice_number, r.normalized_branch_name,
          r.customer_code, r.net_total, r.gross_total,
          v_start::text || '|' || v_end::text || '|' || r.normalized_branch_name || '|' || r.invoice_number as k
        from jsonb_to_recordset(p_rows) as r(
          invoice_number text, normalized_branch_name text,
          customer_code text, net_total numeric, gross_total numeric
        )
      )
      select 1 from incoming i
      join public.monthly_system_invoices e on e.invoice_cycle_key = i.k
      where coalesce(btrim(e.customer_code), '') is distinct from coalesce(btrim(i.customer_code), '')
        or coalesce(e.net_total, e.gross_total, 0) is distinct from coalesce(i.net_total, i.gross_total, 0)
    ) then raise exception 'invoice_evidence_conflict' using errcode = '23505'; end if;
  else
    if exists (
      select 1 from jsonb_to_recordset(p_rows) as r(
        app_order_id uuid, invoice_number text, system_branch_name text
      )
      group by r.app_order_id, r.invoice_number, r.system_branch_name having count(*) > 1
    ) then raise exception 'duplicate_result_in_chunk' using errcode = '23505'; end if;
    -- All results are tied to this new batch, with no permission to change
    -- existing approvals, previous batches, or reviewer identities.
    insert into public.monthly_invoice_reconciliation_results (
      batch_id, period_start, period_end, invoice_number, rider_id, rider_name,
      app_order_id, match_status, difference_reason, app_amount, system_amount,
      app_customer_code, system_customer_code, app_customer_name,
      system_customer_name, app_branch_name, system_branch_name,
      is_countable, needs_review, raw_json
    )
    select p_batch_id, v_start, v_end, r.invoice_number, r.rider_id, r.rider_name,
      r.app_order_id, r.match_status, r.difference_reason, r.app_amount, r.system_amount,
      r.app_customer_code, r.system_customer_code, r.app_customer_name,
      r.system_customer_name, r.app_branch_name, r.system_branch_name,
      r.is_countable, r.needs_review, r.raw_json
    from jsonb_to_recordset(p_rows) as r(
      invoice_number text, rider_id uuid, rider_name text, app_order_id uuid,
      match_status text, difference_reason text, app_amount numeric, system_amount numeric,
      app_customer_code text, system_customer_code text, app_customer_name text,
      system_customer_name text, app_branch_name text, system_branch_name text,
      is_countable boolean, needs_review boolean, raw_json jsonb
    )
    where coalesce(r.match_status, '') <> ''
      and not exists (
        select 1 from public.monthly_invoice_reconciliation_results old
        where old.batch_id = p_batch_id
          and (
            (r.app_order_id is not null and old.app_order_id = r.app_order_id)
            or (r.app_order_id is null and old.app_order_id is null
              and old.invoice_number is not distinct from r.invoice_number
              and old.system_branch_name is not distinct from r.system_branch_name)
          )
      );
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end;
$body$;

revoke all on function dawaa_private.write_delivery_reconciliation_chunk_internal_v1(text,uuid,text,jsonb)
from public, anon, authenticated;

create or replace function public.write_delivery_reconciliation_chunk_v1(
  p_token text, p_batch_id uuid, p_kind text, p_rows jsonb
) returns integer language sql security definer set search_path = '' as $body$
  select dawaa_private.write_delivery_reconciliation_chunk_internal_v1($1,$2,$3,$4)
$body$;

revoke all on function public.write_delivery_reconciliation_chunk_v1(text,uuid,text,jsonb) from public;
grant execute on function public.write_delivery_reconciliation_chunk_v1(text,uuid,text,jsonb) to anon, authenticated;

create or replace function dawaa_private.finish_delivery_reconciliation_batch_internal_v1(
  p_token text, p_batch_id uuid, p_expected_results integer
) returns integer language plpgsql security definer set search_path = '' as $body$
declare
  v_count integer;
begin
  perform dawaa_private.assert_delivery_reconciliation_manager_v1(p_token);
  if p_expected_results is null or p_expected_results < 1 then
    raise exception 'invalid_expected_rows' using errcode = '22023'; end if;

  perform 1 from public.monthly_invoice_import_batches b
  where b.id = p_batch_id and b.status = 'started' for update;
  if not found then raise exception 'batch_not_open' using errcode = '22023'; end if;

  select count(*)::integer into v_count
  from public.monthly_invoice_reconciliation_results r where r.batch_id = p_batch_id;
  if v_count <> p_expected_results then
    raise exception 'incomplete_results_batch' using errcode = '22023'; end if;

  update public.monthly_invoice_import_batches
  set status = 'matched', matched_at = now() where id = p_batch_id;
  return v_count;
end;
$body$;

revoke all on function dawaa_private.finish_delivery_reconciliation_batch_internal_v1(text,uuid,integer)
from public, anon, authenticated;

create or replace function public.finish_delivery_reconciliation_batch_v1(
  p_token text, p_batch_id uuid, p_expected_results integer
) returns integer language sql security definer set search_path = '' as $body$
  select dawaa_private.finish_delivery_reconciliation_batch_internal_v1($1,$2,$3)
$body$;

revoke all on function public.finish_delivery_reconciliation_batch_v1(text,uuid,integer) from public;
grant execute on function public.finish_delivery_reconciliation_batch_v1(text,uuid,integer) to anon, authenticated;
