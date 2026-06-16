-- ============================================================
-- SQL 45: Bulletproof rider_pin_login — handles all edge cases
-- Safe: no delete, no truncate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- أضف عمود device_approved لـ rider_accounts لو مش موجود
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS approved_device_id TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS device_approved_at TIMESTAMPTZ;

-- إزالة كل versions من rider_pin_login الموجودة
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rider_pin_login'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s)', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- الـ function الموحدة - تقبل 4 params أو 6 params عن طريق DEFAULT
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rider_pin_login(
  p_username    TEXT,
  p_pin         TEXT,
  p_ip          TEXT    DEFAULT NULL,
  p_ua          TEXT    DEFAULT NULL,
  p_device_id   TEXT    DEFAULT NULL,
  p_device_label TEXT   DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_account      RECORD;
  v_branch_name  TEXT;
  v_session_token TEXT;
  v_role         TEXT;
  v_rider_id     UUID;
  v_normalized   TEXT;
BEGIN
  -- 1. تحقق من المدخلات
  IF TRIM(COALESCE(p_username, '')) = '' OR TRIM(COALESCE(p_pin, '')) = '' THEN
    RETURN json_build_object('success', false, 'error', 'missing_credentials',
      'message', 'اكتب اسم المستخدم والرقم السري');
  END IF;

  -- 2. normalize الـ username (UPPER للـ latin، trim للعربي)
  v_normalized := TRIM(p_username);

  -- 3. ابحث عن الحساب (case-insensitive للـ latin، exact للعربي)
  SELECT
    ra.*,
    COALESCE(r.name, ra.display_name, ra.username) AS resolved_name,
    COALESCE(ra.branch_id, r.branch_id)            AS resolved_branch_id,
    r.id                                            AS real_rider_id
  INTO v_account
  FROM public.rider_accounts ra
  LEFT JOIN public.riders r ON r.id = ra.rider_id
  WHERE
    -- exact match أولاً
    TRIM(ra.username) = v_normalized
    OR UPPER(TRIM(COALESCE(ra.username, '')))        = UPPER(v_normalized)
    OR TRIM(COALESCE(ra.legacy_username, ''))        = v_normalized
    OR UPPER(TRIM(COALESCE(ra.legacy_username, ''))) = UPPER(v_normalized)
    OR TRIM(COALESCE(ra.display_name, ''))           = v_normalized
  ORDER BY
    CASE
      WHEN TRIM(ra.username) = v_normalized THEN 0
      WHEN UPPER(TRIM(COALESCE(ra.username, ''))) = UPPER(v_normalized) THEN 1
      WHEN TRIM(COALESCE(ra.display_name, '')) = v_normalized THEN 2
      ELSE 3
    END,
    ra.created_at NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'username_not_found',
      'message', 'اسم المستخدم غير موجود أو الحساب غير نشط');
  END IF;

  -- 4. تحقق من حالة الحساب
  IF COALESCE(v_account.status, 'active') <> 'active' THEN
    RETURN json_build_object('success', false, 'error', 'account_inactive',
      'message', 'الحساب غير نشط. كلم الإدارة.');
  END IF;

  -- 5. تحقق من PIN مفعّل
  IF COALESCE(v_account.pin_enabled, TRUE) IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'pin_disabled',
      'message', 'PIN غير مفعل لهذا الحساب. كلم الإدارة.');
  END IF;

  -- 6. تحقق من lockout
  IF COALESCE(v_account.failed_attempts, 0) >= 5
     AND v_account.last_failed_at IS NOT NULL
     AND NOW() - v_account.last_failed_at < INTERVAL '15 minutes' THEN
    RETURN json_build_object('success', false, 'error', 'account_locked',
      'message', 'الحساب متقفل مؤقتاً (15 دقيقة). استنى أو كلم الإدارة.',
      'locked_until', (v_account.last_failed_at + INTERVAL '15 minutes'));
  END IF;

  -- 7. تحقق من الـ PIN (bcrypt أو plain fallback)
  IF v_account.pin_hash IS NOT NULL THEN
    IF v_account.pin_hash <> extensions.crypt(p_pin, v_account.pin_hash) THEN
      UPDATE public.rider_accounts
      SET failed_attempts = COALESCE(failed_attempts, 0) + 1,
          last_failed_at  = NOW(),
          updated_at      = NOW()
      WHERE id = v_account.id;

      RETURN json_build_object(
        'success', false, 'error', 'wrong_pin', 'message', 'PIN غير صحيح',
        'attempts_left', GREATEST(0, 5 - COALESCE(v_account.failed_attempts, 0) - 1)
      );
    END IF;
  ELSE
    -- plain PIN fallback (للحسابات القديمة قبل bcrypt)
    IF COALESCE(v_account.pin_plain, '') <> p_pin THEN
      UPDATE public.rider_accounts
      SET failed_attempts = COALESCE(failed_attempts, 0) + 1,
          last_failed_at  = NOW(),
          updated_at      = NOW()
      WHERE id = v_account.id;

      RETURN json_build_object(
        'success', false, 'error', 'wrong_pin', 'message', 'PIN غير صحيح',
        'attempts_left', GREATEST(0, 5 - COALESCE(v_account.failed_attempts, 0) - 1)
      );
    END IF;
  END IF;

  -- 8. PIN صحيح — reset failed_attempts + جيب branch name
  SELECT name INTO v_branch_name
  FROM public.branches
  WHERE id = v_account.resolved_branch_id
  LIMIT 1;

  v_role          := COALESCE(v_account.role, 'rider');
  v_session_token := encode(gen_random_bytes(32), 'hex');
  v_rider_id      := COALESCE(v_account.real_rider_id, v_account.rider_id);

  UPDATE public.rider_accounts
  SET failed_attempts = 0,
      last_login_at   = NOW(),
      updated_at      = NOW()
  WHERE id = v_account.id;

  -- 9. أنشئ session record
  INSERT INTO public.rider_sessions (rider_id, account_id, session_token, ip_address, user_agent)
  VALUES (
    v_rider_id,
    v_account.id,
    v_session_token,
    p_ip,
    LEFT(COALESCE(p_ua, ''), 500)
  )
  ON CONFLICT DO NOTHING;

  -- 10. رجّع النتيجة الكاملة
  RETURN json_build_object(
    'success',         true,
    'account_id',      v_account.id,
    'rider_id',        v_rider_id,
    'username',        v_account.username,
    'display_name',    COALESCE(v_account.display_name, v_account.resolved_name),
    'rider_name',      COALESCE(v_account.resolved_name, v_account.display_name, v_account.username),
    'branch_id',       v_account.resolved_branch_id,
    'branch_name',     COALESCE(v_branch_name, v_account.branch_name),
    'role',            v_role,
    'must_change_pin', COALESCE(v_account.must_change_pin, FALSE),
    'session_token',   v_session_token
  );
END;
$$;

-- منح صلاحيات
GRANT EXECUTE ON FUNCTION public.rider_pin_login(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.rider_pin_login IS
  'Unified rider PIN login — handles Arabic/Latin usernames, bcrypt+plain PIN, lockout, device tracking (optional). SQL 45.';
