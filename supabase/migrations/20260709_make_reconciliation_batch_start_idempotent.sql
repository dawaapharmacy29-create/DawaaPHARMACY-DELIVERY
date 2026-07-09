-- Make the start of B-Connect reconciliation safer after network interruptions.
--
-- المشكلة التي ظهرت:
-- - صفحة المطابقة تنشئ batch_id ثم تحفظ monthly_system_invoices و monthly_invoice_reconciliation_results.
-- - لو الشبكة قطعت قبل حفظ reconciliation_upload_log، تبقى بيانات جزئية/مكررة بلا سجل نهائي.
--
-- هذا التعديل يجعل بداية الرفع idempotent جزئيًا:
-- - عند بدء رفع جديد لنفس الفترة، يتم تنظيف batches حديثة جدًا لنفس الفترة لم يظهر لها سجل نهائي في reconciliation_upload_log.
-- - لا يلمس الدُفعات القديمة خارج نافذة زمنية قصيرة حتى لا يمسح أرشيف سابق بالخطأ.
-- - يرجع batch_id جديد للواجهة كما هو متوقع.

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
begin
  -- تنظيف محاولات الرفع الحديثة غير المكتملة لنفس الفترة.
  -- نعتبرها غير مكتملة إذا لم يوجد سجل نهائي حديث في reconciliation_upload_log بنفس الفترة بعد إنشاء الـ batch.
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

  -- لو عند نسخة مستقبلية فيها جدول batches حقيقي، اكتب فيه بدون كسر النسخ التي لا تحتوي عليه.
  if to_regclass('public.monthly_invoice_reconciliation_batches') is not null then
    execute '
      insert into public.monthly_invoice_reconciliation_batches (id, period_start, period_end, file_name, total_rows, delivery_rows, status, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, now())
    ' using v_batch_id, p_period_start, p_period_end, p_file_name, p_total_rows, p_delivery_rows, 'started';
  end if;

  return v_batch_id;
end;
$$;

grant execute on function public.save_monthly_invoice_import_batch(date, date, text, integer, integer) to anon, authenticated;
