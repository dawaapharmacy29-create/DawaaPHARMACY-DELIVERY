-- Fast, accurate rider trip entry.
-- Keeps trip creation idempotent and proof attachment bound to the authenticated rider session.

create or replace function public.rider_attach_trip_proof(
  p_token text,
  p_trip_id uuid,
  p_image_path text,
  p_image_url text,
  p_proof_sha256 text default null,
  p_captured_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.rider_sessions%rowtype;
  v_trip public.internal_trips%rowtype;
  v_sha text := nullif(trim(p_proof_sha256), '');
begin
  if nullif(trim(p_token), '') is null then
    return jsonb_build_object('success', false, 'error', 'session_token_required', 'message', 'جلسة المندوب مطلوبة');
  end if;

  select * into v_session from public.rider_sessions
  where session_token = p_token
    and coalesce(revoked,false) = false
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if v_session.id is null then
    return jsonb_build_object('success', false, 'error', 'expired_session', 'message', 'انتهت الجلسة، سجل الدخول مرة أخرى');
  end if;

  select * into v_trip from public.internal_trips
  where id = p_trip_id and rider_id = v_session.rider_id
  limit 1;

  if v_trip.id is null then
    return jsonb_build_object('success', false, 'error', 'trip_not_found', 'message', 'المشوار غير موجود أو لا يخص هذا المندوب');
  end if;

  if v_sha is not null and exists (
    select 1 from public.internal_trips where proof_sha256 = v_sha and id <> p_trip_id
  ) then
    return jsonb_build_object('success', false, 'error', 'duplicate_proof_image', 'message', 'هذه الصورة مستخدمة بالفعل في مشوار آخر وتحتاج مراجعة الإدارة');
  end if;

  update public.internal_trips
  set proof_image_path = nullif(trim(p_image_path), ''),
      proof_image_url = nullif(trim(p_image_url), ''),
      proof_sha256 = v_sha,
      proof_captured_at = coalesce(p_captured_at, proof_captured_at, now()),
      proof_uploaded_at = now(),
      proof_source = 'camera',
      proof_review_status = 'pending',
      evidence_type = case when coalesce(has_invoice_reference, false) then 'invoice_photo' else 'trip_photo' end,
      evidence_status = 'pending_admin_review',
      upload_status = 'uploaded',
      storage_path = nullif(trim(p_image_path), ''),
      proof_exception_status = 'none',
      proof_exception_reason = null,
      needs_review = case when review_reason = 'missing_shift' then true else false end,
      review_reason = case when review_reason = 'missing_trip_proof' then null else review_reason end,
      review_status = case when review_reason = 'missing_shift' then 'missing_shift' else 'pending_evidence_review' end,
      is_countable = true,
      updated_at = now()
  where id = p_trip_id
  returning * into v_trip;

  return jsonb_build_object('success', true, 'trip', to_jsonb(v_trip), 'message', 'تم ربط صورة إثبات المشوار بنجاح');
end;
$$;

grant execute on function public.rider_attach_trip_proof(text, uuid, text, text, text, timestamptz) to anon, authenticated;

create or replace function public.rider_create_trip_fast(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.rider_sessions%rowtype;
  v_rider public.riders%rowtype;
  v_trip public.internal_trips%rowtype;
  v_client_request_id text := nullif(trim(p_payload ->> 'client_request_id'), '');
  v_proof_sha256 text := nullif(trim(p_payload ->> 'proof_sha256'), '');
  v_payload_rider_id uuid;
  v_attendance_id uuid;
  v_trip_date date;
  v_work_date date;
  v_has_invoice_reference boolean;
  v_proof_required boolean;
  v_needs_review boolean;
  v_is_countable boolean;
begin
  if nullif(trim(p_token), '') is null then
    return jsonb_build_object('success', false, 'error', 'session_token_required', 'message', 'جلسة المندوب مطلوبة');
  end if;
  if v_client_request_id is null then
    return jsonb_build_object('success', false, 'error', 'client_request_id_required', 'message', 'معرف العملية مطلوب');
  end if;
  if nullif(trim(p_payload ->> 'trip_type'), '') is null
     or nullif(trim(p_payload ->> 'from_label'), '') is null
     or nullif(trim(p_payload ->> 'to_label'), '') is null then
    return jsonb_build_object('success', false, 'error', 'trip_core_fields_required', 'message', 'نوع المشوار وجهة الخروج والوصول مطلوبة');
  end if;

  select * into v_session from public.rider_sessions
  where session_token = p_token
    and coalesce(revoked,false) = false
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if v_session.id is null then
    return jsonb_build_object('success', false, 'error', 'expired_session', 'message', 'انتهت الجلسة، سجل الدخول مرة أخرى');
  end if;

  update public.rider_sessions set last_seen = now() where id = v_session.id;

  select * into v_rider from public.riders
  where id = v_session.rider_id and status = 'active'
  limit 1;

  if v_rider.id is null then
    return jsonb_build_object('success', false, 'error', 'inactive_account', 'message', 'الحساب غير نشط');
  end if;

  begin
    v_payload_rider_id := nullif(trim(p_payload ->> 'rider_id'), '')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('success', false, 'error', 'invalid_rider_id', 'message', 'معرف المندوب غير صالح');
  end;

  if v_payload_rider_id is not null and v_payload_rider_id <> v_rider.id then
    return jsonb_build_object('success', false, 'error', 'rider_identity_mismatch', 'message', 'لا يمكن تسجيل مشوار باسم مندوب آخر');
  end if;

  select * into v_trip from public.internal_trips
  where rider_id = v_rider.id and client_request_id = v_client_request_id
  limit 1;

  if v_trip.id is not null then
    return jsonb_build_object('success', true, 'created', false, 'trip', to_jsonb(v_trip), 'message', 'تم العثور على نفس المشوار المحفوظ سابقًا');
  end if;

  if exists (select 1 from public.internal_trips where client_request_id = v_client_request_id and rider_id <> v_rider.id) then
    return jsonb_build_object('success', false, 'error', 'client_request_id_conflict', 'message', 'معرف العملية مستخدم في حساب آخر');
  end if;

  if v_proof_sha256 is not null and exists (
    select 1 from public.internal_trips
    where proof_sha256 = v_proof_sha256
      and (rider_id <> v_rider.id or client_request_id is distinct from v_client_request_id)
  ) then
    return jsonb_build_object('success', false, 'error', 'duplicate_proof_image', 'message', 'هذه الصورة مستخدمة بالفعل في مشوار آخر وتحتاج مراجعة الإدارة');
  end if;

  begin v_attendance_id := nullif(trim(p_payload ->> 'attendance_id'), '')::uuid;
  exception when invalid_text_representation then v_attendance_id := null; end;
  begin v_trip_date := coalesce(nullif(trim(p_payload ->> 'trip_date'), '')::date, (now() at time zone 'Africa/Cairo')::date);
  exception when others then v_trip_date := (now() at time zone 'Africa/Cairo')::date; end;
  begin v_work_date := coalesce(nullif(trim(p_payload ->> 'work_date'), '')::date, v_trip_date);
  exception when others then v_work_date := v_trip_date; end;

  v_has_invoice_reference := coalesce((p_payload ->> 'has_invoice_reference')::boolean, false);
  v_proof_required := coalesce((p_payload ->> 'proof_required')::boolean, true);
  v_needs_review := coalesce((p_payload ->> 'needs_review')::boolean, false);
  v_is_countable := coalesce((p_payload ->> 'is_countable')::boolean, true);

  begin
    insert into public.internal_trips (
      rider_id, rider_name, branch_id, branch_name, trip_date, work_date, attendance_id,
      trip_type, from_label, to_label, reason, requested_by_name, related_invoice_number,
      has_invoice_reference, status, registered_at, notes, evidence_type, evidence_note,
      evidence_status, proof_required, proof_image_path, proof_image_url, proof_note,
      proof_captured_at, proof_uploaded_at, proof_source, proof_review_status,
      proof_exception_status, proof_exception_reason, proof_sha256, upload_status, storage_path,
      client_request_id, needs_review, review_reason, review_status, is_countable,
      trip_rate, trip_multiplier, trip_earning, created_at, updated_at
    ) values (
      v_rider.id, v_rider.name, v_rider.branch_id,
      coalesce(nullif(trim(p_payload ->> 'branch_name'), ''), v_rider.branch_name),
      v_trip_date, v_work_date, v_attendance_id,
      nullif(trim(p_payload ->> 'trip_type'), ''), nullif(trim(p_payload ->> 'from_label'), ''),
      nullif(trim(p_payload ->> 'to_label'), ''), coalesce(nullif(trim(p_payload ->> 'reason'), ''), 'مشوار'),
      nullif(trim(p_payload ->> 'requested_by_name'), ''), nullif(trim(p_payload ->> 'related_invoice_number'), ''),
      v_has_invoice_reference, 'pending_approval', now(), nullif(trim(p_payload ->> 'notes'), ''),
      nullif(trim(p_payload ->> 'evidence_type'), ''), nullif(trim(p_payload ->> 'evidence_note'), ''),
      nullif(trim(p_payload ->> 'evidence_status'), ''), v_proof_required,
      nullif(trim(p_payload ->> 'proof_image_path'), ''), nullif(trim(p_payload ->> 'proof_image_url'), ''),
      nullif(trim(p_payload ->> 'proof_note'), ''), nullif(trim(p_payload ->> 'proof_captured_at'), '')::timestamptz,
      nullif(trim(p_payload ->> 'proof_uploaded_at'), '')::timestamptz, nullif(trim(p_payload ->> 'proof_source'), ''),
      nullif(trim(p_payload ->> 'proof_review_status'), ''), coalesce(nullif(trim(p_payload ->> 'proof_exception_status'), ''), 'none'),
      nullif(trim(p_payload ->> 'proof_exception_reason'), ''), v_proof_sha256,
      nullif(trim(p_payload ->> 'upload_status'), ''), nullif(trim(p_payload ->> 'storage_path'), ''),
      v_client_request_id, v_needs_review, nullif(trim(p_payload ->> 'review_reason'), ''),
      nullif(trim(p_payload ->> 'review_status'), ''), v_is_countable,
      coalesce(nullif(trim(p_payload ->> 'trip_rate'), '')::numeric, v_rider.trip_rate, 10),
      coalesce(nullif(trim(p_payload ->> 'trip_multiplier'), '')::numeric, 1),
      coalesce(nullif(trim(p_payload ->> 'trip_earning'), '')::numeric, coalesce(v_rider.trip_rate,10)),
      now(), now()
    ) returning * into v_trip;
  exception when unique_violation then
    select * into v_trip from public.internal_trips
    where rider_id = v_rider.id and client_request_id = v_client_request_id limit 1;
    if v_trip.id is not null then
      return jsonb_build_object('success', true, 'created', false, 'trip', to_jsonb(v_trip), 'message', 'تم العثور على نفس المشوار المحفوظ سابقًا');
    end if;
    raise;
  end;

  return jsonb_build_object('success', true, 'created', true, 'trip', to_jsonb(v_trip), 'message', 'تم تسجيل المشوار بنجاح');
end;
$$;

grant execute on function public.rider_create_trip_fast(text, jsonb) to anon, authenticated;
