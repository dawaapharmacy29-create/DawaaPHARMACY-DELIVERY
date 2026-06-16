-- ══════════════════════════════════════════════════════════════════
-- Migration 37: Rider App RPC Integration Layer
-- Safe: no DROP data, no DELETE, no TRUNCATE
-- Purpose: يجعل صفحة الدليفري تستخدم session_token + RPCs بدل الاعتماد الكامل على direct table access
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1) تأكيد الجداول والأعمدة الأساسية
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rider_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL,
  account_id UUID,
  session_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '12 hours'),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_rider_sessions_token
ON public.rider_sessions(session_token)
WHERE revoked = FALSE;

CREATE INDEX IF NOT EXISTS idx_rider_sessions_rider
ON public.rider_sessions(rider_id, expires_at DESC);

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS work_date DATE;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS total_minutes INT DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_rider_work_date
ON public.attendance(rider_id, work_date);

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS delivery_date DATE DEFAULT ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_value NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_code_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_address_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS manual_customer BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_multiplier NUMERIC DEFAULT 1;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'registered';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_duplicate_invoice BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_warning BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS created_source TEXT DEFAULT 'rider_app_secure';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_countable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS final_count_status TEXT DEFAULT 'pending_reconciliation';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS trip_date DATE DEFAULT ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 2) دالة حساب دورة الصيدلية من 26 إلى 25
-- ============================================================

CREATE OR REPLACE FUNCTION public.dawaa_cycle_start(p_day DATE DEFAULT ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE))
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(DAY FROM p_day)::INT >= 26
      THEN make_date(EXTRACT(YEAR FROM p_day)::INT, EXTRACT(MONTH FROM p_day)::INT, 26)
    ELSE (make_date(EXTRACT(YEAR FROM p_day)::INT, EXTRACT(MONTH FROM p_day)::INT, 26) - INTERVAL '1 month')::DATE
  END;
$$;

CREATE OR REPLACE FUNCTION public.dawaa_cycle_end(p_day DATE DEFAULT ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE))
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (public.dawaa_cycle_start(p_day) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
$$;

-- ============================================================
-- 3) validate session
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_validate_session(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session public.rider_sessions%ROWTYPE;
  v_rider RECORD;
BEGIN
  IF p_token IS NULL OR TRIM(p_token) = '' THEN
    RETURN json_build_object('valid', false, 'error', 'missing_token');
  END IF;

  SELECT * INTO v_session
  FROM public.rider_sessions
  WHERE session_token = p_token
    AND COALESCE(revoked, FALSE) = FALSE
    AND expires_at > NOW()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', 'session_expired_or_invalid');
  END IF;

  SELECT r.id, r.name, r.branch_id, r.branch_name, r.status
  INTO v_rider
  FROM public.riders r
  WHERE r.id = v_session.rider_id
    AND COALESCE(r.status, 'active') = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', 'rider_not_active');
  END IF;

  UPDATE public.rider_sessions
  SET last_seen = NOW(),
      expires_at = GREATEST(expires_at, NOW() + INTERVAL '2 hours')
  WHERE id = v_session.id;

  RETURN json_build_object(
    'valid', true,
    'rider_id', v_rider.id,
    'rider_name', v_rider.name,
    'branch_id', v_rider.branch_id,
    'branch_name', v_rider.branch_name,
    'account_id', v_session.account_id,
    'expires_at', v_session.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_validate_session(TEXT) TO anon, authenticated;

-- ============================================================
-- 4) check-in / check-out آمن
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_check_in_out(
  p_token TEXT,
  p_action TEXT,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session JSON;
  v_rider_id UUID;
  v_today DATE := ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
  v_now TIMESTAMPTZ := NOW();
  v_att public.attendance%ROWTYPE;
  v_rider RECORD;
BEGIN
  v_session := public.rider_validate_session(p_token);
  IF NOT COALESCE((v_session->>'valid')::BOOLEAN, FALSE) THEN
    RETURN json_build_object('success', false, 'error', 'session_invalid');
  END IF;
  v_rider_id := (v_session->>'rider_id')::UUID;

  SELECT * INTO v_rider FROM public.riders WHERE id = v_rider_id LIMIT 1;

  SELECT * INTO v_att
  FROM public.attendance
  WHERE rider_id = v_rider_id AND work_date = v_today
  LIMIT 1;

  IF p_action IN ('check_in', 'checkin') THEN
    IF FOUND AND v_att.check_in_at IS NOT NULL THEN
      RETURN json_build_object('success', false, 'error', 'already_checked_in', 'message', 'تم تسجيل الحضور مسبقاً');
    END IF;

    INSERT INTO public.attendance (rider_id, rider_name, branch_id, branch_name, work_date, check_in_at, status, created_at, updated_at)
    VALUES (v_rider_id, v_rider.name, v_rider.branch_id, v_rider.branch_name, v_today, v_now, 'present', v_now, v_now)
    ON CONFLICT (rider_id, work_date)
    DO UPDATE SET check_in_at = COALESCE(public.attendance.check_in_at, v_now), status = 'present', updated_at = v_now;

  ELSIF p_action IN ('check_out', 'checkout') THEN
    IF NOT FOUND OR v_att.check_in_at IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'not_checked_in', 'message', 'يجب تسجيل الحضور أولاً');
    END IF;
    IF v_att.check_out_at IS NOT NULL THEN
      RETURN json_build_object('success', false, 'error', 'already_checked_out', 'message', 'تم تسجيل الانصراف مسبقاً');
    END IF;

    UPDATE public.attendance
    SET check_out_at = v_now,
        total_minutes = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - check_in_at)) / 60)::INT),
        updated_at = v_now
    WHERE rider_id = v_rider_id AND work_date = v_today;
  ELSE
    RETURN json_build_object('success', false, 'error', 'invalid_action');
  END IF;

  RETURN json_build_object('success', true, 'action', p_action, 'at', v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_check_in_out(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;

-- ============================================================
-- 5) secure dashboard data
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_get_dashboard_data(
  p_token TEXT,
  p_date_start DATE DEFAULT NULL,
  p_date_end DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session JSON;
  v_rider_id UUID;
  v_today DATE := ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
  v_start DATE;
  v_end DATE;
  v_att JSON;
  v_orders JSON;
  v_trips JSON;
  v_notifs JSON;
  v_rider_row RECORD;
BEGIN
  v_session := public.rider_validate_session(p_token);
  IF NOT COALESCE((v_session->>'valid')::BOOLEAN, FALSE) THEN
    RETURN json_build_object('success', false, 'error', v_session->>'error');
  END IF;
  v_rider_id := (v_session->>'rider_id')::UUID;
  v_start := COALESCE(p_date_start, public.dawaa_cycle_start(v_today));
  v_end := COALESCE(p_date_end, public.dawaa_cycle_end(v_today));

  SELECT * INTO v_rider_row FROM public.riders WHERE id = v_rider_id LIMIT 1;

  SELECT row_to_json(a) INTO v_att
  FROM public.attendance a
  WHERE a.rider_id = v_rider_id
    AND (a.work_date = v_today OR a.check_out_at IS NULL)
  ORDER BY CASE WHEN a.work_date = v_today THEN 0 ELSE 1 END, a.created_at DESC
  LIMIT 1;

  SELECT json_build_object(
    'today', COALESCE((SELECT json_agg(o ORDER BY COALESCE(o.registered_at, o.created_at) DESC) FROM public.delivery_orders o WHERE o.rider_id = v_rider_id AND COALESCE(o.delivery_date, (COALESCE(o.registered_at, o.created_at) AT TIME ZONE 'Africa/Cairo')::DATE) = v_today AND o.deleted_at IS NULL), '[]'::json),
    'cycle', COALESCE((SELECT json_agg(o ORDER BY COALESCE(o.delivery_date, (COALESCE(o.registered_at, o.created_at) AT TIME ZONE 'Africa/Cairo')::DATE) DESC) FROM public.delivery_orders o WHERE o.rider_id = v_rider_id AND COALESCE(o.delivery_date, (COALESCE(o.registered_at, o.created_at) AT TIME ZONE 'Africa/Cairo')::DATE) BETWEEN v_start AND v_end AND o.deleted_at IS NULL), '[]'::json)
  ) INTO v_orders;

  SELECT json_build_object(
    'today', COALESCE((SELECT json_agg(t ORDER BY COALESCE(t.registered_at, t.created_at) DESC) FROM public.internal_trips t WHERE t.rider_id = v_rider_id AND COALESCE(t.trip_date, (COALESCE(t.registered_at, t.created_at) AT TIME ZONE 'Africa/Cairo')::DATE) = v_today), '[]'::json),
    'cycle', COALESCE((SELECT json_agg(t ORDER BY COALESCE(t.trip_date, (COALESCE(t.registered_at, t.created_at) AT TIME ZONE 'Africa/Cairo')::DATE) DESC) FROM public.internal_trips t WHERE t.rider_id = v_rider_id AND COALESCE(t.trip_date, (COALESCE(t.registered_at, t.created_at) AT TIME ZONE 'Africa/Cairo')::DATE) BETWEEN v_start AND v_end), '[]'::json)
  ) INTO v_trips;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    SELECT COALESCE(json_agg(n ORDER BY n.created_at DESC), '[]'::json) INTO v_notifs
    FROM public.notifications n
    WHERE (n.rider_id = v_rider_id OR n.rider_id IS NULL)
      AND COALESCE(n.is_read, FALSE) = FALSE
    LIMIT 20;
  ELSE
    v_notifs := '[]'::json;
  END IF;

  RETURN json_build_object(
    'success', true,
    'rider', row_to_json(v_rider_row),
    'attendance', v_att,
    'orders', v_orders,
    'trips', v_trips,
    'notifications', COALESCE(v_notifs, '[]'::json),
    'cycle_start', v_start,
    'cycle_end', v_end,
    'session_expires_at', v_session->>'expires_at'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_get_dashboard_data(TEXT, DATE, DATE) TO anon, authenticated;

-- ============================================================
-- 6) secure customer search with * wildcard
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_search_customers(
  p_token TEXT,
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session JSON;
  v_pattern TEXT;
BEGIN
  v_session := public.rider_validate_session(p_token);
  IF NOT COALESCE((v_session->>'valid')::BOOLEAN, FALSE) THEN
    RETURN json_build_object('success', false, 'error', 'session_invalid', 'data', '[]'::json);
  END IF;

  v_pattern := '%' || REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(p_query, '')), '*', '%'), '_', ''), '''', ''), ' ', '%') || '%';

  RETURN json_build_object(
    'success', true,
    'data', (
      SELECT COALESCE(json_agg(c), '[]'::json)
      FROM (
        SELECT id,
               COALESCE(customer_code, code) AS code,
               COALESCE(customer_name, name) AS name,
               COALESCE(customer_phone, phone, mobile) AS phone,
               COALESCE(customer_address, address) AS address,
               branch_name
        FROM public.customers
        WHERE COALESCE(active, TRUE) = TRUE
          AND (
            COALESCE(customer_code, code, '') ILIKE v_pattern
            OR COALESCE(customer_name, name, '') ILIKE v_pattern
            OR COALESCE(customer_phone, phone, mobile, '') ILIKE v_pattern
            OR COALESCE(customer_address, address, '') ILIKE v_pattern
          )
        ORDER BY COALESCE(customer_name, name)
        LIMIT LEAST(COALESCE(p_limit, 20), 50)
      ) c
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_search_customers(TEXT, TEXT, INT) TO anon, authenticated;

-- ============================================================
-- 7) secure order creation
-- delivery_orders.id عندك غالباً TEXT، لذلك v_order_id TEXT
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_create_order(
  p_token TEXT,
  p_customer_id UUID DEFAULT NULL,
  p_customer_code TEXT DEFAULT NULL,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_address TEXT DEFAULT NULL,
  p_invoice_number TEXT DEFAULT NULL,
  p_invoice_amount NUMERIC DEFAULT 0,
  p_order_multiplier NUMERIC DEFAULT 1,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session JSON;
  v_rider_id UUID;
  v_rider RECORD;
  v_today DATE := ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
  v_is_dup BOOLEAN := FALSE;
  v_order_id TEXT;
BEGIN
  v_session := public.rider_validate_session(p_token);
  IF NOT COALESCE((v_session->>'valid')::BOOLEAN, FALSE) THEN
    RETURN json_build_object('success', false, 'error', 'session_invalid');
  END IF;
  v_rider_id := (v_session->>'rider_id')::UUID;

  SELECT * INTO v_rider FROM public.riders WHERE id = v_rider_id LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM public.attendance
    WHERE rider_id = v_rider_id AND work_date = v_today AND check_in_at IS NOT NULL AND check_out_at IS NULL
  ) THEN
    RETURN json_build_object('success', false, 'error', 'not_checked_in', 'message', 'يجب تسجيل الحضور أولاً');
  END IF;

  IF p_invoice_number IS NOT NULL AND TRIM(p_invoice_number) <> '' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.delivery_orders
      WHERE (invoice_number = TRIM(p_invoice_number) OR invoice_no = TRIM(p_invoice_number))
        AND delivery_date = v_today
        AND deleted_at IS NULL
    ) INTO v_is_dup;
  END IF;

  INSERT INTO public.delivery_orders (
    rider_id, rider_name, branch_id, branch_name,
    customer_id, customer_code, customer_name, customer_phone, customer_address,
    customer_code_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot,
    invoice_number, invoice_no, invoice_amount, invoice_value,
    order_multiplier, status, review_status, approval_status,
    is_duplicate_invoice, duplicate_warning,
    delivery_date, registered_at, manual_customer, created_source,
    notes, is_countable, final_count_status, updated_at
  ) VALUES (
    v_rider_id, v_rider.name, v_rider.branch_id, v_rider.branch_name,
    p_customer_id, p_customer_code, COALESCE(NULLIF(p_customer_name, ''), 'عميل غير مسجل'), p_customer_phone, p_customer_address,
    p_customer_code, COALESCE(NULLIF(p_customer_name, ''), 'عميل غير مسجل'), p_customer_phone, p_customer_address,
    TRIM(p_invoice_number), TRIM(p_invoice_number), COALESCE(p_invoice_amount, 0), COALESCE(p_invoice_amount, 0),
    COALESCE(p_order_multiplier, 1), 'registered', CASE WHEN v_is_dup OR COALESCE(p_order_multiplier, 1) >= 1.5 THEN 'needs_review' ELSE 'pending' END, 'pending',
    v_is_dup, v_is_dup,
    v_today, NOW(), (p_customer_id IS NULL), 'rider_app_secure',
    p_notes, FALSE, 'pending_reconciliation', NOW()
  )
  RETURNING id INTO v_order_id;

  RETURN json_build_object('success', true, 'order_id', v_order_id, 'is_duplicate', v_is_dup);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_create_order(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO anon, authenticated;

-- ============================================================
-- 8) logout
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_logout(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.rider_sessions
  SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'user_logout'
  WHERE session_token = p_token;
  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_logout(TEXT) TO anon, authenticated;

-- ============================================================
-- 9) لا يوجد REVOKE قاسي هنا حتى لا يتوقف التطبيق القديم.
-- بعد اختبار النسخة الجديدة، يمكن عمل Migration 38 لإغلاق direct anon access.
-- ============================================================

NOTIFY pgrst, 'reload schema';
