-- Dawaa Delivery Intelligence & Anti‑Tampering hardening
-- Safe migration: additive only. No DROP/TRUNCATE/destructive DELETE.

create extension if not exists pgcrypto;

-- 1) Unified 26→25 cycle helpers
create or replace function public.dawaa_cycle_start(p_date date default current_date)
returns date
language sql
stable
as $$
  select case
    when extract(day from p_date)::int >= 26 then date_trunc('month', p_date)::date + 25
    else (date_trunc('month', p_date)::date - interval '1 month')::date + 25
  end;
$$;

create or replace function public.dawaa_cycle_end(p_date date default current_date)
returns date
language sql
stable
as $$
  select (public.dawaa_cycle_start(p_date) + interval '1 month' - interval '1 day')::date;
$$;

-- 2) Database deprecation registry. Use this before archiving old duplicate objects.
create table if not exists public.database_deprecation_registry (
  id uuid primary key default gen_random_uuid(),
  object_type text not null default 'table',
  schema_name text not null default 'public',
  object_name text not null,
  replacement_object_name text,
  reason text,
  detected_at timestamptz not null default now(),
  approved_for_archive boolean not null default false,
  archived_at timestamptz,
  notes text,
  unique(schema_name, object_name)
);

-- Initial non-destructive classification for likely old/overlapping objects.
insert into public.database_deprecation_registry (object_type, schema_name, object_name, replacement_object_name, reason, notes)
values
('view','public','delivery_order_timeline_v19','delivery_order_timeline_events','Old timeline compatibility object. Keep until app no longer references it.','Do not drop without manual approval.'),
('view','public','staff_accounts_full_view','rider_accounts_view','Compatibility/admin aggregate view. Verify usage before archive.','Do not drop without manual approval.'),
('table','public','delivery_audit_events','delivery_audit_log','Possible overlap with audit log. Needs human review.','Audit data: never delete directly.'),
('table','public','delivery_runs','delivery_trips','Possible old dispatch/run model. Needs usage check.','Archive only after code references are removed.')
on conflict (schema_name, object_name) do nothing;

-- 3) Customer import pipeline
create table if not exists public.customer_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  branch_id uuid,
  total_rows int not null default 0,
  inserted_count int not null default 0,
  updated_count int not null default 0,
  skipped_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'pending',
  notes text
);

alter table public.customer_import_batches add column if not exists completed_at timestamptz;

create table if not exists public.customer_import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.customer_import_batches(id) on delete set null,
  row_number int,
  raw_data jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null default current_date,
  customer_id uuid,
  customer_code text,
  branch_id uuid,
  total_sales numeric not null default 0,
  invoices_count int not null default 0,
  last_invoice_date date,
  last_invoice_number text,
  created_at timestamptz not null default now(),
  unique(snapshot_date, customer_code, branch_id)
);

-- 4) Sales invoice import/reconciliation pipeline
create table if not exists public.delivery_sales_invoice_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  branch_id uuid,
  total_rows int not null default 0,
  inserted_count int not null default 0,
  updated_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'pending',
  notes text
);

create table if not exists public.delivery_sales_invoice_import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.delivery_sales_invoice_import_batches(id) on delete set null,
  row_number int,
  raw_data jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_sales_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  invoice_date date,
  branch_id uuid,
  customer_code text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  gross_total numeric not null default 0,
  net_total numeric not null default 0,
  discount_total numeric not null default 0,
  items_count int not null default 0,
  source_batch_id uuid references public.delivery_sales_invoice_import_batches(id) on delete set null,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(invoice_number, branch_id)
);

-- 5) Add safe customer columns if delivery_customers exists.
do $$
begin
  if to_regclass('public.delivery_customers') is not null then
    alter table public.delivery_customers add column if not exists customer_code text;
    alter table public.delivery_customers add column if not exists name text;
    alter table public.delivery_customers add column if not exists normalized_name text;
    alter table public.delivery_customers add column if not exists phone text;
    alter table public.delivery_customers add column if not exists phone_normalized text;
    alter table public.delivery_customers add column if not exists phone2 text;
    alter table public.delivery_customers add column if not exists address text;
    alter table public.delivery_customers add column if not exists branch_id uuid;
    alter table public.delivery_customers add column if not exists branch_name text;
    alter table public.delivery_customers add column if not exists first_invoice_date date;
    alter table public.delivery_customers add column if not exists last_invoice_date date;
    alter table public.delivery_customers add column if not exists total_sales numeric not null default 0;
    alter table public.delivery_customers add column if not exists invoices_count int not null default 0;
    alter table public.delivery_customers add column if not exists average_invoice numeric not null default 0;
    alter table public.delivery_customers add column if not exists last_invoice_number text;
    alter table public.delivery_customers add column if not exists customer_status text not null default 'active';
    alter table public.delivery_customers add column if not exists importance_level text;
    alter table public.delivery_customers add column if not exists source_batch_id uuid;
    alter table public.delivery_customers add column if not exists created_at timestamptz not null default now();
    alter table public.delivery_customers add column if not exists updated_at timestamptz not null default now();
  end if;
end $$;

-- 6) Harden order proof/reconciliation columns.
do $$
begin
  if to_regclass('public.delivery_orders') is not null then
    alter table public.delivery_orders add column if not exists reconciliation_status text not null default 'pending_reconciliation';
    alter table public.delivery_orders add column if not exists review_status text not null default 'pending';
    alter table public.delivery_orders add column if not exists approval_status text not null default 'pending';
    alter table public.delivery_orders add column if not exists is_countable boolean not null default false;
    alter table public.delivery_orders add column if not exists final_count_status text not null default 'pending_reconciliation';
    alter table public.delivery_orders add column if not exists count_exclusion_reason text;
    alter table public.delivery_orders add column if not exists gps_lat double precision;
    alter table public.delivery_orders add column if not exists gps_lng double precision;
    alter table public.delivery_orders add column if not exists gps_accuracy_m int;
    alter table public.delivery_orders add column if not exists receipt_image_path text;
    alter table public.delivery_orders add column if not exists receipt_image_url text;
    alter table public.delivery_orders add column if not exists receipt_ocr_json jsonb;
    alter table public.delivery_orders add column if not exists receipt_review_status text not null default 'pending_admin_review';
    alter table public.delivery_orders add column if not exists security_flags jsonb not null default '{}'::jsonb;
  end if;
end $$;

-- 7) Attendance GPS columns for both possible table names.
do $$
begin
  if to_regclass('public.attendance') is not null then
    alter table public.attendance add column if not exists check_in_lat double precision;
    alter table public.attendance add column if not exists check_in_lng double precision;
    alter table public.attendance add column if not exists check_in_accuracy_m int;
    alter table public.attendance add column if not exists check_out_lat double precision;
    alter table public.attendance add column if not exists check_out_lng double precision;
    alter table public.attendance add column if not exists check_out_accuracy_m int;
    alter table public.attendance add column if not exists review_reason text;
  end if;
  if to_regclass('public.delivery_attendance') is not null then
    alter table public.delivery_attendance add column if not exists check_in_lat double precision;
    alter table public.delivery_attendance add column if not exists check_in_lng double precision;
    alter table public.delivery_attendance add column if not exists check_in_accuracy_m int;
    alter table public.delivery_attendance add column if not exists check_out_lat double precision;
    alter table public.delivery_attendance add column if not exists check_out_lng double precision;
    alter table public.delivery_attendance add column if not exists check_out_accuracy_m int;
    alter table public.delivery_attendance add column if not exists review_reason text;
  end if;
end $$;

-- 8) Indexes. All safe/concurrent-free for Supabase SQL editor.
create index if not exists idx_customer_import_errors_batch on public.customer_import_errors(batch_id);
create index if not exists idx_delivery_sales_invoices_invoice on public.delivery_sales_invoices(invoice_number);
create index if not exists idx_delivery_sales_invoices_branch_date on public.delivery_sales_invoices(branch_id, invoice_date);

do $$
begin
  if to_regclass('public.delivery_customers') is not null then
    create index if not exists idx_delivery_customers_code on public.delivery_customers(customer_code);
    create index if not exists idx_delivery_customers_phone_norm on public.delivery_customers(phone_normalized);
    create index if not exists idx_delivery_customers_branch on public.delivery_customers(branch_id);
    create index if not exists idx_delivery_customers_last_invoice on public.delivery_customers(last_invoice_date);
  end if;
  if to_regclass('public.delivery_orders') is not null then
    create index if not exists idx_delivery_orders_rider_date on public.delivery_orders(rider_id, delivery_date);
    create index if not exists idx_delivery_orders_branch_date on public.delivery_orders(branch_id, delivery_date);
    create index if not exists idx_delivery_orders_invoice on public.delivery_orders(invoice_number);
    create index if not exists idx_delivery_orders_reconciliation on public.delivery_orders(reconciliation_status);
  end if;
  if to_regclass('public.rider_sessions') is not null then
    create index if not exists idx_rider_sessions_account_token on public.rider_sessions(account_id, session_token);
  end if;
  if to_regclass('public.rider_account_devices') is not null then
    create index if not exists idx_rider_account_devices_account_status on public.rider_account_devices(account_id, status);
  end if;
end $$;

-- 9) Customer analytics view.
create or replace view public.customer_delivery_analytics as
select
  c.id as customer_id,
  c.customer_code as customer_code,
  c.name as customer_name,
  coalesce(c.phone_normalized, c.phone) as phone,
  coalesce(c.branch_name, b.name) as branch_name,
  count(o.id)::int as total_orders,
  count(o.id) filter (where coalesce(o.final_count_status, o.reconciliation_status, o.bconnect_match_status) in ('countable','matched','manually_approved'))::int as matched_orders,
  count(o.id) filter (where coalesce(o.final_count_status, o.reconciliation_status, o.bconnect_match_status) in ('rejected','invoice_not_found','customer_mismatch','branch_mismatch'))::int as rejected_orders,
  max(o.registered_at) as last_delivery_order_at,
  c.last_invoice_date,
  coalesce(c.total_sales, 0)::numeric as total_sales,
  coalesce(c.invoices_count, 0)::int as invoices_count,
  coalesce(c.average_invoice, 0)::numeric as average_invoice,
  case when c.last_invoice_date is null then null else (current_date - c.last_invoice_date)::int end as days_since_last_invoice,
  count(o.id) filter (where coalesce(o.needs_review, false) or coalesce(o.review_status,'') in ('pending','needs_review'))::int as delivery_problem_count,
  case
    when coalesce(c.total_sales,0) >= 8000 then 'vip'
    when c.last_invoice_date is null then 'new'
    when current_date - c.last_invoice_date >= 90 then 'stopped'
    when current_date - c.last_invoice_date >= 60 then 'at_risk'
    when current_date - c.last_invoice_date >= 30 then 'declining'
    else 'active'
  end as customer_segment,
  case
    when c.last_invoice_date is null then 'unknown'
    when current_date - c.last_invoice_date >= 90 then 'high'
    when current_date - c.last_invoice_date >= 60 then 'medium'
    else 'low'
  end as risk_level
from public.delivery_customers c
left join public.branches b on b.id = c.branch_id
left join public.delivery_orders o on (o.customer_id = c.id or nullif(o.customer_code,'') = nullif(c.customer_code,''))
group by c.id, c.customer_code, c.name, c.phone_normalized, c.phone, c.branch_name, b.name, c.last_invoice_date, c.total_sales, c.invoices_count, c.average_invoice;

-- 10) Rider current cycle incentive view.
create or replace view public.rider_incentive_current_cycle_view as
with period as (
  select public.dawaa_cycle_start(current_date) as start_date, public.dawaa_cycle_end(current_date) as end_date
), orders as (
  select o.* from public.delivery_orders o, period p where o.delivery_date between p.start_date and p.end_date
)
select
  r.id as rider_id,
  r.name as rider_name,
  r.branch_id,
  p.start_date as cycle_start,
  p.end_date as cycle_end,
  count(o.id)::int as total_orders,
  count(o.id) filter (where coalesce(o.is_countable,false) or coalesce(o.final_count_status,'')='countable')::int as countable_orders,
  count(o.id) filter (where coalesce(o.needs_review,false) or coalesce(o.review_status,'') in ('pending','needs_review'))::int as pending_review_orders,
  count(o.id) filter (where coalesce(o.is_duplicate_invoice,false))::int as duplicate_orders,
  count(o.id) filter (where coalesce(o.receipt_image_path,'')='')::int as missing_receipt_orders,
  round(
    case when count(o.id)=0 then 100 else
      100.0 * count(o.id) filter (where coalesce(o.is_countable,false) or coalesce(o.final_count_status,'')='countable') / count(o.id)
    end, 2
  ) as accuracy_percent,
  least(100, greatest(0,
    30 * case when count(o.id)=0 then 1 else count(o.id) filter (where coalesce(o.is_countable,false) or coalesce(o.final_count_status,'')='countable')::numeric / count(o.id) end
    + 20 * case when count(o.id)=0 then 1 else 1 - (count(o.id) filter (where coalesce(o.review_reason,'')='customer_mismatch'))::numeric / count(o.id) end
    + 15
    + 15
    + 10
    + 10 * case when count(o.id)=0 then 1 else 1 - (count(o.id) filter (where coalesce(o.needs_review,false)))::numeric / count(o.id) end
  ))::numeric(6,2) as performance_score,
  (count(o.id) filter (where coalesce(o.is_countable,false) or coalesce(o.final_count_status,'')='countable'))::numeric as estimated_incentive_points
from public.riders r
cross join period p
left join orders o on o.rider_id = r.id
where coalesce(r.status,'active') = 'active'
group by r.id, r.name, r.branch_id, p.start_date, p.end_date;

-- 11) Secure RPC signatures used by the hardened app. They delegate to existing tables and never default to countable.
create or replace function public.rider_check_in_out(
  p_token text,
  p_action text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_account record;
  v_attendance_id uuid;
  v_today date := current_date;
  v_status text := 'present';
  v_review text := null;
begin
  if p_token is null or length(trim(p_token)) < 10 then
    return jsonb_build_object('success', false, 'error', 'invalid_session', 'message', 'جلسة غير صالحة');
  end if;
  if p_lat is null or p_lng is null then
    return jsonb_build_object('success', false, 'error', 'gps_required', 'message', 'GPS مطلوب لتسجيل الحضور والانصراف');
  end if;
  if p_accuracy_m is not null and p_accuracy_m > 100 then
    v_status := 'needs_review';
    v_review := 'gps_accuracy_weak';
  end if;

  select * into v_session from public.rider_sessions where session_token = p_token and (expires_at is null or expires_at > now()) and revoked_at is null limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'expired_session', 'message', 'انتهت الجلسة');
  end if;

  select * into v_account from public.rider_accounts where id = v_session.account_id and status='active' limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'inactive_account', 'message', 'الحساب غير نشط');
  end if;

  if p_action in ('check_in','checkin') then
    insert into public.attendance (rider_id, branch_id, work_date, check_in_at, status, check_in_lat, check_in_lng, check_in_accuracy_m, review_reason, created_at, updated_at)
    values (v_account.rider_id, v_account.branch_id, v_today, now(), v_status, p_lat, p_lng, p_accuracy_m, v_review, now(), now())
    on conflict (rider_id, work_date) do update set check_in_at = coalesce(public.attendance.check_in_at, excluded.check_in_at), status=excluded.status, check_in_lat=excluded.check_in_lat, check_in_lng=excluded.check_in_lng, check_in_accuracy_m=excluded.check_in_accuracy_m, review_reason=excluded.review_reason, updated_at=now()
    returning id into v_attendance_id;
  elsif p_action in ('check_out','checkout') then
    update public.attendance set check_out_at=now(), check_out_lat=p_lat, check_out_lng=p_lng, check_out_accuracy_m=p_accuracy_m, status=case when v_status='needs_review' then 'needs_review' else status end, review_reason=coalesce(v_review, review_reason), updated_at=now()
    where rider_id=v_account.rider_id and work_date=v_today
    returning id into v_attendance_id;
    if v_attendance_id is null then
      return jsonb_build_object('success', false, 'error', 'not_checked_in', 'message', 'يجب تسجيل الحضور أولاً');
    end if;
  else
    return jsonb_build_object('success', false, 'error', 'invalid_action', 'message', 'نوع العملية غير صحيح');
  end if;

  return jsonb_build_object('success', true, 'attendance_id', v_attendance_id, 'status', v_status, 'review_reason', v_review);
end;
$$;

create or replace function public.rider_create_order(
  p_token text,
  p_customer_id uuid default null,
  p_customer_code text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_address text default null,
  p_invoice_number text default null,
  p_invoice_amount numeric default 0,
  p_order_multiplier numeric default 1,
  p_notes text default null,
  p_gps_lat double precision default null,
  p_gps_lng double precision default null,
  p_gps_accuracy_m int default null,
  p_receipt_image_path text default null,
  p_receipt_image_url text default null,
  p_receipt_ocr_json jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_account record;
  v_rider record;
  v_order_id uuid;
  v_duplicate_id uuid;
  v_today date := current_date;
  v_needs_review boolean := false;
  v_review_reason text := null;
begin
  if p_token is null or length(trim(p_token)) < 10 then
    return jsonb_build_object('success', false, 'error', 'invalid_session', 'message', 'جلسة غير صالحة');
  end if;
  if coalesce(trim(p_invoice_number),'') = '' then
    return jsonb_build_object('success', false, 'error', 'invoice_required', 'message', 'رقم الفاتورة مطلوب');
  end if;
  if p_gps_lat is null or p_gps_lng is null then
    return jsonb_build_object('success', false, 'error', 'gps_required', 'message', 'GPS مطلوب لتسجيل الأوردر');
  end if;
  -- صورة الريسيت اختيارية حاليًا: لو لم تُرفع الصورة لا نرفض الأوردر،
  -- لكن نسجلها كحالة not_uploaded ويمكن استخدامها لاحقًا في المراجعة أو المطابقة.

  select * into v_session from public.rider_sessions where session_token = p_token and (expires_at is null or expires_at > now()) and revoked_at is null limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'expired_session', 'message', 'انتهت الجلسة');
  end if;

  select * into v_account from public.rider_accounts where id = v_session.account_id and status='active' limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'inactive_account', 'message', 'الحساب غير نشط');
  end if;

  select * into v_rider from public.riders where id = v_account.rider_id limit 1;

  if not exists (select 1 from public.attendance where rider_id=v_account.rider_id and work_date=v_today and check_in_at is not null and check_out_at is null) then
    return jsonb_build_object('success', false, 'error', 'not_checked_in', 'message', 'يجب تسجيل الحضور أولاً');
  end if;

  select id into v_duplicate_id from public.delivery_orders where invoice_number = trim(p_invoice_number) and branch_id = v_account.branch_id limit 1;
  if v_duplicate_id is not null then
    v_needs_review := true;
    v_review_reason := 'duplicate_invoice';
  elsif p_customer_id is null then
    v_needs_review := true;
    v_review_reason := 'manual_customer';
  elsif p_gps_accuracy_m is not null and p_gps_accuracy_m > 100 then
    v_needs_review := true;
    v_review_reason := 'gps_accuracy_weak';
  end if;

  insert into public.delivery_orders (
    rider_id, rider_name, branch_id, customer_id, delivery_date, invoice_number, invoice_no, invoice_amount, invoice_value,
    customer_code, customer_name, customer_phone, customer_address,
    customer_code_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot,
    status, registered_at, prepared_at, ready_at, dispatched_at, dispatch_status, dispatch_by, dispatch_by_name, picked_up_at, picked_up_by, picked_up_by_name,
    notes, source, created_source, is_duplicate_invoice, original_order_id, duplicate_review_status,
    needs_review, review_reason, review_status, approval_status, order_multiplier, order_rate, order_earning,
    bconnect_match_status, reconciliation_status, is_countable, final_count_status,
    gps_lat, gps_lng, gps_accuracy_m, receipt_image_path, receipt_image_url, receipt_ocr_json, receipt_review_status,
    security_flags
  ) values (
    v_account.rider_id, coalesce(v_rider.name, v_account.display_name, v_account.username), v_account.branch_id, p_customer_id, v_today, trim(p_invoice_number), trim(p_invoice_number), coalesce(p_invoice_amount,0), coalesce(p_invoice_amount,0),
    p_customer_code, p_customer_name, p_customer_phone, p_customer_address,
    p_customer_code, p_customer_name, p_customer_phone, p_customer_address,
    'registered', now(), now(), now(), now(), 'dispatched', v_account.rider_id, coalesce(v_rider.name, v_account.display_name), now(), v_account.rider_id, coalesce(v_rider.name, v_account.display_name),
    p_notes, 'rider_app', 'secure_rpc', v_duplicate_id is not null, v_duplicate_id, case when v_duplicate_id is not null then 'pending' else 'not_required' end,
    v_needs_review, v_review_reason, case when v_needs_review then 'pending' else 'pending_reconciliation' end, 'pending', coalesce(p_order_multiplier,1), 0, 0,
    'pending', 'pending_reconciliation', false, 'pending_reconciliation',
    p_gps_lat, p_gps_lng, p_gps_accuracy_m, p_receipt_image_path, p_receipt_image_url, p_receipt_ocr_json, case when coalesce(p_receipt_image_path,'') <> '' then 'pending_admin_review' else 'not_uploaded' end,
    jsonb_build_object('created_via','secure_rpc','gps_required',true,'receipt_required',false,'receipt_optional_now',true,'session_id',v_session.id)
  ) returning id into v_order_id;

  return jsonb_build_object('success', true, 'order_id', v_order_id, 'is_duplicate', v_duplicate_id is not null, 'needs_review', v_needs_review, 'review_reason', v_review_reason);
end;
$$;

-- 12) Restrict direct writes where possible. RPCs above remain usable because they are SECURITY DEFINER.
do $$
begin
  if to_regclass('public.delivery_orders') is not null then
    alter table public.delivery_orders enable row level security;
    drop policy if exists delivery_orders_no_anon_direct_write on public.delivery_orders;
    create policy delivery_orders_no_anon_direct_write on public.delivery_orders for insert to anon with check (false);
  end if;
  if to_regclass('public.attendance') is not null then
    alter table public.attendance enable row level security;
    drop policy if exists attendance_no_anon_direct_write on public.attendance;
    create policy attendance_no_anon_direct_write on public.attendance for insert to anon with check (false);
  end if;
end $$;
