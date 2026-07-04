-- 0075_fix_rider_create_order_uuid_coalesce.sql
-- Fix uuid/text COALESCE mismatch in rider_create_order.

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
  p_is_duplicate_invoice boolean default false,
  p_duplicate_reason text default null,
  p_duplicate_note text default null,
  p_preparing_doctor_name text default null,
  p_original_order_id uuid default null,
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
  v_order_id uuid;
  v_duplicate_id uuid;
  v_today date := ((now() at time zone 'Africa/Cairo')::date);
  v_work_date date;
  v_missing_shift boolean := false;
  v_needs_review boolean := false;
  v_review_reason text := null;
  v_review_status text := 'pending';
begin
  if coalesce(trim(p_invoice_number),'') = '' then
    return jsonb_build_object('success', false, 'error', 'invoice_required', 'message', 'رقم الفاتورة مطلوب');
  end if;

  select * into v_session from public.rider_sessions
  where session_token = p_token
    and coalesce(revoked,false) = false
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'expired_session', 'message', 'انتهت الجلسة، سجل الدخول مرة أخرى');
  end if;

  update public.rider_sessions set last_seen = now() where id = v_session.id;

  select * into v_account from public.rider_accounts
  where id = v_session.account_id and status = 'active'
  limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'inactive_account', 'message', 'الحساب غير نشط');
  end if;

  select * into v_rider from public.riders
  where id = coalesce(v_session.rider_id, v_account.rider_id)
  limit 1;

  select * into v_att from public.delivery_attendance
  where rider_id = coalesce(v_session.rider_id, v_account.rider_id)
    and check_in_time is not null
    and check_out_time is null
  order by check_in_time desc nulls last, created_at desc
  limit 1;

  if found then
    v_work_date := coalesce(v_att.shift_date, v_today);
  else
    v_work_date := v_today;
    v_missing_shift := true;
  end if;

  select id into v_duplicate_id
  from public.delivery_orders
  where (invoice_number = trim(p_invoice_number) or invoice_no = trim(p_invoice_number))
    and deleted_at is null
  order by registered_at asc
  limit 1;

  if v_duplicate_id is not null then
    if p_is_duplicate_invoice is not true
      or coalesce(trim(p_duplicate_reason),'') = ''
      or coalesce(trim(p_duplicate_note),'') = ''
      or coalesce(trim(p_preparing_doctor_name),'') = '' then
      return jsonb_build_object(
        'success', false,
        'error', 'DUPLICATE_REASON_REQUIRED',
        'message', 'رقم الفاتورة مكرر. يجب كتابة سبب التكرار وملاحظة واضحة واسم الدكتور قبل الحفظ.'
      );
    end if;
    v_needs_review := true;
    v_review_reason := 'duplicate_invoice';
    v_review_status := 'pending';
  elsif v_missing_shift then
    v_needs_review := true;
    v_review_reason := 'missing_shift';
    v_review_status := 'missing_shift';
  elsif p_gps_accuracy_m is not null and p_gps_accuracy_m > 100 then
    v_needs_review := true;
    v_review_reason := 'gps_accuracy_weak';
  elsif coalesce(p_order_multiplier, 1) >= 1.5 then
    v_needs_review := true;
    v_review_reason := 'multiplier_order';
  end if;

  insert into public.delivery_orders(
    rider_id, rider_name, branch_id, customer_id,
    delivery_date, work_date, attendance_id,
    invoice_number, invoice_no, invoice_amount, invoice_value,
    customer_code, customer_name, customer_phone, customer_address,
    customer_code_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot,
    status, registered_at, prepared_at, ready_at, dispatched_at, dispatch_status,
    dispatch_by, dispatch_by_name, picked_up_at, picked_up_by, picked_up_by_name,
    notes, source, created_source,
    is_duplicate_invoice, duplicate_reason, duplicate_note, preparing_doctor_name, original_order_id, duplicate_review_status,
    needs_review, review_reason, review_status, approval_status,
    order_multiplier, is_multiplier_order, order_rate, order_earning,
    bconnect_match_status, reconciliation_status, is_countable, final_count_status,
    gps_lat, gps_lng, gps_accuracy_m,
    receipt_image_path, receipt_image_url, receipt_ocr_json, receipt_review_status,
    security_flags, updated_at
  ) values (
    coalesce(v_session.rider_id, v_account.rider_id),
    coalesce(v_rider.name, v_account.display_name, v_account.username),
    coalesce(v_account.branch_id, v_rider.branch_id),
    p_customer_id,
    v_today, v_work_date, case when v_missing_shift then null else v_att.id end,
    trim(p_invoice_number), trim(p_invoice_number), coalesce(p_invoice_amount, 0), coalesce(p_invoice_amount, 0),
    p_customer_code, coalesce(nullif(p_customer_name, ''), 'عميل غير مسجل'), p_customer_phone, p_customer_address,
    p_customer_code, coalesce(nullif(p_customer_name, ''), 'عميل غير مسجل'), p_customer_phone, p_customer_address,
    'registered', now(), now(), now(), now(), 'dispatched',
    coalesce(v_session.rider_id, v_account.rider_id),
    coalesce(v_rider.name, v_account.display_name),
    now(),
    coalesce(v_session.rider_id, v_account.rider_id),
    coalesce(v_rider.name, v_account.display_name),
    p_notes, 'rider_app', 'secure_rpc_duplicate_invoice_v1',
    v_duplicate_id is not null,
    case when v_duplicate_id is not null then coalesce(nullif(trim(p_duplicate_reason),''), null) else null end,
    case when v_duplicate_id is not null then coalesce(nullif(trim(p_duplicate_note),''), null) else null end,
    case when v_duplicate_id is not null then coalesce(nullif(trim(p_preparing_doctor_name),''), null) else null end,
    case when v_duplicate_id is not null then coalesce(p_original_order_id, v_duplicate_id) else null end,
    case when v_duplicate_id is not null then 'pending' else 'not_required' end,
    v_needs_review,
    v_review_reason,
    v_review_status,
    'pending',
    coalesce(p_order_multiplier, 1),
    coalesce(p_order_multiplier, 1) >= 1.5,
    0, 0,
    'pending', 'pending_reconciliation', not v_missing_shift, 'pending_reconciliation',
    p_gps_lat, p_gps_lng, p_gps_accuracy_m,
    p_receipt_image_path, p_receipt_image_url, p_receipt_ocr_json,
    case when coalesce(p_receipt_image_path, '') <> '' then 'pending_admin_review' else 'not_uploaded' end,
    jsonb_build_object(
      'created_via', 'secure_rpc_duplicate_invoice_v1',
      'missing_shift', v_missing_shift,
      'attendance_id', case when v_missing_shift then null else v_att.id end,
      'session_id', v_session.id
    ),
    now()
  ) returning id into v_order_id;

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'attendance_id', case when v_missing_shift then null else v_att.id end,
    'work_date', v_work_date,
    'is_duplicate', v_duplicate_id is not null,
    'needs_review', v_needs_review,
    'review_reason', v_review_reason,
    'message', case when v_missing_shift then 'تم تسجيل الأوردر، وسيتم مراجعته إداريًا لأن الشيفت غير ظاهر.' else 'تم تسجيل الأوردر بنجاح' end
  );
end;
$$;

grant execute on function public.rider_create_order(text, uuid, text, text, text, text, text, numeric, numeric, text, boolean, text, text, text, uuid, double precision, double precision, int, text, text, jsonb) to anon, authenticated;
