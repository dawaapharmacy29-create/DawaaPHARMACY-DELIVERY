-- Management → delivery invoice sync: match on the invoice number (with branch and date), not on its value.
-- Decided by the owner on 2026-11-05: «خلي الاعتماد يركز على رقم الفاتورة، قيمة الفاتورة مش مهمة».
--
-- Before: one invoice whose value, customer code or date changed after it was first sent (a return or an edit)
-- raised invoice_evidence_conflict_requires_review and stopped the whole cycle's sync (stuck from 2026-11-03
-- because of one invoice, شكري 80764: 770 → 210).
-- Now:
--   1. A changed invoice updates its stored evidence (code, value, date, name) instead of stopping the batch.
--   2. An order whose invoice number + branch + date match is counted; a different value, customer code or
--      phone no longer sends it to manual review. Human decisions and the earning / rider guards are unchanged.

do $migration$
declare
  v_def text := pg_get_functiondef(
    'public.ingest_management_invoice_snapshot_v1(text,date,date,bigint,jsonb,boolean)'::regprocedure);
  v_from int;
  v_to int;
  v_old text;
begin
  -- 1a. Drop the first conflict check (before the dry-run return).
  v_from := strpos(v_def, ' -- A changed customer, value or date is a correction proposal');
  v_to := strpos(v_def, ' if p_dry_run then');
  if v_from = 0 or v_to = 0 or v_to < v_from then raise exception 'patch_1a_not_found'; end if;
  v_def := overlay(v_def placing '' from v_from for v_to - v_from);

  -- 1b. Drop the post-insert recheck.
  v_from := strpos(v_def, ' -- The unique-key wait above may have raced another import.');
  v_to := strpos(v_def, ' for o in select d.*');
  if v_from = 0 or v_to = 0 or v_to < v_from then raise exception 'patch_1b_not_found'; end if;
  v_def := overlay(v_def placing '' from v_from for v_to - v_from);

  -- 1c. Keep the stored evidence current when the same invoice number comes back with new details.
  v_old := 'from pg_temp.management_invoice_work on conflict(invoice_cycle_key) do nothing;';
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'patch_1c_not_found';
  end if;
  v_def := replace(v_def, v_old,
    'from pg_temp.management_invoice_work on conflict(invoice_cycle_key) do update set'
    || ' customer_code=excluded.customer_code,customer_name=excluded.customer_name,customer_phone=excluded.customer_phone,'
    || 'delivery_address=excluded.delivery_address,invoice_type=excluded.invoice_type,invoice_date_text=excluded.invoice_date_text,'
    || 'gross_total=excluded.gross_total,net_total=excluded.net_total,system_user_name=excluded.system_user_name,'
    || 'last_seen_batch_id=excluded.last_seen_batch_id'
    || ' where (monthly_system_invoices.customer_code,monthly_system_invoices.net_total,monthly_system_invoices.invoice_date_text,'
    || 'monthly_system_invoices.customer_name) is distinct from'
    || ' (excluded.customer_code,excluded.net_total,excluded.invoice_date_text,excluded.customer_name);');

  -- 2. A matching number + branch + date is enough: no review for a different value, code or phone.
  v_from := strpos(v_def, '   if (nullif(trim(coalesce(nullif(o.customer_code_snapshot');
  v_to := strpos(v_def, '   elsif v_dup then');
  if v_from = 0 or v_to = 0 or v_to < v_from then raise exception 'patch_2_not_found'; end if;
  v_def := overlay(v_def placing '   if false then null;' || chr(10) from v_from for v_to - v_from);
  v_def := replace(v_def, 'مطابقة تلقائية: رقم الفاتورة + الفرع + التاريخ مع تحقق العميل والقيمة',
    'مطابقة تلقائية: رقم الفاتورة + الفرع + التاريخ');

  execute v_def;
end;
$migration$;
