-- ══════════════════════════════════════════════════════════════════
-- Migration 36 SAFE FIXED
-- rider_change_pin RPC + secure customer search + session helpers
-- Safe: no DROP data, no DELETE data, no TRUNCATE
-- Notes:
-- 1) Fixes PostgreSQL error:
--    cannot change name of input parameter "p_old_pin"
--    by dropping the old rider_change_pin(uuid,text,text) function before recreating it.
-- 2) Avoids CREATE POLICY IF NOT EXISTS because PostgreSQL does not support it.
-- 3) Does NOT apply hard REVOKE on runtime tables to avoid breaking the current app.
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1) Required columns in rider_accounts
-- ============================================================

ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_plain TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'rider';

-- ============================================================
-- 2) Required columns in riders
-- ============================================================

ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 3) rider_sessions table
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

CREATE INDEX IF NOT EXISTS idx_rider_sessions_token ON public.rider_sessions(session_token) WHERE revoked = FALSE;
CREATE INDEX IF NOT EXISTS idx_rider_sessions_rider ON public.rider_sessions(rider_id, expires_at DESC);

-- ============================================================
-- 4) login_attempts table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  ip_address TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN DEFAULT FALSE,
  failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time ON public.login_attempts(username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON public.login_attempts(ip_address, attempted_at DESC);

-- ============================================================
-- 5) rider_validate_session
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

GRANT EXECUTE ON FUNCTION public.rider_validate_session(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.rider_validate_session(TEXT) TO authenticated;

-- ============================================================
-- 6) rider_pin_login
-- Keeps compatibility with plain PIN and hash PIN.
-- Creates a server-side session_token.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_pin_login(
  p_username TEXT,
  p_pin TEXT,
  p_ip TEXT DEFAULT NULL,
  p_ua TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_account public.rider_accounts%ROWTYPE;
  v_rider public.riders%ROWTYPE;
  v_token TEXT;
  v_attempts INT;
  v_window INTERVAL := INTERVAL '15 minutes';
  v_max_att INT := 5;
  v_pin_match BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_attempts
  FROM public.login_attempts
  WHERE username = UPPER(TRIM(p_username))
    AND success = FALSE
    AND attempted_at > NOW() - v_window;

  IF v_attempts >= v_max_att THEN
    INSERT INTO public.login_attempts(username, ip_address, success, failure_reason)
    VALUES (UPPER(TRIM(p_username)), p_ip, FALSE, 'rate_limited');

    RETURN json_build_object(
      'success', false,
      'error', 'account_locked',
      'message', 'تم إيقاف الحساب مؤقتًا بعد محاولات متعددة. انتظر 15 دقيقة.'
    );
  END IF;

  SELECT * INTO v_account
  FROM public.rider_accounts
  WHERE UPPER(TRIM(username)) = UPPER(TRIM(p_username))
    AND COALESCE(status, 'active') = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.login_attempts(username, ip_address, success, failure_reason)
    VALUES (UPPER(TRIM(p_username)), p_ip, FALSE, 'username_not_found');

    RETURN json_build_object(
      'success', false,
      'error', 'username_not_found',
      'attempts_left', GREATEST(0, v_max_att - v_attempts - 1)
    );
  END IF;

  IF v_account.pin_hash IS NOT NULL THEN
    v_pin_match := (v_account.pin_hash = crypt(p_pin, v_account.pin_hash));
  ELSIF v_account.pin_plain IS NOT NULL THEN
    v_pin_match := (v_account.pin_plain = p_pin);
  ELSE
    v_pin_match := FALSE;
  END IF;

  IF NOT v_pin_match THEN
    UPDATE public.rider_accounts
    SET failed_attempts = COALESCE(failed_attempts, 0) + 1,
        last_failed_at = NOW()
    WHERE id = v_account.id;

    INSERT INTO public.login_attempts(username, ip_address, success, failure_reason)
    VALUES (UPPER(TRIM(p_username)), p_ip, FALSE, 'wrong_pin');

    RETURN json_build_object(
      'success', false,
      'error', 'wrong_pin',
      'attempts_left', GREATEST(0, v_max_att - v_attempts - 1)
    );
  END IF;

  IF NOT COALESCE(v_account.pin_enabled, TRUE) THEN
    RETURN json_build_object('success', false, 'error', 'pin_disabled');
  END IF;

  SELECT * INTO v_rider
  FROM public.riders
  WHERE id = v_account.rider_id
  LIMIT 1;

  IF NOT FOUND OR COALESCE(v_rider.status, 'active') <> 'active' THEN
    RETURN json_build_object('success', false, 'error', 'account_inactive');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.rider_sessions(rider_id, account_id, session_token, ip_address, user_agent)
  VALUES (v_rider.id, v_account.id, v_token, p_ip, p_ua);

  UPDATE public.rider_accounts
  SET failed_attempts = 0,
      last_failed_at = NULL,
      last_login_at = NOW()
  WHERE id = v_account.id;

  INSERT INTO public.login_attempts(username, ip_address, success)
  VALUES (UPPER(TRIM(p_username)), p_ip, TRUE);

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
    'must_change_pin', COALESCE(v_account.must_change_pin, FALSE)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_pin_login(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.rider_pin_login(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 7) rider_change_pin
-- IMPORTANT: old function must be dropped because PostgreSQL
-- cannot rename input parameters via CREATE OR REPLACE.
-- ============================================================

DROP FUNCTION IF EXISTS public.rider_change_pin(UUID, TEXT, TEXT);

CREATE FUNCTION public.rider_change_pin(
  p_rider_id UUID,
  p_new_pin TEXT,
  p_token TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_account_id UUID;
  v_session JSON;
BEGIN
  IF NOT (p_new_pin ~ '^\d{4,8}$') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'invalid_pin_format',
      'message', 'PIN يجب أن يكون من 4 إلى 8 أرقام'
    );
  END IF;

  IF p_token IS NOT NULL AND TRIM(p_token) <> '' THEN
    v_session := public.rider_validate_session(p_token);

    IF NOT COALESCE((v_session->>'valid')::BOOLEAN, FALSE) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'session_invalid',
        'message', 'جلسة الدخول غير صالحة'
      );
    END IF;

    IF (v_session->>'rider_id')::UUID <> p_rider_id THEN
      RETURN json_build_object(
        'success', false,
        'error', 'rider_mismatch',
        'message', 'لا يمكن تغيير PIN لمندوب آخر'
      );
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.riders
      WHERE id = p_rider_id
        AND COALESCE(status, 'active') = 'active'
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'rider_not_found',
        'message', 'المندوب غير موجود أو غير نشط'
      );
    END IF;
  END IF;

  SELECT id INTO v_account_id
  FROM public.rider_accounts
  WHERE rider_id = p_rider_id
    AND COALESCE(status, 'active') = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'account_not_found',
      'message', 'حساب المندوب غير موجود'
    );
  END IF;

  UPDATE public.rider_accounts
  SET pin_hash = crypt(p_new_pin, gen_salt('bf')),
      pin_plain = NULL,
      must_change_pin = FALSE,
      pin_enabled = TRUE,
      pin_changed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_account_id;

  UPDATE public.riders
  SET pin = NULL,
      pin_enabled = TRUE,
      pin_changed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_rider_id;

  RETURN json_build_object(
    'success', true,
    'message', 'تم تغيير PIN بنجاح'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_change_pin(UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.rider_change_pin(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 8) Convert plain PINs to hash safely.
-- We do NOT clear pin_plain here to avoid breaking old admin UI.
-- Clear pin_plain later after confirming the frontend uses hashes.
-- ============================================================

UPDATE public.rider_accounts
SET pin_hash = crypt(pin_plain, gen_salt('bf'))
WHERE pin_plain IS NOT NULL
  AND pin_hash IS NULL
  AND length(pin_plain) BETWEEN 4 AND 8;

-- ============================================================
-- 9) Customers columns + safe RLS
-- ============================================================

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_admin_read" ON public.customers;
DROP POLICY IF EXISTS "customers_anon_all" ON public.customers;
DROP POLICY IF EXISTS "customers_public_select" ON public.customers;
DROP POLICY IF EXISTS "customers_runtime_read" ON public.customers;

CREATE POLICY "customers_admin_read"
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.auth_user_id = auth.uid()
      AND up.role IN ('admin', 'general_manager', 'shift_manager', 'branch_manager')
      AND COALESCE(up.status, 'active') = 'active'
  )
);

-- Temporary runtime read to avoid breaking current UI.
-- Remove in a future hardening migration after all UI uses rider_search_customers RPC.
CREATE POLICY "customers_runtime_read"
ON public.customers
FOR SELECT
TO anon, authenticated
USING (TRUE);

-- ============================================================
-- 10) rider_search_customers RPC with wildcard * support
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
    RETURN json_build_object(
      'success', false,
      'error', 'session_invalid',
      'data', '[]'::json
    );
  END IF;

  v_pattern :=
    '%' ||
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(TRIM(COALESCE(p_query, '')), '*', '%'),
          '_', ''
        ),
        '''', ''
      ),
      ' ', '%'
    )
    || '%';

  RETURN json_build_object(
    'success', true,
    'data', (
      SELECT COALESCE(json_agg(c), '[]'::json)
      FROM (
        SELECT
          id,
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

GRANT EXECUTE ON FUNCTION public.rider_search_customers(TEXT, TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION public.rider_search_customers(TEXT, TEXT, INT) TO authenticated;

-- ============================================================
-- 11) rider_logout
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_logout(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.rider_sessions
  SET revoked = TRUE,
      revoked_at = NOW(),
      revoked_reason = 'user_logout'
  WHERE session_token = p_token;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_logout(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.rider_logout(TEXT) TO authenticated;

-- ============================================================
-- 12) Attendance unique index for check-in/out functions
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_rider_work_date
ON public.attendance(rider_id, work_date);

-- ============================================================
-- 13) Comments
-- ============================================================

COMMENT ON FUNCTION public.rider_change_pin(UUID, TEXT, TEXT) IS 'Secure rider PIN change with bcrypt hashing';
COMMENT ON FUNCTION public.rider_search_customers(TEXT, TEXT, INT) IS 'Token-gated customer search with wildcard * support';
COMMENT ON FUNCTION public.rider_validate_session(TEXT) IS 'Validate server-side rider session token';
COMMENT ON FUNCTION public.rider_logout(TEXT) IS 'Revoke rider session token';
COMMENT ON FUNCTION public.rider_pin_login(TEXT, TEXT, TEXT, TEXT) IS 'Rider PIN login with session token and hash/plain compatibility';
COMMENT ON COLUMN public.rider_accounts.pin_hash IS 'bcrypt hash of PIN using pgcrypto crypt()';
COMMENT ON TABLE public.rider_sessions IS 'Server-side rider sessions with token-based auth';
COMMENT ON TABLE public.login_attempts IS 'Login attempt log for rate limiting and auditing';

-- ============================================================
-- 14) Reload PostgREST
-- ============================================================

NOTIFY pgrst, 'reload schema';
