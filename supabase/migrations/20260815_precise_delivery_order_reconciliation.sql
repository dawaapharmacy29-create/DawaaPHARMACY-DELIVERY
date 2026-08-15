-- Precise delivery reconciliation hardening (2026-08-15)
-- Goals:
-- 1) canonical branch identity comes from branch_id, not stale branch text;
-- 2) cumulative B-Connect uploads are safe to upsert by cycle+branch+invoice;
-- 3) matching is server-side and branch-aware, with date/customer/amount checks;
-- 4) duplicate validation does not block unrelated reconciliation updates.

create or replace function public.normalize_delivery_reconciliation_invoice(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(regexp_replace(trim(coalesce(p_value, '')), '\.0$', ''), '[^0-9A-Za-z-]', '', 'g');
$$;

create or replace function public.normalize_delivery_reconciliation_branch(p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := lower(trim(coalesce(p_value, '')));
begin
  v := replace(replace(replace(v, 'ـ', ''), 'ى', 'ي'), 'ة', 'ه');
  v := regexp_replace(v, '\s+', '', 'g');
  if v = '' then return ''; end if;
  if v like '%شكري%' or v in ('shkri','shokry','shukri','shokri') then return 'شكري'; end if;
  if v like '%شامي%' or v in ('shamy','shami','elshamy','alshamy') then return 'الشامي'; end if;
  if v like '%بسيس%' or v in ('basisa','bsisa','bseesa') then return 'بسيسة'; end if;
  if v like '%زكريا%' or v in ('zakaria','zakarya') then return 'زكريا'; end if;
  if v like '%منشي%' or v in ('mansheya','manshia','elmansheya') then return 'المنشية'; end if;
  v := replace(replace(replace(v, 'الاداره', ''), 'الفرعيه', ''), 'فرع', '');
  return v;
end;
$$;

create or replace function public.parse_delivery_system_invoice_date(p_value text)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := trim(coalesce(p_value, ''));
  d1 int;
  d2 int;
  yy int;
  mm int;
  dd int;
begin
  if v = '' then return null; end if;
  if v ~ '^\d{4}-\d{1,2}-\d{1,2}' then
    return substring(v from '^\d{4}-\d{1,2}-\d{1,2}')::date;
  end if;
  if v ~ '^\d{1,2}/\d{1,2}/\d{2,4}' then
    d1 := split_part(split_part(v, ' ', 1), '/', 1)::int;
    d2 := split_part(split_part(v, ' ', 1), '/', 2)::int;
    yy := split_part(split_part(v, ' ', 1), '/', 3)::int;
    if yy < 100 then yy := 2000 + yy; end if;
    if d1 > 12 then dd := d1; mm := d2; else mm := d1; dd := d2; end if;
    return make_date(yy, mm, dd);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

alter table public.monthly_invoice_reconciliation_results
  add column if not exists system_invoice_id uuid,
  add column if not exists match_confidence integer,
  add column if not exists match_rule text,
  add column if not exists branch_mismatch boolean not null default false,
  add column if not exists invoice_date_mismatch boolean not null default false,
  add column if not exists amount_mismatch boolean not null default false,
  add column if not exists customer_code_mismatch boolean not null default false;

create index if not exists monthly_system_invoices_precise_match_idx
  on public.monthly_system_invoices(period_start, period_end, normalized_branch_name, invoice_number);
create index if not exists delivery_orders_precise_match_idx
  on public.delivery_orders(delivery_date, branch, invoice_number);

create or replace function public.delivery_orders_require_duplicate_invoice_reason()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duplicate_exists boolean := false;
  v_duplicate_fields_changed boolean := false;
begin
  if coalesce(trim(new.invoice_number), '') = '' then return new; end if;

  select exists(
    select 1 from public.delivery_orders
    where coalesce(invoice_number, '') = trim(new.invoice_number)
      and id is distinct from new.id
  ) into v_duplicate_exists;

  if not v_duplicate_exists then return new; end if;

  v_duplicate_fields_changed :=
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and (
      new.invoice_number is distinct from old.invoice_number
      or new.is_duplicate_invoice is distinct from old.is_duplicate_invoice
      or new.duplicate_reason is distinct from old.duplicate_reason
      or new.duplicate_note is distinct from old.duplicate_note
      or new.preparing_doctor_name is distinct from old.preparing_doctor_name
    ));

  if v_duplicate_fields_changed then
    if new.is_duplicate_invoice is not true
      or coalesce(trim(new.duplicate_reason), '') = ''
      or coalesce(trim(new.duplicate_note), '') = ''
      or coalesce(trim(new.preparing_doctor_name), '') = '' then
      raise exception 'لا يمكن تسجيل فاتورة مكررة بدون سبب التكرار وملاحظة واضحة واسم الدكتور';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.delivery_orders_sync_branch_name_from_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_name text;
begin
  if new.branch_id is not null then
    select b.name into v_branch_name from public.branches b where b.id = new.branch_id;
    if nullif(trim(coalesce(v_branch_name, '')), '') is not null then
      new.branch_name := v_branch_name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_orders_sync_branch_name_from_id on public.delivery_orders;
create trigger trg_delivery_orders_sync_branch_name_from_id
before insert or update of branch_id on public.delivery_orders
for each row execute function public.delivery_orders_sync_branch_name_from_id();

update public.delivery_orders o
set branch_name = b.name,
    updated_at = now()
from public.branches b
where o.branch_id = b.id
  and o.branch_name is distinct from b.name;

create or replace function public.reconcile_delivery_orders_precise(
  p_period_start date,
  p_period_end date,
  p_batch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid := p_batch_id;
  v_result jsonb;
begin
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Invalid reconciliation period';
  end if;

  if v_batch_id is null then
    select b.id into v_batch_id
    from public.monthly_invoice_import_batches b
    where b.period_start = p_period_start and b.period_end = p_period_end
    order by b.created_at desc
    limit 1;
  end if;
  if v_batch_id is null then raise exception 'No reconciliation batch found'; end if;

  create temporary table if not exists precise_reconciliation_work (
    order_id text primary key, rider_id uuid, rider_name text, invoice_number text,
    app_branch_name text, app_branch_normalized text, app_amount numeric,
    app_customer_code text, app_customer_name text, delivery_date date, order_status text,
    is_deleted boolean, is_duplicate boolean, duplicate_review_status text,
    app_same_invoice_count integer, manual_approved boolean,
    system_invoice_id uuid, system_branch_name text, system_branch_normalized text,
    system_amount numeric, system_customer_code text, system_customer_name text, system_invoice_date date,
    same_invoice_candidates integer, same_branch_candidates integer,
    branch_match boolean, customer_code_match boolean, invoice_date_match boolean, amount_match boolean,
    branch_mismatch boolean, customer_code_mismatch boolean, invoice_date_mismatch boolean, amount_mismatch boolean,
    match_status text, final_count_status text, is_countable boolean, needs_review boolean,
    difference_reason text, match_confidence integer, match_rule text
  ) on commit drop;
  truncate precise_reconciliation_work;

  insert into precise_reconciliation_work
  with base as (
    select o.*,
      public.normalize_delivery_reconciliation_invoice(coalesce(nullif(o.invoice_number,''), nullif(o.invoice_no,''))) norm_invoice,
      public.normalize_delivery_reconciliation_branch(coalesce(nullif(o.branch_name,''), nullif(o.branch,''), b.name)) norm_branch,
      coalesce(o.invoice_amount,o.invoice_value,o.amount,0)::numeric app_value,
      coalesce(nullif(o.customer_code_snapshot,''),nullif(o.customer_code,'')) app_code,
      coalesce(nullif(o.customer_name_snapshot,''),nullif(o.customer_name,'')) app_name,
      count(*) over (partition by
        public.normalize_delivery_reconciliation_branch(coalesce(nullif(o.branch_name,''), nullif(o.branch,''), b.name)),
        public.normalize_delivery_reconciliation_invoice(coalesce(nullif(o.invoice_number,''), nullif(o.invoice_no,''))))::int same_app_count
    from public.delivery_orders o
    left join public.branches b on b.id = o.branch_id
    where o.delivery_date between p_period_start and p_period_end
  ), joined as (
    select o.*,
      s.id sys_id, s.branch_name sys_branch,
      coalesce(nullif(s.normalized_branch_name,''), public.normalize_delivery_reconciliation_branch(s.branch_name)) sys_norm_branch,
      coalesce(s.net_total,s.gross_total,0)::numeric sys_amount,
      s.customer_code sys_code, s.customer_name sys_name,
      public.parse_delivery_system_invoice_date(s.invoice_date_text) sys_date,
      count(s.id) over (partition by o.id)::int same_invoice_candidates,
      count(s.id) filter (where coalesce(nullif(s.normalized_branch_name,''), public.normalize_delivery_reconciliation_branch(s.branch_name)) = o.norm_branch) over (partition by o.id)::int same_branch_candidates,
      row_number() over (partition by o.id order by
        (coalesce(nullif(s.normalized_branch_name,''), public.normalize_delivery_reconciliation_branch(s.branch_name)) = o.norm_branch) desc,
        (o.app_code ~ '^[0-9]+$' and coalesce(s.customer_code,'') ~ '^[0-9]+$' and trim(s.customer_code) = trim(o.app_code)) desc,
        (public.parse_delivery_system_invoice_date(s.invoice_date_text) = o.delivery_date) desc,
        (o.app_value > 0 and coalesce(s.net_total,s.gross_total,0) > 0 and abs(coalesce(s.net_total,s.gross_total,0) - o.app_value) <= greatest(1::numeric,o.app_value * 0.01)) desc,
        s.last_imported_at desc nulls last,
        s.created_at desc nulls last
      ) rn
    from base o
    left join public.monthly_system_invoices s
      on s.period_start = p_period_start
     and s.period_end = p_period_end
     and s.invoice_number = o.norm_invoice
  ), ranked as (
    select * from joined where rn = 1
  ), flags as (
    select r.*,
      (r.sys_id is not null and r.sys_norm_branch = r.norm_branch and r.norm_branch <> '') f_branch_match,
      case when r.app_code ~ '^[0-9]+$' and coalesce(r.sys_code,'') ~ '^[0-9]+$' then trim(r.app_code) = trim(r.sys_code) else true end f_customer_code_match,
      case when r.sys_date is null then true else abs(r.delivery_date - r.sys_date) <= 1 end f_date_match,
      case when r.app_value <= 0 or r.sys_amount <= 0 then true else abs(r.app_value - r.sys_amount) <= greatest(1::numeric,r.app_value * 0.01) end f_amount_match
    from ranked r
  ), decided as (
    select f.*,
      case
        when coalesce(f.deleted_at is not null,false) or coalesce(f.is_deleted,false) then 'deleted'
        when f.status = 'failed' then case when f.sys_id is not null and f.f_branch_match then 'matched_failed_excluded' else 'app_only_failed' end
        when f.bconnect_match_status = 'manually_approved' then 'manual_override'
        when f.norm_invoice = '' then 'missing_invoice_number'
        when f.sys_id is null then 'app_only'
        when not f.f_branch_match then 'branch_mismatch'
        when not f.f_customer_code_match then 'customer_code_mismatch'
        when not f.f_date_match then 'invoice_date_mismatch'
        when not f.f_amount_match then 'amount_mismatch'
        when coalesce(f.is_duplicate_invoice,false) and coalesce(f.duplicate_review_status,'pending') <> 'approved' then 'duplicate_pending_review'
        else 'matched'
      end d_match_status
    from flags f
  )
  select
    d.id, d.rider_id, coalesce(d.rider_name,d.driver_name), d.norm_invoice,
    coalesce(nullif(d.branch_name,''),nullif(d.branch,'')), d.norm_branch,
    d.app_value, d.app_code, d.app_name, d.delivery_date, d.status,
    coalesce(d.deleted_at is not null,false) or coalesce(d.is_deleted,false),
    coalesce(d.is_duplicate_invoice,false), d.duplicate_review_status, d.same_app_count,
    d.bconnect_match_status = 'manually_approved',
    case when d.f_branch_match then d.sys_id else null end,
    d.sys_branch, d.sys_norm_branch, d.sys_amount, d.sys_code, d.sys_name, d.sys_date,
    d.same_invoice_candidates, d.same_branch_candidates,
    d.f_branch_match,d.f_customer_code_match,d.f_date_match,d.f_amount_match,
    d.sys_id is not null and not d.f_branch_match,
    d.sys_id is not null and d.f_branch_match and not d.f_customer_code_match,
    d.sys_id is not null and d.f_branch_match and not d.f_date_match,
    d.sys_id is not null and d.f_branch_match and not d.f_amount_match,
    d.d_match_status,
    case d.d_match_status
      when 'matched' then case when coalesce(d.order_multiplier,1) >= 1.5 then 'counted_multiplier_pending_value_review' when coalesce(d.is_duplicate_invoice,false) then 'counted_duplicate_approved' else 'counted' end
      when 'manual_override' then 'counted_manual_approval'
      when 'matched_failed_excluded' then 'excluded_failed'
      when 'app_only_failed' then 'excluded_failed'
      when 'deleted' then 'deleted_not_counted'
      when 'duplicate_pending_review' then 'pending_duplicate_review'
      when 'branch_mismatch' then 'pending_branch_mismatch'
      when 'customer_code_mismatch' then 'pending_customer_code_review'
      when 'invoice_date_mismatch' then 'pending_invoice_date_review'
      when 'amount_mismatch' then 'pending_amount_review'
      when 'missing_invoice_number' then 'pending_missing_invoice'
      else 'excluded_invoice_not_found'
    end,
    d.d_match_status in ('matched','manual_override'),
    d.d_match_status not in ('matched','manual_override','matched_failed_excluded','app_only_failed','deleted'),
    case d.d_match_status
      when 'matched' then 'مطابقة دقيقة: رقم الفاتورة + الفرع، مع التحقق من التاريخ وكود العميل والقيمة عند توفرها'
      when 'manual_override' then 'اعتماد يدوي محفوظ بواسطة الإدارة'
      when 'matched_failed_excluded' then 'الفاتورة موجودة بدقة لكن الأوردر فاشل ولا يحتسب'
      when 'app_only_failed' then 'أوردر فاشل ولا توجد له فاتورة مطابقة في السيستم'
      when 'deleted' then 'أوردر محذوف محفوظ ولا يحتسب'
      when 'branch_mismatch' then 'رقم الفاتورة موجود، لكن الفرع لا يطابق فرع الأوردر'
      when 'customer_code_mismatch' then 'رقم الفاتورة والفرع متطابقان لكن كود العميل مختلف'
      when 'invoice_date_mismatch' then 'رقم الفاتورة والفرع متطابقان لكن تاريخ الفاتورة بعيد عن تاريخ الأوردر'
      when 'amount_mismatch' then 'رقم الفاتورة والفرع متطابقان لكن قيمة الفاتورة مختلفة وتحتاج مراجعة'
      when 'duplicate_pending_review' then 'الفاتورة مطابقة لكن الأوردر مكرر ولم يعتمد بعد'
      when 'missing_invoice_number' then 'الأوردر بدون رقم فاتورة صالح'
      else 'رقم الفاتورة غير موجود في ملف السيستم لهذه الدورة'
    end,
    least(100,
      case when d.sys_id is not null then 40 else 0 end +
      case when d.f_branch_match then 30 else 0 end +
      case when d.f_customer_code_match and d.app_code ~ '^[0-9]+$' and coalesce(d.sys_code,'') ~ '^[0-9]+$' then 15 else 0 end +
      case when d.f_date_match and d.sys_date is not null then 10 else 0 end +
      case when d.f_amount_match and d.app_value > 0 and d.sys_amount > 0 then 5 else 0 end),
    case
      when d.d_match_status = 'manual_override' then 'manual_override'
      when d.sys_id is null then 'invoice_not_found'
      when not d.f_branch_match then 'invoice_exact_branch_rejected'
      when d.f_customer_code_match and d.f_date_match and d.f_amount_match then 'invoice+branch+customer/date/amount_checks'
      when d.f_customer_code_match and d.f_date_match then 'invoice+branch+customer+date'
      when d.f_date_match then 'invoice+branch+date'
      else 'invoice+branch'
    end
  from decided d;

  update public.delivery_orders o
  set bconnect_invoice_id = w.system_invoice_id,
      bconnect_match_status = case
        when w.match_status = 'matched' then 'matched'
        when w.match_status = 'manual_override' then 'manually_approved'
        when w.match_status = 'matched_failed_excluded' then 'matched'
        when w.match_status in ('app_only','missing_invoice_number') then 'invoice_not_found'
        else w.match_status end,
      matched_at = case when w.system_invoice_id is not null then now() else null end,
      matched_amount = case when w.system_invoice_id is not null then coalesce(w.system_amount,0) else 0 end,
      is_countable = w.is_countable,
      final_count_status = w.final_count_status,
      count_exclusion_reason = case when w.is_countable then null else w.match_status end,
      needs_review = w.needs_review,
      review_reason = case when w.needs_review then w.difference_reason else null end,
      reconciliation_status = w.match_status,
      reconciliation_notes = w.difference_reason,
      updated_at = now()
  from precise_reconciliation_work w
  where o.id = w.order_id;

  delete from public.monthly_invoice_reconciliation_results where batch_id = v_batch_id;

  insert into public.monthly_invoice_reconciliation_results (
    batch_id,period_start,period_end,invoice_number,rider_id,rider_name,app_order_id,match_status,difference_reason,
    app_amount,system_amount,app_customer_code,system_customer_code,app_customer_name,system_customer_name,
    app_branch_name,system_branch_name,is_countable,needs_review,raw_json,customer_name_mismatch,
    app_customer_name_normalized,system_customer_name_normalized,system_invoice_id,match_confidence,match_rule,
    branch_mismatch,invoice_date_mismatch,amount_mismatch,customer_code_mismatch)
  select v_batch_id,p_period_start,p_period_end,w.invoice_number,w.rider_id,w.rider_name,
    case when w.order_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then w.order_id::uuid else null end,
    w.match_status,w.difference_reason,w.app_amount,w.system_amount,w.app_customer_code,w.system_customer_code,
    w.app_customer_name,w.system_customer_name,w.app_branch_name,w.system_branch_name,w.is_countable,w.needs_review,
    jsonb_build_object('order_id',w.order_id,'system_invoice_id',w.system_invoice_id,'confidence',w.match_confidence,'rule',w.match_rule),
    case when nullif(trim(coalesce(w.app_customer_name,'')),'') is not null and nullif(trim(coalesce(w.system_customer_name,'')),'') is not null
      then lower(regexp_replace(w.app_customer_name,'\s+','','g')) <> lower(regexp_replace(w.system_customer_name,'\s+','','g')) else false end,
    lower(regexp_replace(coalesce(w.app_customer_name,''),'\s+','','g')),
    lower(regexp_replace(coalesce(w.system_customer_name,''),'\s+','','g')),
    w.system_invoice_id,w.match_confidence,w.match_rule,w.branch_mismatch,w.invoice_date_mismatch,w.amount_mismatch,w.customer_code_mismatch
  from precise_reconciliation_work w;

  insert into public.monthly_invoice_reconciliation_results (
    batch_id,period_start,period_end,invoice_number,rider_id,rider_name,app_order_id,match_status,difference_reason,
    app_amount,system_amount,app_customer_code,system_customer_code,app_customer_name,system_customer_name,
    app_branch_name,system_branch_name,is_countable,needs_review,raw_json,system_invoice_id,match_confidence,match_rule)
  select v_batch_id,p_period_start,p_period_end,s.invoice_number,null,null,null,'system_only',
    'موجودة في ملف السيستم ولا يوجد أوردر مطابق لنفس رقم الفاتورة والفرع في التطبيق',
    null,coalesce(s.net_total,s.gross_total),null,s.customer_code,null,s.customer_name,null,s.branch_name,false,true,
    jsonb_build_object('system_invoice_id',s.id,'branch',s.branch_name,'customer_code',s.customer_code),
    s.id,40,'system_only_after_branch_aware_match'
  from public.monthly_system_invoices s
  where s.period_start = p_period_start and s.period_end = p_period_end
    and not exists (select 1 from precise_reconciliation_work w where w.system_invoice_id = s.id);

  update public.monthly_invoice_import_batches
  set status = 'matched', matched_at = now()
  where id = v_batch_id;

  select jsonb_build_object(
    'success',true,'batch_id',v_batch_id,'orders',count(*),
    'counted',count(*) filter(where is_countable),
    'needs_review',count(*) filter(where needs_review),
    'matched',count(*) filter(where match_status='matched'),
    'not_found',count(*) filter(where match_status in ('app_only','missing_invoice_number')),
    'branch_mismatch',count(*) filter(where branch_mismatch),
    'customer_code_mismatch',count(*) filter(where customer_code_mismatch),
    'date_mismatch',count(*) filter(where invoice_date_mismatch),
    'amount_mismatch',count(*) filter(where amount_mismatch),
    'duplicate_pending',count(*) filter(where match_status='duplicate_pending_review'))
  into v_result
  from precise_reconciliation_work;

  return v_result;
end;
$$;

revoke all on function public.reconcile_delivery_orders_precise(date,date,uuid) from public;
grant execute on function public.reconcile_delivery_orders_precise(date,date,uuid) to authenticated;
