-- Fix foreign key failure when inserting monthly_system_invoices after an interrupted reconciliation upload.
--
-- The previous safety patch returned a new batch_id but only inserted into a guessed parent table name.
-- Some databases have monthly_system_invoices.batch_id referencing a different parent table.
-- This function now detects the actual FK parent table/column from monthly_system_invoices_batch_id_fkey
-- and creates the parent row before monthly_system_invoices insert starts.

create extension if not exists pgcrypto;

create or replace function public.save_monthly_invoice_import_batch(
  p_period_start date,
  p_period_end date,
  p_file_name text,
  p_total_rows integer,
  p_delivery_rows integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_stale_batch_ids uuid[] := array[]::uuid[];
  v_parent_table text;
  v_parent_column text;
  v_parent_payload jsonb;
begin
  -- Detect the real parent table of monthly_system_invoices.batch_id.
  select c.confrelid::regclass::text, a.attname
    into v_parent_table, v_parent_column
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.confrelid
   and a.attnum = c.confkey[1]
  where c.conname = 'monthly_system_invoices_batch_id_fkey'
    and c.conrelid = 'public.monthly_system_invoices'::regclass
  limit 1;

  -- Clean very recent unfinished attempts for the same period/file only.
  -- This does not touch older historical batches.
  select coalesce(array_agg(distinct m.batch_id), array[]::uuid[])
    into v_stale_batch_ids
  from public.monthly_system_invoices m
  where m.period_start = p_period_start
    and m.period_end = p_period_end
    and m.batch_id is not null
    and m.created_at >= now() - interval '12 hours'
    and not exists (
      select 1
      from public.reconciliation_upload_log l
      where l.period_start = p_period_start
        and l.period_end = p_period_end
        and l.uploaded_at >= m.created_at
        and coalesce(l.file_name, '') = coalesce(p_file_name, '')
    );

  if coalesce(array_length(v_stale_batch_ids, 1), 0) > 0 then
    delete from public.monthly_invoice_reconciliation_results
    where batch_id = any(v_stale_batch_ids);

    delete from public.monthly_system_invoices
    where batch_id = any(v_stale_batch_ids);
  end if;

  -- Create the required parent row for the FK.
  -- jsonb_populate_record safely ignores columns that do not exist in the actual parent table.
  if v_parent_table is not null and v_parent_column is not null then
    v_parent_payload := jsonb_build_object(
      v_parent_column, v_batch_id,
      'id', v_batch_id,
      'batch_id', v_batch_id,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'file_name', p_file_name,
      'source_file_name', p_file_name,
      'total_rows', p_total_rows,
      'rows_count', p_total_rows,
      'delivery_rows', p_delivery_rows,
      'delivery_rows_count', p_delivery_rows,
      'status', 'started',
      'created_at', now(),
      'uploaded_at', now(),
      'notes', 'started from reconciliation page'
    );

    execute format(
      'insert into %s select * from jsonb_populate_record(null::%s, $1) on conflict do nothing',
      v_parent_table,
      v_parent_table
    ) using v_parent_payload;
  end if;

  return v_batch_id;
end;
$$;

grant execute on function public.save_monthly_invoice_import_batch(date, date, text, integer, integer) to anon, authenticated;
