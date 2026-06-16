-- ============================================================
-- SQL 43: manager PIN login support
-- Allows manager accounts in rider_accounts without rider_id to login by username + PIN.
-- Safe: no delete, no truncate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS legacy_username TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'rider';
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_plain TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Remove ambiguous old versions of rider_pin_login, then recreate the app signature.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rider_pin_login'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s)', r.schema_name, r.function_name, r.args);
  END LOOP;
END $$;

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
  v_account RECORD;
  v_branch_name TEXT;
  v_session_token TEXT;
  v_role TEXT;
BEGIN
  IF TRIM(COALESCE(p_username, '')) = '' OR TRIM(COALESCE(p_pin, '')) = '' THEN
    RETURN json_build_object('success', false, 'error', 'missing_credentials', 'message', 'اكتب اسم المستخدم والرقم السري');
  END IF;

  SELECT
    ra.*,
    COALESCE(r.name, ra.display_name, ra.username) AS resolved_name,
    COALESCE(ra.branch_id, r.branch_id) AS resolved_branch_id,
    r.id AS real_rider_id
  INTO v_account
  FROM public.rider_accounts ra
  LEFT JOIN public.riders r ON r.id = ra.rider_id
  WHERE
    UPPER(TRIM(ra.username)) = UPPER(TRIM(p_username))
    OR UPPER(TRIM(COALESCE(ra.legacy_username, ''))) = UPPER(TRIM(p_username))
    OR TRIM(COALESCE(ra.display_name, '')) = TRIM(p_username)
  ORDER BY
    CASE WHEN UPPER(TRIM(ra.username)) = UPPER(TRIM(p_username)) THEN 0 ELSE 1 END
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'username_not_found', 'message', 'اسم المستخدم غير موجود');
  END IF;

  IF COALESCE(v_account.status, 'active') <> 'active' THEN
    RETURN json_build_object('success', false, 'error', 'account_inactive', 'message', 'الحساب غير نشط. كلم الإدارة.');
  END IF;

  IF COALESCE(v_account.pin_enabled, TRUE) IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'pin_disabled', 'message', 'PIN غير مفعل لهذا الحساب');
  END IF;

  IF v_account.pin_hash IS NULL THEN
    -- fallback for old plain PIN only
    IF COALESCE(v_account.pin_plain, '') <> p_pin THEN
      UPDATE public.rider_accounts
      SET failed_attempts = COALESCE(failed_attempts,0) + 1,
          last_failed_at = NOW(),
          updated_at = NOW()
      WHERE id = v_account.id;

      RETURN json_build_object('success', false, 'error', 'wrong_pin', 'message', 'PIN غير صحيح');
    END IF;
  ELSE
    IF v_account.pin_hash <> extensions.crypt(p_pin, v_account.pin_hash) THEN
      UPDATE public.rider_accounts
      SET failed_attempts = COALESCE(failed_attempts,0) + 1,
          last_failed_at = NOW(),
          updated_at = NOW()
      WHERE id = v_account.id;

      RETURN json_build_object('success', false, 'error', 'wrong_pin', 'message', 'PIN غير صحيح');
    END IF;
  END IF;

  SELECT name INTO v_branch_name
  FROM public.branches
  WHERE id = v_account.resolved_branch_id
  LIMIT 1;

  v_role := COALESCE(v_account.role, 'rider');
  v_session_token := gen_random_uuid()::TEXT;

  UPDATE public.rider_accounts
  SET last_login_at = NOW(),
      failed_attempts = 0,
      last_failed_at = NULL,
      updated_at = NOW()
  WHERE id = v_account.id;

  -- For real riders, keep rider_sessions if table exists and accepts it.
  IF v_account.real_rider_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rider_sessions'
  ) THEN
    BEGIN
      INSERT INTO public.rider_sessions (rider_id, session_token, ip_address, user_agent, expires_at, revoked, created_at)
      VALUES (v_account.real_rider_id, v_session_token, p_ip, p_ua, NOW() + INTERVAL '30 days', FALSE, NOW());
    EXCEPTION WHEN OTHERS THEN
      -- Do not block login if session audit table has a different schema.
      NULL;
    END;
  END IF;

  RETURN json_build_object(
    'success', true,
    'account_id', v_account.id,
    'rider_id', v_account.real_rider_id,
    'username', v_account.username,
    'rider_name', v_account.resolved_name,
    'display_name', v_account.resolved_name,
    'role', v_role,
    'branch_id', v_account.resolved_branch_id,
    'branch_name', COALESCE(v_branch_name, 'كل الفروع'),
    'must_change_pin', COALESCE(v_account.must_change_pin, FALSE),
    'session_token', v_session_token,
    'message', 'تم تسجيل الدخول بنجاح'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_pin_login(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
