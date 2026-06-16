-- ══════════════════════════════════════════════════════════════════
-- Migration 35: Security Hardening — RLS, PIN hashing, session tokens
-- ══════════════════════════════════════════════════════════════════
-- STRATEGY:
-- الـ Rider app يستخدم anon key (مش Supabase Auth)
-- الحل: security-definer RPCs فقط هي اللي تعمل write، مش direct table access
-- RLS يسمح بـ SELECT للـ rider على بيانات نفسه فقط
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ══════════════════════════════════════════════════════════
-- 1. RIDER_SESSIONS TABLE — token-based session (مش localStorage فقط)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.rider_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id    UUID NOT NULL,
  account_id  UUID,
  session_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '12 hours'),
  last_seen   TIMESTAMPTZ DEFAULT now(),
  ip_address  TEXT,
  user_agent  TEXT,
  revoked     BOOLEAN DEFAULT false,
  revoked_at  TIMESTAMPTZ,
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_rider_sessions_token ON public.rider_sessions(session_token) WHERE NOT revoked;
CREATE INDEX IF NOT EXISTS idx_rider_sessions_rider ON public.rider_sessions(rider_id, expires_at DESC);

-- cleanup تلقائي للجلسات المنتهية
CREATE OR REPLACE FUNCTION public.cleanup_expired_rider_sessions()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.rider_sessions WHERE expires_at < now() - INTERVAL '1 day';
$$;

-- ══════════════════════════════════════════════════════════
-- 2. LOGIN ATTEMPTS TABLE — rate limiting
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT NOT NULL,
  ip_address  TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success     BOOLEAN DEFAULT false,
  failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time ON public.login_attempts(username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON public.login_attempts(ip_address, attempted_at DESC);

-- ══════════════════════════════════════════════════════════
-- 3. تأمين rider_accounts — إزالة anon write، إضافة PIN hashing
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.rider_accounts ENABLE ROW LEVEL SECURITY;

-- احذف السياسات القديمة المفتوحة
DROP POLICY IF EXISTS "rider_accounts_anon_read" ON public.rider_accounts;
DROP POLICY IF EXISTS "rider_accounts_anon_update" ON public.rider_accounts;
DROP POLICY IF EXISTS "rider_accounts_authenticated_all" ON public.rider_accounts;

-- السياسة الجديدة: لا أحد يقدر يقرأ rider_accounts مباشرة إلا من خلال RPC
CREATE POLICY "rider_accounts_no_direct_access"
ON public.rider_accounts
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- الأدمن فقط يقدر يقرأ عبر Supabase Auth
CREATE POLICY "rider_accounts_admin_read"
ON public.rider_accounts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager')
    AND status = 'active'
  )
);

-- ══════════════════════════════════════════════════════════
-- 4. تأمين delivery_orders — rider يقرأ بيانات نفسه فقط
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_orders_anon_all" ON public.delivery_orders;

-- Rider يقدر يقرأ أوردرات نفسه فقط (بالـ session token)
-- الـ admins/managers يقدروا يقروا كل حاجة
CREATE POLICY "delivery_orders_admin_full"
ON public.delivery_orders
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager', 'branch_manager')
    AND status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager', 'branch_manager')
    AND status = 'active'
  )
);

-- Rider RPC only — يحصل على بيانات نفسه عبر security-definer RPC
-- No direct anon access to delivery_orders

-- ══════════════════════════════════════════════════════════
-- 5. تأمين attendance — نفس منطق delivery_orders
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_anon_all" ON public.attendance;
DROP POLICY IF EXISTS "attendance_read_runtime" ON public.attendance;
DROP POLICY IF EXISTS "attendance_write_runtime" ON public.attendance;
DROP POLICY IF EXISTS "attendance_update_runtime" ON public.attendance;

CREATE POLICY "attendance_admin_full"
ON public.attendance
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager', 'branch_manager')
    AND status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager', 'branch_manager')
    AND status = 'active'
  )
);

-- ══════════════════════════════════════════════════════════
-- 6. تأمين riders table
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "riders_anon_read" ON public.riders;
DROP POLICY IF EXISTS "riders_anon_update" ON public.riders;

-- Admin/manager يقرأ كل شيء
CREATE POLICY "riders_admin_full"
ON public.riders
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager', 'branch_manager')
    AND status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager', 'branch_manager')
    AND status = 'active'
  )
);

-- ══════════════════════════════════════════════════════════
-- 7. تأمين internal_trips
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.internal_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal_trips_anon_all" ON public.internal_trips;

CREATE POLICY "internal_trips_admin_full"
ON public.internal_trips
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager', 'branch_manager')
    AND status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager', 'branch_manager')
    AND status = 'active'
  )
);

-- ══════════════════════════════════════════════════════════
-- 8. تأمين notifications
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_anon_all" ON public.notifications;

CREATE POLICY "notifications_admin_full"
ON public.notifications
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager', 'branch_manager')
    AND status = 'active'
  )
)
WITH CHECK (true);

-- ══════════════════════════════════════════════════════════
-- 9. RPC جديد: rider_validate_session
-- الـ rider app يبعت الـ token كل request، والـ RPC يتحقق منه
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rider_validate_session(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.rider_sessions%ROWTYPE;
  v_rider RECORD;
BEGIN
  -- تحقق من الـ token
  SELECT * INTO v_session
  FROM public.rider_sessions
  WHERE session_token = p_token
    AND NOT revoked
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', 'session_expired_or_invalid');
  END IF;

  -- جلب بيانات الـ rider
  SELECT r.id, r.name, r.branch_id, r.branch_name, r.status
  INTO v_rider
  FROM public.riders r
  WHERE r.id = v_session.rider_id
    AND r.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', 'rider_not_active');
  END IF;

  -- تحديث last_seen
  UPDATE public.rider_sessions
  SET last_seen = now(),
      expires_at = GREATEST(expires_at, now() + INTERVAL '2 hours')
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

-- ══════════════════════════════════════════════════════════
-- 10. تحديث rider_pin_login — يرجع session token + rate limiting حقيقي
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rider_pin_login(
  p_username TEXT,
  p_pin      TEXT,
  p_ip       TEXT DEFAULT NULL,
  p_ua       TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account  public.rider_accounts%ROWTYPE;
  v_rider    public.riders%ROWTYPE;
  v_token    TEXT;
  v_attempts INT;
  v_window   INTERVAL := INTERVAL '15 minutes';
  v_max_att  INT := 5;
BEGIN
  -- Rate limiting: كم محاولة فاشلة في آخر 15 دقيقة؟
  SELECT COUNT(*) INTO v_attempts
  FROM public.login_attempts
  WHERE username = UPPER(TRIM(p_username))
    AND success = false
    AND attempted_at > now() - v_window;

  IF v_attempts >= v_max_att THEN
    INSERT INTO public.login_attempts(username, ip_address, success, failure_reason)
    VALUES (UPPER(TRIM(p_username)), p_ip, false, 'rate_limited');

    RETURN json_build_object(
      'success', false,
      'error', 'account_locked',
      'message', 'تم إيقاف الحساب مؤقتاً بعد محاولات متعددة. انتظر 15 دقيقة.'
    );
  END IF;

  -- البحث عن الحساب
  SELECT * INTO v_account
  FROM public.rider_accounts
  WHERE username = UPPER(TRIM(p_username))
    AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.login_attempts(username, ip_address, success, failure_reason)
    VALUES (UPPER(TRIM(p_username)), p_ip, false, 'username_not_found');

    RETURN json_build_object(
      'success', false,
      'error', 'username_not_found',
      'attempts_left', GREATEST(0, v_max_att - v_attempts - 1)
    );
  END IF;

  -- التحقق من الـ PIN (يدعم plain text حالياً وهيتحول لـ bcrypt لاحقاً)
  DECLARE
    v_pin_match BOOLEAN;
  BEGIN
    -- إذا الـ pin_hash موجود استخدمه، وإلا compare plain
    IF v_account.pin_hash IS NOT NULL THEN
      v_pin_match := (v_account.pin_hash = crypt(p_pin, v_account.pin_hash));
    ELSIF v_account.pin_plain IS NOT NULL THEN
      v_pin_match := (v_account.pin_plain = p_pin);
    ELSE
      v_pin_match := false;
    END IF;

    IF NOT v_pin_match THEN
      -- زود عداد المحاولات
      UPDATE public.rider_accounts
      SET failed_attempts = COALESCE(failed_attempts, 0) + 1,
          last_failed_at = now()
      WHERE id = v_account.id;

      INSERT INTO public.login_attempts(username, ip_address, success, failure_reason)
      VALUES (UPPER(TRIM(p_username)), p_ip, false, 'wrong_pin');

      RETURN json_build_object(
        'success', false,
        'error', 'wrong_pin',
        'attempts_left', GREATEST(0, v_max_att - v_attempts - 1)
      );
    END IF;
  END;

  -- تحقق من حالة الحساب
  IF NOT COALESCE(v_account.pin_enabled, false) THEN
    RETURN json_build_object('success', false, 'error', 'pin_disabled');
  END IF;

  -- جلب الـ rider
  SELECT * INTO v_rider FROM public.riders WHERE id = v_account.rider_id LIMIT 1;

  IF NOT FOUND OR v_rider.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', 'account_inactive');
  END IF;

  -- إنشاء session token
  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.rider_sessions(rider_id, account_id, session_token, ip_address, user_agent)
  VALUES (v_rider.id, v_account.id, v_token, p_ip, p_ua);

  -- reset failed attempts
  UPDATE public.rider_accounts
  SET failed_attempts = 0, last_failed_at = NULL, last_login_at = now()
  WHERE id = v_account.id;

  -- log success
  INSERT INTO public.login_attempts(username, ip_address, success)
  VALUES (UPPER(TRIM(p_username)), p_ip, true);

  RETURN json_build_object(
    'success', true,
    'session_token', v_token,
    'rider_id', v_rider.id,
    'rider_name', v_rider.name,
    'branch_id', v_rider.branch_id,
    'branch_name', v_rider.branch_name,
    'account_id', v_account.id,
    'username', v_account.username,
    'role', COALESCE(v_account.role, 'rider'),
    'must_change_pin', COALESCE(v_account.must_change_pin, false)
  );
END;
$$;

-- Grant execute على RPCs للـ anon فقط (مش direct table access)
GRANT EXECUTE ON FUNCTION public.rider_pin_login(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.rider_validate_session(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.rider_get_attendance_status(UUID) TO anon;
REVOKE ALL ON TABLE public.rider_accounts FROM anon;
REVOKE ALL ON TABLE public.delivery_orders FROM anon;
REVOKE ALL ON TABLE public.attendance FROM anon;
REVOKE ALL ON TABLE public.internal_trips FROM anon;
REVOKE ALL ON TABLE public.riders FROM anon;

-- ══════════════════════════════════════════════════════════
-- 11. RPC: rider_get_dashboard_data — كل بيانات الـ rider في RPC واحد
-- الـ rider لا يصل للـ tables مباشرة — فقط عبر هذا الـ RPC
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rider_get_dashboard_data(
  p_token      TEXT,
  p_date_start DATE DEFAULT NULL,
  p_date_end   DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session   JSON;
  v_rider_id  UUID;
  v_today     DATE := ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
  v_start     DATE;
  v_end       DATE;
  v_att       JSON;
  v_orders    JSON;
  v_trips     JSON;
  v_notifs    JSON;
  v_rider_row RECORD;
BEGIN
  -- تحقق من الـ session
  v_session := public.rider_validate_session(p_token);
  IF NOT (v_session->>'valid')::BOOLEAN THEN
    RETURN json_build_object('success', false, 'error', v_session->>'error');
  END IF;
  v_rider_id := (v_session->>'rider_id')::UUID;

  -- فترة الدورة
  v_start := COALESCE(p_date_start, (date_trunc('month', v_today))::DATE);
  v_end   := COALESCE(p_date_end,   v_today);

  -- بيانات الـ rider
  SELECT * INTO v_rider_row FROM public.riders WHERE id = v_rider_id LIMIT 1;

  -- الحضور
  SELECT row_to_json(a) INTO v_att
  FROM public.attendance a
  WHERE a.rider_id = v_rider_id
    AND a.work_date = v_today
  LIMIT 1;

  -- أوردرات اليوم والدورة
  SELECT json_build_object(
    'today', (
      SELECT json_agg(o ORDER BY o.registered_at DESC)
      FROM public.delivery_orders o
      WHERE o.rider_id = v_rider_id
        AND o.delivery_date = v_today
        AND o.deleted_at IS NULL
    ),
    'cycle', (
      SELECT json_agg(o ORDER BY o.delivery_date DESC)
      FROM public.delivery_orders o
      WHERE o.rider_id = v_rider_id
        AND o.delivery_date >= v_start
        AND o.delivery_date <= v_end
        AND o.deleted_at IS NULL
    )
  ) INTO v_orders;

  -- مشاوير
  SELECT json_build_object(
    'today', (
      SELECT json_agg(t ORDER BY t.registered_at DESC)
      FROM public.internal_trips t
      WHERE t.rider_id = v_rider_id AND t.trip_date = v_today
    ),
    'cycle', (
      SELECT json_agg(t ORDER BY t.trip_date DESC)
      FROM public.internal_trips t
      WHERE t.rider_id = v_rider_id
        AND t.trip_date >= v_start AND t.trip_date <= v_end
    )
  ) INTO v_trips;

  -- إشعارات
  SELECT json_agg(n ORDER BY n.created_at DESC) INTO v_notifs
  FROM public.notifications n
  WHERE n.rider_id = v_rider_id AND n.is_read = false
  LIMIT 20;

  RETURN json_build_object(
    'success', true,
    'rider', row_to_json(v_rider_row),
    'attendance', v_att,
    'orders', v_orders,
    'trips', v_trips,
    'notifications', v_notifs,
    'session_expires_at', v_session->>'expires_at'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_get_dashboard_data(TEXT, DATE, DATE) TO anon;

-- ══════════════════════════════════════════════════════════
-- 12. RPC: rider_check_in_out — بديل آمن لعمليات الحضور
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rider_check_in_out(
  p_token     TEXT,
  p_action    TEXT,  -- 'check_in' | 'check_out'
  p_lat       DOUBLE PRECISION DEFAULT NULL,
  p_lng       DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session   JSON;
  v_rider_id  UUID;
  v_today     DATE := ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
  v_now       TIMESTAMPTZ := NOW();
  v_att       public.attendance%ROWTYPE;
BEGIN
  v_session := public.rider_validate_session(p_token);
  IF NOT (v_session->>'valid')::BOOLEAN THEN
    RETURN json_build_object('success', false, 'error', 'session_invalid');
  END IF;
  v_rider_id := (v_session->>'rider_id')::UUID;

  SELECT * INTO v_att
  FROM public.attendance
  WHERE rider_id = v_rider_id AND work_date = v_today
  LIMIT 1;

  IF p_action = 'check_in' THEN
    IF FOUND AND v_att.check_in_at IS NOT NULL THEN
      RETURN json_build_object('success', false, 'error', 'already_checked_in');
    END IF;

    INSERT INTO public.attendance (rider_id, rider_name, branch_id, branch_name, work_date, check_in_at, status)
    SELECT v_rider_id, r.name, r.branch_id, r.branch_name, v_today, v_now, 'present'
    FROM public.riders r WHERE r.id = v_rider_id
    ON CONFLICT (rider_id, work_date)
    DO UPDATE SET check_in_at = v_now, status = 'present', updated_at = v_now;

  ELSIF p_action = 'check_out' THEN
    IF NOT FOUND OR v_att.check_in_at IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'not_checked_in');
    END IF;
    IF v_att.check_out_at IS NOT NULL THEN
      RETURN json_build_object('success', false, 'error', 'already_checked_out');
    END IF;

    UPDATE public.attendance
    SET check_out_at = v_now,
        total_minutes = EXTRACT(EPOCH FROM (v_now - check_in_at))::INT / 60,
        updated_at = v_now
    WHERE rider_id = v_rider_id AND work_date = v_today;
  ELSE
    RETURN json_build_object('success', false, 'error', 'invalid_action');
  END IF;

  RETURN json_build_object('success', true, 'action', p_action, 'at', v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_check_in_out(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO anon;

-- ══════════════════════════════════════════════════════════
-- 13. RPC: rider_create_order — بديل آمن لتسجيل الأوردر
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rider_create_order(
  p_token           TEXT,
  p_customer_id     UUID DEFAULT NULL,
  p_customer_code   TEXT DEFAULT NULL,
  p_customer_name   TEXT DEFAULT NULL,
  p_customer_phone  TEXT DEFAULT NULL,
  p_customer_address TEXT DEFAULT NULL,
  p_invoice_number  TEXT DEFAULT NULL,
  p_invoice_amount  NUMERIC DEFAULT 0,
  p_order_multiplier NUMERIC DEFAULT 1,
  p_notes           TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session     JSON;
  v_rider_id    UUID;
  v_rider       RECORD;
  v_today       DATE := ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
  v_is_dup      BOOLEAN := false;
  v_order_id    UUID;
BEGIN
  v_session := public.rider_validate_session(p_token);
  IF NOT (v_session->>'valid')::BOOLEAN THEN
    RETURN json_build_object('success', false, 'error', 'session_invalid');
  END IF;
  v_rider_id := (v_session->>'rider_id')::UUID;

  SELECT * INTO v_rider FROM public.riders WHERE id = v_rider_id LIMIT 1;

  -- تحقق من تسجيل الحضور أولاً
  IF NOT EXISTS (
    SELECT 1 FROM public.attendance
    WHERE rider_id = v_rider_id AND work_date = v_today AND check_in_at IS NOT NULL AND check_out_at IS NULL
  ) THEN
    RETURN json_build_object('success', false, 'error', 'not_checked_in', 'message', 'يجب تسجيل الحضور أولاً');
  END IF;

  -- فحص التكرار
  IF p_invoice_number IS NOT NULL AND TRIM(p_invoice_number) != '' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.delivery_orders
      WHERE (invoice_number = TRIM(p_invoice_number) OR invoice_no = TRIM(p_invoice_number))
        AND delivery_date = v_today
        AND deleted_at IS NULL
    ) INTO v_is_dup;
  END IF;

  -- إنشاء الأوردر
  INSERT INTO public.delivery_orders (
    rider_id, rider_name, branch_id, branch_name,
    customer_id, customer_code, customer_name, customer_phone, customer_address,
    customer_code_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot,
    invoice_number, invoice_no, invoice_amount, invoice_value,
    order_multiplier, status, review_status,
    is_duplicate_invoice, duplicate_warning,
    delivery_date, registered_at, manual_customer, created_source
  ) VALUES (
    v_rider_id, v_rider.name, v_rider.branch_id, v_rider.branch_name,
    p_customer_id, p_customer_code, p_customer_name, p_customer_phone, p_customer_address,
    p_customer_code, p_customer_name, p_customer_phone, p_customer_address,
    p_invoice_number, p_invoice_number, p_invoice_amount, p_invoice_amount,
    COALESCE(p_order_multiplier, 1), 'registered',
    CASE WHEN v_is_dup THEN 'needs_review' ELSE 'pending' END,
    v_is_dup, v_is_dup,
    v_today, now(),
    (p_customer_id IS NULL), 'rider_app_secure'
  )
  RETURNING id INTO v_order_id;

  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'is_duplicate', v_is_dup,
    'message', CASE WHEN v_is_dup THEN 'تم التسجيل - فاتورة مكررة للمراجعة' ELSE 'تم التسجيل بنجاح' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_create_order(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO anon;

-- ══════════════════════════════════════════════════════════
-- 14. RPC: rider_logout — إبطال الجلسة
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rider_logout(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rider_sessions
  SET revoked = true, revoked_at = now(), revoked_reason = 'user_logout'
  WHERE session_token = p_token;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_logout(TEXT) TO anon;

-- ══════════════════════════════════════════════════════════
-- 15. PIN Hashing Migration — حوّل plain text PINs لـ bcrypt
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- حوّل الـ PINs الموجودة لـ bcrypt
UPDATE public.rider_accounts
SET pin_hash = crypt(pin_plain, gen_salt('bf', 10))
WHERE pin_plain IS NOT NULL
  AND pin_hash IS NULL
  AND length(pin_plain) BETWEEN 4 AND 8;

-- بعد التحويل، احذف plain text
-- (هنعمل ده في migration تالية بعد ما نتأكد كل حاجة تمام)
-- UPDATE public.rider_accounts SET pin_plain = NULL WHERE pin_hash IS NOT NULL;

COMMENT ON COLUMN public.rider_accounts.pin_hash IS 'bcrypt hash of PIN (bf, cost=10)';
COMMENT ON TABLE public.rider_sessions IS 'Server-side rider sessions with token-based auth';
COMMENT ON TABLE public.login_attempts IS 'Login attempt log for rate limiting and auditing';
