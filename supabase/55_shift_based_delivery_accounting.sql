-- Migration 55: Shift-based delivery accounting
-- الهدف: ربط الأوردرات والمشاوير بشيفت الدليفري المفتوح حتى لو الشغل عدى بعد 12 بالليل.
-- يعتمد على delivery_attendance كجدول الحضور الرسمي، ويضيف work_date/attendance_id للتقارير.

begin;

-- 1) تجهيز جدول حضور الدليفري الرسمي
create table if not exists public.delivery_attendance (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid,
  branch_id uuid,
  shift_date date not null default ((now() at time zone 'Africa/Cairo')::date),
  check_in_time timestamptz,
  check_out_time timestamptz,
  check_in_lat numeric,
  check_in_lng numeric,
  check_in_accuracy numeric,
  check_out_lat numeric,
  check_out_lng numeric,
  check_out_accuracy numeric,
  total_minutes integer default 0,
  status text default 'present',
  needs_review boolean default false,
  review_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.delivery_attendance
  add column if not exists account_id uuid,
  add column if not exists rider_name text,
  add column if not exists branch_name text,
  add column if not exists shift_date date default ((now() at time zone 'Africa/Cairo')::date),
  add column if not exists check_in_time timestamptz,
  add column if not exists check_out_time timestamptz,
  add column if not exists total_minutes integer default 0,
  add column if not exists status text default 'present',
  add column if not exists needs_review boolean default false,
  add column if not exists review_reason text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- 2) ربط الأوردرات بالشيفت ويوم الشغل
alter table public.delivery_orders
  add column if not exists attendance_id uuid,
  add column if not exists work_date date;

-- أعمدة يستخدمها RPC تسجيل الأوردر. الإضافة آمنة حتى لو الأعمدة موجودة.
alter table public.delivery_orders
  add column if not exists rider_name text,
  add column if not exists branch_name text,
  add column if not exists invoice_no text,
  add column if not exists invoice_amount numeric default 0,
  add column if not exists invoice_value numeric default 0,
  add column if not exists customer_code text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_address text,
  add column if not exists prepared_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists dispatched_at timestamptz,
  add column if not exists dispatch_status text,
  add column if not exists dispatch_by uuid,
  add column if not exists dispatch_by_name text,
  add column if not exists picked_up_at timestamptz,
  add column if not exists picked_up_by uuid,
  add column if not exists picked_up_by_name text,
  add column if not exists created_source text,
  add column if not exists approval_status text default 'pending',
  add column if not exists duplicate_warning boolean default false,
  add column if not exists duplicate_review_status text default 'not_required',
  add column if not exists needs_review boolean default false,
  add column if not exists review_reason text,
  add column if not exists review_status text default 'pending',
  add column if not exists order_multiplier numeric default 1,
  add column if not exists is_multiplier_order boolean default false,
  add column if not exists order_rate numeric default 0,
  add column if not exists order_earning numeric default 0,
  add column if not exists bconnect_match_status text default 'pending',
  add column if not exists reconciliation_status text default 'pending_reconciliation',
  add column if not exists is_countable boolean default true,
  add column if not exists final_count_status text default 'pending_reconciliation',
  add column if not exists gps_lat double precision,
  add column if not exists gps_lng double precision,
  add column if not exists gps_accuracy_m int,
  add column if not exists receipt_image_path text,
  add column if not exists receipt_image_url text,
  add column if not exists receipt_ocr_json jsonb,
  add column if not exists receipt_review_status text,
  add column if not exists security_flags jsonb default '{}'::jsonb,
  add column if not exists failed_at timestamptz,
  add column if not exists not_countable boolean default false,
  add column if not exists excluded_from_incentive boolean default false;

-- 3) ربط المشاوير بالشيفت ويوم الشغل، لو جدول المشاوير موجود
alter table if exists public.internal_trips
  add column if not exists attendance_id uuid,
  add column if not exists work_date date;

-- 4) فهارس أداء ومنع أكثر من شيفت مفتوح للدليفري
create unique index if not exists ux_delivery_attendance_one_open_shift
on public.delivery_attendance(rider_id)
where check_in_time is not null
  and check_out_time is null
  and coalesce(status, 'present') in ('present', 'open', 'manual_review');

create index if not exists idx_delivery_attendance_rider_shift_date
on public.delivery_attendance(rider_id, shift_date);

create index if not exists idx_delivery_attendance_open
on public.delivery_attendance(rider_id, check_in_time, check_out_time);

create index if not exists idx_delivery_orders_attendance_id
on public.delivery_orders(attendance_id);

create index if not exists idx_delivery_orders_work_date
on public.delivery_orders(work_date);

create index if not exists idx_delivery_orders_rider_work_date
on public.delivery_orders(rider_id, work_date);

do $$
begin
  if to_regclass('public.internal_trips') is not null then
    execute 'create index if not exists idx_internal_trips_work_date on public.internal_trips(rider_id, work_date)';
  end if;
end $$;

-- 5) Foreign keys آمنة
DO $$
BEGIN
  IF to_regclass('public.delivery_orders') IS NOT NULL
     AND to_regclass('public.delivery_attendance') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema = 'public'
         AND table_name = 'delivery_orders'
         AND constraint_name = 'delivery_orders_attendance_id_fkey'
     ) THEN
    ALTER TABLE public.delivery_orders
    ADD CONSTRAINT delivery_orders_attendance_id_fkey
    FOREIGN KEY (attendance_id)
    REFERENCES public.delivery_attendance(id);
  END IF;

  IF to_regclass('public.internal_trips') IS NOT NULL
     AND to_regclass('public.delivery_attendance') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema = 'public'
         AND table_name = 'internal_trips'
         AND constraint_name = 'internal_trips_attendance_id_fkey'
     ) THEN
    ALTER TABLE public.internal_trips
    ADD CONSTRAINT internal_trips_attendance_id_fkey
    FOREIGN KEY (attendance_id)
    REFERENCES public.delivery_attendance(id);
  END IF;
END $$;

-- 6) دالة مساعدة: يوم التشغيل الافتراضي للأوردرات القديمة فقط
create or replace function public.dawaa_operating_date(p_at timestamptz default now())
returns date
language sql
stable
as $$
  select case
    when extract(hour from (coalesce(p_at, now()) at time zone 'Africa/Cairo')) < 9
    then (((coalesce(p_at, now()) at time zone 'Africa/Cairo')::date - interval '1 day')::date)
    else ((coalesce(p_at, now()) at time zone 'Africa/Cairo')::date)
  end;
$$;

-- 7) توزيع work_date للأوردرات القديمة، ثم محاولة ربطها بالحضور لو موجود
update public.delivery_orders
set work_date = public.dawaa_operating_date(coalesce(registered_at, created_at, now())),
    updated_at = now()
where work_date is null;

with matched_orders as (
  select
    o.id as order_id,
    a.id as attendance_id,
    a.shift_date as work_date,
    row_number() over (partition by o.id order by a.check_in_time desc) as rn
  from public.delivery_orders o
  join public.delivery_attendance a
    on a.rider_id = o.rider_id
   and coalesce(o.registered_at, o.created_at, now()) >= a.check_in_time
   and coalesce(o.registered_at, o.created_at, now()) <= coalesce(a.check_out_time, a.check_in_time + interval '16 hours')
  where o.rider_id is not null
    and a.check_in_time is not null
)
update public.delivery_orders o
set attendance_id = m.attendance_id,
    work_date = m.work_date,
    updated_at = now()
from matched_orders m
where o.id = m.order_id
  and m.rn = 1
  and o.attendance_id is null;

-- 8) RPC: حضور/انصراف شيفت الدليفري، لا يقفل عند 12 بالليل
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
set search_path = public, extensions
as $$
declare
  v_session record;
  v_account record;
  v_rider record;
  v_now timestamptz := now();
  v_shift_date date := ((now() at time zone 'Africa/Cairo')::date);
  v_att public.delivery_attendance%rowtype;
begin
  if p_token is null or length(trim(p_token)) < 10 then
    return jsonb_build_object('success', false, 'error', 'invalid_session', 'message', 'جلسة غير صالحة');
  end if;

  select * into v_session
  from public.rider_sessions
  where session_token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > v_now)
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'expired_session', 'message', 'انتهت الجلسة');
  end if;

  select * into v_account
  from public.rider_accounts
  where id = v_session.account_id
    and status = 'active'
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'inactive_account', 'message', 'الحساب غير نشط');
  end if;

  select * into v_rider
  from public.riders
  where id = coalesce(v_session.rider_id, v_account.rider_id)
  limit 1;

  if p_action in ('check_in','checkin') then
    select * into v_att
    from public.delivery_attendance
    where rider_id = coalesce(v_session.rider_id, v_account.rider_id)
      and check_in_time is not null
      and check_out_time is null
      and coalesce(status, 'present') in ('present', 'open', 'manual_review')
    order by check_in_time desc
    limit 1;

    if found then
      return jsonb_build_object(
        'success', true,
        'action', 'already_open',
        'message', 'يوجد شيفت مفتوح بالفعل',
        'attendance_id', v_att.id,
        'work_date', v_att.shift_date,
        'attendance', jsonb_build_object(
          'id', v_att.id,
          'rider_id', v_att.rider_id,
          'branch_id', v_att.branch_id,
          'work_date', v_att.shift_date,
          'shift_date', v_att.shift_date,
          'check_in_at', v_att.check_in_time,
          'check_out_at', v_att.check_out_time,
          'check_in_time', v_att.check_in_time,
          'check_out_time', v_att.check_out_time,
          'total_minutes', v_att.total_minutes,
          'status', v_att.status
        )
      );
    end if;

    insert into public.delivery_attendance (
      rider_id, account_id, rider_name, branch_id, branch_name,
      shift_date, check_in_time, check_in_lat, check_in_lng, check_in_accuracy,
      total_minutes, status, needs_review, review_reason, created_at, updated_at
    ) values (
      coalesce(v_session.rider_id, v_account.rider_id), v_account.id, coalesce(v_rider.name, v_account.display_name, v_account.username),
      coalesce(v_account.branch_id, v_rider.branch_id), null,
      v_shift_date, v_now, p_lat, p_lng, p_accuracy_m,
      0,
      case when p_accuracy_m is not null and p_accuracy_m > 100 then 'manual_review' else 'present' end,
      case when p_accuracy_m is not null and p_accuracy_m > 100 then true else false end,
      case when p_accuracy_m is not null and p_accuracy_m > 100 then 'دقة GPS منخفضة (' || p_accuracy_m || ' متر)' else null end,
      v_now, v_now
    ) returning * into v_att;

    return jsonb_build_object(
      'success', true,
      'action', 'check_in',
      'attendance_id', v_att.id,
      'work_date', v_att.shift_date,
      'attendance', jsonb_build_object(
        'id', v_att.id,
        'rider_id', v_att.rider_id,
        'branch_id', v_att.branch_id,
        'work_date', v_att.shift_date,
        'shift_date', v_att.shift_date,
        'check_in_at', v_att.check_in_time,
        'check_out_at', v_att.check_out_time,
        'check_in_time', v_att.check_in_time,
        'check_out_time', v_att.check_out_time,
        'total_minutes', v_att.total_minutes,
        'status', v_att.status
      )
    );

  elsif p_action in ('check_out','checkout') then
    select * into v_att
    from public.delivery_attendance
    where rider_id = coalesce(v_session.rider_id, v_account.rider_id)
      and check_in_time is not null
      and check_out_time is null
      and coalesce(status, 'present') in ('present', 'open', 'manual_review')
    order by check_in_time desc
    limit 1;

    if not found then
      return jsonb_build_object('success', false, 'error', 'not_checked_in', 'message', 'يجب تسجيل الحضور أولاً');
    end if;

    update public.delivery_attendance
    set check_out_time = v_now,
        check_out_lat = p_lat,
        check_out_lng = p_lng,
        check_out_accuracy = p_accuracy_m,
        total_minutes = greatest(0, floor(extract(epoch from (v_now - check_in_time)) / 60)::int),
        status = case when p_accuracy_m is not null and p_accuracy_m > 100 then 'manual_review' else 'closed' end,
        needs_review = coalesce(needs_review, false) or (p_accuracy_m is not null and p_accuracy_m > 100),
        review_reason = case
          when p_accuracy_m is not null and p_accuracy_m > 100 then coalesce(review_reason, '') || ' | دقة GPS منخفضة عند الانصراف (' || p_accuracy_m || ' متر)'
          else review_reason
        end,
        updated_at = v_now
    where id = v_att.id
    returning * into v_att;

    return jsonb_build_object(
      'success', true,
      'action', 'check_out',
      'attendance_id', v_att.id,
      'work_date', v_att.shift_date,
      'total_minutes', v_att.total_minutes,
      'attendance', jsonb_build_object(
        'id', v_att.id,
        'rider_id', v_att.rider_id,
        'branch_id', v_att.branch_id,
        'work_date', v_att.shift_date,
        'shift_date', v_att.shift_date,
        'check_in_at', v_att.check_in_time,
        'check_out_at', v_att.check_out_time,
        'check_in_time', v_att.check_in_time,
        'check_out_time', v_att.check_out_time,
        'total_minutes', v_att.total_minutes,
        'status', v_att.status
      )
    );
  end if;

  return jsonb_build_object('success', false, 'error', 'invalid_action', 'message', 'إجراء غير صحيح');
end;
$$;

grant execute on function public.rider_check_in_out(text, text, double precision, double precision, int) to anon, authenticated;

-- 9) RPC: تسجيل أوردر مربوط بالشيفت المفتوح ويوم الشغل الحقيقي
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
set search_path = public, extensions
as $$
declare
  v_session record;
  v_account record;
  v_rider record;
  v_att record;
  v_order_id text;
  v_duplicate_id text;
  v_today date := ((now() at time zone 'Africa/Cairo')::date);
  v_work_date date;
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

  select * into v_session
  from public.rider_sessions
  where session_token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'expired_session', 'message', 'انتهت الجلسة');
  end if;

  select * into v_account
  from public.rider_accounts
  where id = v_session.account_id
    and status = 'active'
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'inactive_account', 'message', 'الحساب غير نشط');
  end if;

  select * into v_rider
  from public.riders
  where id = coalesce(v_session.rider_id, v_account.rider_id)
  limit 1;

  select * into v_att
  from public.delivery_attendance
  where rider_id = coalesce(v_session.rider_id, v_account.rider_id)
    and check_in_time is not null
    and check_out_time is null
    and coalesce(status, 'present') in ('present', 'open', 'manual_review')
  order by check_in_time desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_checked_in', 'message', 'يجب بدء الشيفت أولاً قبل تسجيل الأوردر');
  end if;

  v_work_date := v_att.shift_date;

  select id into v_duplicate_id
  from public.delivery_orders
  where invoice_number = trim(p_invoice_number)
    and branch_id = coalesce(v_account.branch_id, v_rider.branch_id)
    and coalesce(work_date, delivery_date, public.dawaa_operating_date(coalesce(registered_at, created_at, now()))) = v_work_date
  limit 1;

  if v_duplicate_id is not null then
    v_needs_review := true;
    v_review_reason := 'duplicate_invoice';
  elsif p_customer_id is null then
    v_needs_review := true;
    v_review_reason := 'manual_customer';
  elsif p_gps_accuracy_m is not null and p_gps_accuracy_m > 100 then
    v_needs_review := true;
    v_review_reason := 'gps_accuracy_weak';
  elsif coalesce(p_order_multiplier, 1) >= 1.5 then
    v_needs_review := true;
    v_review_reason := 'multiplier_order';
  end if;

  insert into public.delivery_orders (
    rider_id, rider_name, branch_id, branch_name, customer_id,
    delivery_date, work_date, attendance_id,
    invoice_number, invoice_no, invoice_amount, invoice_value,
    customer_code, customer_name, customer_phone, customer_address,
    customer_code_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot,
    status, registered_at, prepared_at, ready_at, dispatched_at, dispatch_status,
    dispatch_by, dispatch_by_name, picked_up_at, picked_up_by, picked_up_by_name,
    notes, source, created_source,
    is_duplicate_invoice, duplicate_warning, duplicate_review_status,
    needs_review, review_reason, review_status, approval_status,
    order_multiplier, is_multiplier_order, order_rate, order_earning,
    bconnect_match_status, reconciliation_status, is_countable, final_count_status,
    gps_lat, gps_lng, gps_accuracy_m,
    receipt_image_path, receipt_image_url, receipt_ocr_json, receipt_review_status,
    security_flags, updated_at
  ) values (
    coalesce(v_session.rider_id, v_account.rider_id), coalesce(v_rider.name, v_account.display_name, v_account.username), coalesce(v_account.branch_id, v_rider.branch_id), null, p_customer_id,
    v_today, v_work_date, v_att.id,
    trim(p_invoice_number), trim(p_invoice_number), coalesce(p_invoice_amount,0), coalesce(p_invoice_amount,0),
    p_customer_code, coalesce(nullif(p_customer_name,''),'عميل غير مسجل'), p_customer_phone, p_customer_address,
    p_customer_code, coalesce(nullif(p_customer_name,''),'عميل غير مسجل'), p_customer_phone, p_customer_address,
    'registered', now(), now(), now(), now(), 'dispatched',
    coalesce(v_session.rider_id, v_account.rider_id), coalesce(v_rider.name, v_account.display_name), now(), coalesce(v_session.rider_id, v_account.rider_id), coalesce(v_rider.name, v_account.display_name),
    p_notes, 'rider_app', 'secure_rpc_shift_v5',
    v_duplicate_id is not null, v_duplicate_id is not null, case when v_duplicate_id is not null then 'pending' else 'not_required' end,
    v_needs_review, v_review_reason, case when v_needs_review then 'pending' else 'pending' end, 'pending',
    coalesce(p_order_multiplier,1), coalesce(p_order_multiplier,1) >= 1.5, 0, 0,
    'pending', 'pending_reconciliation', true, 'pending_reconciliation',
    p_gps_lat, p_gps_lng, p_gps_accuracy_m,
    p_receipt_image_path, p_receipt_image_url, p_receipt_ocr_json, case when coalesce(p_receipt_image_path,'') <> '' then 'pending_admin_review' else 'not_uploaded' end,
    jsonb_build_object('created_via','secure_rpc_shift_v5','attendance_id',v_att.id,'work_date',v_work_date,'shift_started_at',v_att.check_in_time,'session_id',v_session.id), now()
  ) returning id into v_order_id;

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'attendance_id', v_att.id,
    'work_date', v_work_date,
    'is_duplicate', v_duplicate_id is not null,
    'needs_review', v_needs_review,
    'review_reason', v_review_reason
  );
end;
$$;

grant execute on function public.rider_create_order(text, uuid, text, text, text, text, text, numeric, numeric, text, double precision, double precision, int, text, text, jsonb) to anon, authenticated;

-- 10) RPC: بيانات الدليفري تعتمد على الشيفت المفتوح/work_date وليس اليوم التقويمي فقط
create or replace function public.rider_get_dashboard_data(
  p_token text,
  p_date_start date default null,
  p_date_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session record;
  v_account record;
  v_rider record;
  v_today date := ((now() at time zone 'Africa/Cairo')::date);
  v_start date;
  v_end date;
  v_att record;
  v_current_work_date date;
  v_att_json jsonb;
  v_orders jsonb;
  v_trips jsonb;
  v_notifs jsonb := '[]'::jsonb;
begin
  if p_token is null or length(trim(p_token)) < 10 then
    return jsonb_build_object('success', false, 'error', 'invalid_session');
  end if;

  select * into v_session
  from public.rider_sessions
  where session_token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'expired_session');
  end if;

  select * into v_account from public.rider_accounts where id = v_session.account_id limit 1;
  select * into v_rider from public.riders where id = coalesce(v_session.rider_id, v_account.rider_id) limit 1;

  v_start := coalesce(p_date_start, case when extract(day from v_today) >= 26 then (date_trunc('month', v_today)::date + interval '25 days')::date else (date_trunc('month', v_today - interval '1 month')::date + interval '25 days')::date end);
  v_end := coalesce(p_date_end, case when extract(day from v_today) >= 26 then (date_trunc('month', v_today + interval '1 month')::date + interval '24 days')::date else (date_trunc('month', v_today)::date + interval '24 days')::date end);

  select * into v_att
  from public.delivery_attendance
  where rider_id = coalesce(v_session.rider_id, v_account.rider_id)
    and (
      (check_in_time is not null and check_out_time is null)
      or shift_date = v_today
    )
  order by case when check_in_time is not null and check_out_time is null then 0 else 1 end,
           check_in_time desc nulls last,
           created_at desc
  limit 1;

  v_current_work_date := coalesce(v_att.shift_date, v_today);

  if v_att.id is not null then
    v_att_json := jsonb_build_object(
      'id', v_att.id,
      'rider_id', v_att.rider_id,
      'branch_id', v_att.branch_id,
      'work_date', v_att.shift_date,
      'shift_date', v_att.shift_date,
      'check_in_at', v_att.check_in_time,
      'check_out_at', v_att.check_out_time,
      'check_in_time', v_att.check_in_time,
      'check_out_time', v_att.check_out_time,
      'total_minutes', v_att.total_minutes,
      'status', v_att.status,
      'needs_review', v_att.needs_review,
      'review_reason', v_att.review_reason
    );
  else
    v_att_json := null;
  end if;

  select jsonb_build_object(
    'today', coalesce((
      select jsonb_agg(to_jsonb(o) order by coalesce(o.registered_at, o.created_at) desc)
      from public.delivery_orders o
      where o.rider_id = coalesce(v_session.rider_id, v_account.rider_id)
        and coalesce(o.work_date, o.delivery_date, public.dawaa_operating_date(coalesce(o.registered_at, o.created_at, now()))) = v_current_work_date
    ), '[]'::jsonb),
    'cycle', coalesce((
      select jsonb_agg(to_jsonb(o) order by coalesce(o.work_date, o.delivery_date, public.dawaa_operating_date(coalesce(o.registered_at, o.created_at, now()))) desc, coalesce(o.registered_at, o.created_at) desc)
      from public.delivery_orders o
      where o.rider_id = coalesce(v_session.rider_id, v_account.rider_id)
        and coalesce(o.work_date, o.delivery_date, public.dawaa_operating_date(coalesce(o.registered_at, o.created_at, now()))) between v_start and v_end
    ), '[]'::jsonb)
  ) into v_orders;

  select jsonb_build_object(
    'today', coalesce((
      select jsonb_agg(to_jsonb(t) order by coalesce(t.registered_at, t.created_at) desc)
      from public.internal_trips t
      where t.rider_id = coalesce(v_session.rider_id, v_account.rider_id)
        and coalesce(t.work_date, t.trip_date, public.dawaa_operating_date(coalesce(t.registered_at, t.created_at, now()))) = v_current_work_date
    ), '[]'::jsonb),
    'cycle', coalesce((
      select jsonb_agg(to_jsonb(t) order by coalesce(t.work_date, t.trip_date, public.dawaa_operating_date(coalesce(t.registered_at, t.created_at, now()))) desc, coalesce(t.registered_at, t.created_at) desc)
      from public.internal_trips t
      where t.rider_id = coalesce(v_session.rider_id, v_account.rider_id)
        and coalesce(t.work_date, t.trip_date, public.dawaa_operating_date(coalesce(t.registered_at, t.created_at, now()))) between v_start and v_end
    ), '[]'::jsonb)
  ) into v_trips;

  if to_regclass('public.rider_notifications') is not null then
    select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb) into v_notifs
    from public.rider_notifications n
    where (n.rider_id = coalesce(v_session.rider_id, v_account.rider_id) or n.rider_id is null)
    limit 20;
  end if;

  return jsonb_build_object(
    'success', true,
    'rider', to_jsonb(v_rider),
    'attendance', v_att_json,
    'current_work_date', v_current_work_date,
    'orders', v_orders,
    'trips', v_trips,
    'notifications', coalesce(v_notifs, '[]'::jsonb),
    'cycle_start', v_start,
    'cycle_end', v_end,
    'session_expires_at', v_session.expires_at
  );
end;
$$;

grant execute on function public.rider_get_dashboard_data(text, date, date) to anon, authenticated;

-- 11) View يومي للشيفتات: التقرير اليومي الصحيح حسب shift_date/work_date
create or replace view public.rider_shift_daily_summary as
select
  a.id as attendance_id,
  a.rider_id,
  coalesce(a.rider_name, r.name) as rider_name,
  a.branch_id,
  a.branch_name as branch_name,
  a.shift_date as work_date,
  a.check_in_time,
  a.check_out_time,
  coalesce(a.total_minutes, case when a.check_in_time is not null and a.check_out_time is not null then floor(extract(epoch from (a.check_out_time - a.check_in_time))/60)::int else 0 end) as total_minutes,
  round(coalesce(a.total_minutes, case when a.check_in_time is not null and a.check_out_time is not null then floor(extract(epoch from (a.check_out_time - a.check_in_time))/60)::int else 0 end)::numeric / 60, 2) as total_hours,
  count(o.id) as total_orders,
  count(o.id) filter (where coalesce(o.order_multiplier, 1) < 1.5) as orders_1x,
  count(o.id) filter (where coalesce(o.order_multiplier, 1) >= 1.5) as orders_1_5x,
  count(o.id) filter (where coalesce(o.is_duplicate_invoice, false) is true or coalesce(o.duplicate_warning, false) is true) as duplicate_orders,
  count(o.id) filter (where lower(coalesce(o.status,'')) in ('failed','fail','cancelled','canceled') or o.failed_at is not null) as failed_orders,
  count(o.id) filter (where coalesce(o.needs_review, false) is true) as review_orders,
  count(o.id) filter (where coalesce(o.is_countable, true) is false or coalesce(o.not_countable, false) is true or coalesce(o.excluded_from_incentive, false) is true) as uncounted_orders
from public.delivery_attendance a
left join public.riders r on r.id = a.rider_id
left join public.delivery_orders o on o.attendance_id = a.id
group by a.id, a.rider_id, coalesce(a.rider_name, r.name), a.branch_id, a.branch_name, a.shift_date, a.check_in_time, a.check_out_time, a.total_minutes;

grant select on public.rider_shift_daily_summary to anon, authenticated;

-- 12) تحديث View الداشبورد التنفيذي ليعتمد على work_date
create or replace view public.delivery_rider_cycle_scorecard as
with cycle_bounds as (
  select
    case
      when extract(day from current_date) >= 26
      then (date_trunc('month', current_date)::date + interval '25 days')::date
      else (date_trunc('month', current_date - interval '1 month')::date + interval '25 days')::date
    end as cycle_start,
    case
      when extract(day from current_date) >= 26
      then (date_trunc('month', current_date + interval '1 month')::date + interval '24 days')::date
      else (date_trunc('month', current_date)::date + interval '24 days')::date
    end as cycle_end
),
base as (
  select
    o.id as order_id,
    o.rider_id,
    coalesce(o.rider_name, o.driver_name, r.name, 'غير محدد') as rider_name,
    coalesce(o.branch_id, r.branch_id) as branch_id,
    case
      when coalesce(o.branch_id, r.branch_id)::text = '1a1d5a29-46d6-4f9c-9763-b768114fac9f' then 'فرع شكري'
      when coalesce(o.branch_id, r.branch_id)::text = '5950c09b-d45b-4e61-aa0a-388a0c9c92c7' then 'فرع الشامي'
      when lower(coalesce(o.branch_name, o.branch, '')) in ('shkri','shukri','shokry','shoukry','شكري','شكرى') then 'فرع شكري'
      when lower(coalesce(o.branch_name, o.branch, '')) in ('shamy','shami','elshamy','alshamy','الشامي') then 'فرع الشامي'
      else coalesce(o.branch_name, o.branch, 'غير محدد')
    end as branch_name,
    lower(coalesce(o.status, '')) as status_text,
    lower(coalesce(o.review_status, '')) as review_status_text,
    o.delivered_at,
    o.order_multiplier,
    o.is_multiplier_order,
    o.is_duplicate_invoice,
    o.duplicate_warning,
    o.failed_at,
    o.needs_review,
    o.excluded_from_incentive,
    o.not_countable,
    o.is_countable,
    coalesce(o.work_date, o.delivery_date, public.dawaa_operating_date(coalesce(o.registered_at, o.created_at, now()))) as order_date
  from public.delivery_orders o
  left join public.riders r on r.id = o.rider_id
  cross join cycle_bounds cb
  where coalesce(o.work_date, o.delivery_date, public.dawaa_operating_date(coalesce(o.registered_at, o.created_at, now()))) between cb.cycle_start and cb.cycle_end
),
flags as (
  select b.*,
    (b.status_text in ('registered','delivered','completed','done')) as is_registered,
    (b.status_text in ('delivered','completed','done') or b.delivered_at is not null) as is_delivered,
    (coalesce(b.order_multiplier, case when coalesce(b.is_multiplier_order,false) then 1.5 else 1 end) >= 1.5) as is_multiplier,
    (coalesce(b.is_duplicate_invoice,false) is true or coalesce(b.duplicate_warning,false) is true) as is_duplicate,
    (b.status_text in ('failed','fail','cancelled','canceled') or b.failed_at is not null or b.review_status_text = 'failed') as is_failed,
    (b.review_status_text = 'pending' and coalesce(b.needs_review,false) is false) as is_pending_reconciliation,
    (coalesce(b.needs_review,false) is true or b.review_status_text in ('needs_review','manual_review','not_found','missing_invoice')) as is_review,
    (coalesce(b.excluded_from_incentive,false) is true or coalesce(b.not_countable,false) is true or b.is_countable is false) as is_uncounted
  from base b
),
scored_orders as (
  select f.*,
    least(100,
      case when f.is_duplicate then 35 else 0 end
      + case when f.is_failed then 30 else 0 end
      + case when f.is_review then 25 else 0 end
      + case when f.is_uncounted then 15 else 0 end
      + case when f.is_pending_reconciliation then 3 else 0 end
    ) as order_risk_score
  from flags f
),
agg as (
  select
    rider_id, rider_name, branch_id, branch_name,
    count(*) as total_orders,
    count(*) filter (where is_registered) as registered_orders,
    count(*) filter (where is_delivered) as delivered_orders,
    count(*) filter (where is_multiplier) as multiplier_orders,
    count(*) filter (where is_duplicate) as duplicate_orders,
    count(*) filter (where is_failed) as failed_orders,
    count(*) filter (where is_pending_reconciliation) as pending_reconciliation_orders,
    count(*) filter (where is_review) as review_orders,
    count(*) filter (where is_uncounted) as uncounted_orders,
    round(avg(order_risk_score)::numeric, 2) as risk_rate
  from scored_orders
  group by rider_id, rider_name, branch_id, branch_name
)
select
  a.*,
  greatest(0, round((100 - coalesce(a.risk_rate, 0))::numeric, 2)) as accuracy_score,
  round(case when a.total_orders > 0 then (a.registered_orders::numeric / a.total_orders) * 100 else 0 end, 2) as operation_rate,
  round(case when a.total_orders > 0 then (a.delivered_orders::numeric / a.total_orders) * 100 else 0 end, 2) as delivery_rate
from agg a;

grant select on public.delivery_rider_cycle_scorecard to anon, authenticated;

notify pgrst, 'reload schema';
commit;
