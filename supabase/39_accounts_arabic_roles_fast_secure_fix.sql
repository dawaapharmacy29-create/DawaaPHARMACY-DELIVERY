-- ============================================================
-- Migration 39: Arabic rider login names + 4 digit PIN + roles
-- Safe: no delete, no truncate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Ensure account columns
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS legacy_username TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'rider';
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_plain TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;

-- Preserve old latin username before using Arabic names
UPDATE public.rider_accounts
SET legacy_username = username
WHERE legacy_username IS NULL
  AND username IS NOT NULL;

UPDATE public.rider_accounts ra
SET display_name = COALESCE(ra.display_name, r.name)
FROM public.riders r
WHERE r.id = ra.rider_id
  AND ra.display_name IS NULL;

-- 2) Optional but recommended: make current username the Arabic rider name.
-- Keeps legacy_username so old latin username still works through rider_pin_login.
WITH names AS (
  SELECT
    ra.id,
    TRIM(COALESCE(r.name, ra.display_name, ra.username, 'مندوب')) AS base_name,
    ROW_NUMBER() OVER (PARTITION BY TRIM(COALESCE(r.name, ra.display_name, ra.username, 'مندوب')) ORDER BY ra.created_at NULLS LAST, ra.id) AS rn
  FROM public.rider_accounts ra
  LEFT JOIN public.riders r ON r.id = ra.rider_id
)
UPDATE public.rider_accounts ra
SET username = CASE WHEN names.rn = 1 THEN names.base_name ELSE names.base_name || ' ' || names.rn::TEXT END,
    display_name = names.base_name,
    updated_at = NOW()
FROM names
WHERE names.id = ra.id
  AND names.base_name IS NOT NULL
  AND TRIM(names.base_name) <> '';

-- Keep riders.username in sync for display only
UPDATE public.riders r
SET username = ra.username,
    must_change_pin = COALESCE(ra.must_change_pin, r.must_change_pin, FALSE),
    pin_enabled = COALESCE(ra.pin_enabled, r.pin_enabled, TRUE)
FROM public.rider_accounts ra
WHERE ra.rider_id = r.id;

-- 3) Ensure login attempts and sessions
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT,
  ip_address TEXT,
  success BOOLEAN DEFAULT FALSE,
  failure_reason TEXT,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time
ON public.login_attempts(username, attempted_at DESC);

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

-- 4) View for account screen
CREATE OR REPLACE VIEW public.rider_accounts_view AS
SELECT
  r.id AS rider_id,
  r.name AS rider_name,
  COALESCE(r.status, 'active') AS rider_status,
  COALESCE(b.name, r.branch_name) AS branch_name,
  r.branch_id,
  ra.username,
  ra.legacy_username,
  ra.display_name,
  ra.id AS account_id,
  ra.pin_plain,
  COALESCE(ra.pin_enabled, TRUE) AS pin_enabled,
  COALESCE(ra.must_change_pin, FALSE) AS must_change_pin,
  ra.pin_changed_at,
  ra.last_login_at,
  COALESCE(ra.failed_attempts, 0) AS failed_attempts,
  NULL::TIMESTAMPTZ AS locked_until,
  COALESCE(ra.status, 'active') AS account_status,
  ra.created_at AS account_created_at,
  COALESCE(ra.role, 'rider') AS role
FROM public.riders r
LEFT JOIN public.rider_accounts ra ON ra.rider_id = r.id
LEFT JOIN public.branches b ON b.id = r.branch_id;

-- 5) Upsert rider account from admin UI
CREATE OR REPLACE FUNCTION public.admin_upsert_rider_account(
  p_rider_id UUID,
  p_username TEXT,
  p_role TEXT DEFAULT 'rider',
  p_new_pin TEXT DEFAULT NULL,
  p_force_change BOOLEAN DEFAULT TRUE,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_account_id UUID;
  v_rider_name TEXT;
  v_clean_username TEXT;
  v_role TEXT;
BEGIN
  v_clean_username := TRIM(COALESCE(p_username, ''));
  v_role := COALESCE(NULLIF(TRIM(p_role), ''), 'rider');

  IF v_clean_username = '' THEN
    RETURN json_build_object('success', false, 'error', 'missing_username', 'message', 'اسم الدخول مطلوب');
  END IF;

  IF p_new_pin IS NOT NULL AND NOT (p_new_pin ~ '^\d{4}$') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_pin_format', 'message', 'PIN يجب أن يكون 4 أرقام فقط');
  END IF;

  SELECT name INTO v_rider_name FROM public.riders WHERE id = p_rider_id LIMIT 1;
  IF v_rider_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'rider_not_found', 'message', 'المندوب غير موجود');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rider_accounts
    WHERE rider_id <> p_rider_id
      AND UPPER(TRIM(username)) = UPPER(v_clean_username)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'username_exists', 'message', 'اسم الدخول مستخدم مع حساب آخر');
  END IF;

  SELECT id INTO v_account_id FROM public.rider_accounts WHERE rider_id = p_rider_id LIMIT 1;

  IF v_account_id IS NULL THEN
    INSERT INTO public.rider_accounts (
      rider_id, username, legacy_username, display_name, role, status,
      pin_hash, pin_plain, pin_enabled, must_change_pin, pin_changed_at, updated_at
    ) VALUES (
      p_rider_id,
      v_clean_username,
      NULL,
      v_rider_name,
      v_role,
      'active',
      CASE WHEN p_new_pin IS NOT NULL THEN extensions.crypt(p_new_pin, extensions.gen_salt('bf')) ELSE NULL END,
      NULL,
      TRUE,
      COALESCE(p_force_change, TRUE),
      CASE WHEN p_new_pin IS NOT NULL THEN NOW() ELSE NULL END,
      NOW()
    ) RETURNING id INTO v_account_id;
  ELSE
    UPDATE public.rider_accounts
    SET username = v_clean_username,
        display_name = v_rider_name,
        role = v_role,
        status = COALESCE(status, 'active'),
        pin_hash = CASE WHEN p_new_pin IS NOT NULL THEN extensions.crypt(p_new_pin, extensions.gen_salt('bf')) ELSE pin_hash END,
        pin_plain = NULL,
        pin_enabled = TRUE,
        must_change_pin = CASE WHEN p_new_pin IS NOT NULL THEN COALESCE(p_force_change, TRUE) ELSE must_change_pin END,
        pin_changed_at = CASE WHEN p_new_pin IS NOT NULL THEN NOW() ELSE pin_changed_at END,
        updated_at = NOW()
    WHERE id = v_account_id;
  END IF;

  UPDATE public.riders
  SET username = v_clean_username,
      pin = NULL,
      pin_enabled = TRUE,
      must_change_pin = CASE WHEN p_new_pin IS NOT NULL THEN COALESCE(p_force_change, TRUE) ELSE COALESCE(must_change_pin, FALSE) END,
      pin_changed_at = CASE WHEN p_new_pin IS NOT NULL THEN NOW() ELSE pin_changed_at END
  WHERE id = p_rider_id;

  RETURN json_build_object('success', true, 'account_id', v_account_id, 'username', v_clean_username, 'role', v_role, 'message', 'تم حفظ الحساب بنجاح');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_rider_account(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- 6) Update username/role only
CREATE OR REPLACE FUNCTION public.admin_update_rider_account_profile(
  p_rider_id UUID,
  p_username TEXT,
  p_role TEXT DEFAULT 'rider'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN public.admin_upsert_rider_account(p_rider_id, p_username, p_role, NULL, TRUE, 'تعديل بيانات الحساب من لوحة الإدارة');
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_rider_account_profile(UUID, TEXT, TEXT) TO anon, authenticated;

-- 7) Reset PIN signature used by app
CREATE OR REPLACE FUNCTION public.admin_reset_rider_pin(
  p_force_change BOOLEAN,
  p_new_pin TEXT,
  p_reason TEXT,
  p_rider_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_acc RECORD;
BEGIN
  IF NOT (p_new_pin ~ '^\d{4}$') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_pin_format', 'message', 'PIN يجب أن يكون 4 أرقام فقط');
  END IF;

  SELECT ra.id, ra.rider_id, ra.username, COALESCE(ra.display_name, r.name) AS rider_name
  INTO v_acc
  FROM public.rider_accounts ra
  LEFT JOIN public.riders r ON r.id = ra.rider_id
  WHERE ra.rider_id = p_rider_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'account_not_found', 'message', 'حساب الدليفري غير موجود');
  END IF;

  UPDATE public.rider_accounts
  SET pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
      pin_plain = NULL,
      pin_enabled = TRUE,
      must_change_pin = COALESCE(p_force_change, TRUE),
      pin_changed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_acc.id;

  UPDATE public.riders
  SET pin = NULL,
      pin_enabled = TRUE,
      must_change_pin = COALESCE(p_force_change, TRUE),
      pin_changed_at = NOW()
  WHERE id = p_rider_id;

  CREATE TABLE IF NOT EXISTS public.rider_pin_reset_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID,
    account_id UUID,
    rider_name TEXT,
    username TEXT,
    reset_by UUID,
    reset_by_name TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  INSERT INTO public.rider_pin_reset_audit(rider_id, account_id, rider_name, username, reset_by, reset_by_name, reason)
  VALUES (v_acc.rider_id, v_acc.id, v_acc.rider_name, v_acc.username, auth.uid(), COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'مدير النظام'), COALESCE(p_reason, 'إعادة تعيين PIN'));

  RETURN json_build_object('success', true, 'message', 'تم حفظ PIN الجديد بنجاح', 'username', v_acc.username, 'rider_name', v_acc.rider_name);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_reset_rider_pin(BOOLEAN, TEXT, TEXT, UUID) TO anon, authenticated;

-- 8) rider login that accepts Arabic username, legacy username, display name, or rider name
DROP FUNCTION IF EXISTS public.rider_pin_login(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rider_pin_login(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.rider_pin_login(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rider_pin_login(VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.rider_pin_login(TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.rider_pin_login(
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
  v_login TEXT := UPPER(TRIM(COALESCE(p_username, '')));
BEGIN
  SELECT COUNT(*) INTO v_attempts
  FROM public.login_attempts
  WHERE UPPER(TRIM(username)) = v_login
    AND success = FALSE
    AND attempted_at > NOW() - v_window;

  IF v_attempts >= v_max_att THEN
    INSERT INTO public.login_attempts(username, ip_address, success, failure_reason)
    VALUES (p_username, p_ip, FALSE, 'rate_limited');
    RETURN json_build_object('success', false, 'error', 'account_locked', 'message', 'تم إيقاف الحساب مؤقتًا بعد محاولات متعددة. انتظر 15 دقيقة.');
  END IF;

  SELECT ra.* INTO v_account
  FROM public.rider_accounts ra
  LEFT JOIN public.riders r ON r.id = ra.rider_id
  WHERE COALESCE(ra.status, 'active') = 'active'
    AND (
      UPPER(TRIM(ra.username)) = v_login
      OR UPPER(TRIM(COALESCE(ra.legacy_username, ''))) = v_login
      OR UPPER(TRIM(COALESCE(ra.display_name, ''))) = v_login
      OR UPPER(TRIM(COALESCE(r.name, ''))) = v_login
    )
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.login_attempts(username, ip_address, success, failure_reason)
    VALUES (p_username, p_ip, FALSE, 'username_not_found');
    RETURN json_build_object('success', false, 'error', 'username_not_found', 'attempts_left', GREATEST(0, v_max_att - v_attempts - 1));
  END IF;

  IF v_account.pin_hash IS NOT NULL THEN
    v_pin_match := (v_account.pin_hash = extensions.crypt(p_pin, v_account.pin_hash));
  ELSIF v_account.pin_plain IS NOT NULL THEN
    v_pin_match := (v_account.pin_plain = p_pin);
  ELSE
    v_pin_match := FALSE;
  END IF;

  IF NOT v_pin_match THEN
    UPDATE public.rider_accounts SET failed_attempts = COALESCE(failed_attempts, 0) + 1, last_failed_at = NOW() WHERE id = v_account.id;
    INSERT INTO public.login_attempts(username, ip_address, success, failure_reason) VALUES (p_username, p_ip, FALSE, 'wrong_pin');
    RETURN json_build_object('success', false, 'error', 'wrong_pin', 'attempts_left', GREATEST(0, v_max_att - v_attempts - 1));
  END IF;

  IF NOT COALESCE(v_account.pin_enabled, TRUE) THEN
    RETURN json_build_object('success', false, 'error', 'pin_disabled');
  END IF;

  SELECT * INTO v_rider FROM public.riders WHERE id = v_account.rider_id LIMIT 1;
  IF NOT FOUND OR COALESCE(v_rider.status, 'active') <> 'active' THEN
    RETURN json_build_object('success', false, 'error', 'account_inactive');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.rider_sessions(rider_id, account_id, session_token, ip_address, user_agent)
  VALUES (v_rider.id, v_account.id, v_token, p_ip, p_ua);

  UPDATE public.rider_accounts
  SET failed_attempts = 0, last_failed_at = NULL, last_login_at = NOW()
  WHERE id = v_account.id;

  INSERT INTO public.login_attempts(username, ip_address, success) VALUES (p_username, p_ip, TRUE);

  RETURN json_build_object(
    'success', true,
    'session_token', v_token,
    'rider_id', v_rider.id,
    'rider_name', v_rider.name,
    'branch_id', v_rider.branch_id,
    'branch_name', v_rider.branch_name,
    'account_id', v_account.id,
    'username', v_account.username,
    'legacy_username', v_account.legacy_username,
    'role', COALESCE(v_account.role, 'rider'),
    'must_change_pin', COALESCE(v_account.must_change_pin, FALSE)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.rider_pin_login(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
