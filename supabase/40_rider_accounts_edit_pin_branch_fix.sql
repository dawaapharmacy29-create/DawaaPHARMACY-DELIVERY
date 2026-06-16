-- ============================================================
-- Migration 40: Rider account edit PIN + branch support
-- Safe: no delete data, no truncate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Required columns
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS legacy_username TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'rider';
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_plain TEXT;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ;

ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.rider_accounts
SET legacy_username = username
WHERE legacy_username IS NULL AND username IS NOT NULL;

-- Audit table
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

-- Recreate account view safely
DROP VIEW IF EXISTS public.rider_accounts_view CASCADE;

CREATE VIEW public.rider_accounts_view AS
SELECT
  r.id AS rider_id,
  r.name AS rider_name,
  COALESCE(r.status, 'active') AS rider_status,
  COALESCE(b.name, b.display_name, r.branch_name) AS branch_name,
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

-- Drop old overloaded versions to avoid schema cache ambiguity
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('admin_upsert_rider_account', 'admin_update_rider_account_profile')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s)', rec.nspname, rec.proname, rec.args);
  END LOOP;
END $$;

-- Upsert rider account with branch + optional 4-digit PIN
CREATE OR REPLACE FUNCTION public.admin_upsert_rider_account(
  p_rider_id UUID,
  p_username TEXT,
  p_role TEXT DEFAULT 'rider',
  p_branch_id UUID DEFAULT NULL,
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
  v_branch_name TEXT;
BEGIN
  v_clean_username := TRIM(COALESCE(p_username, ''));
  v_role := COALESCE(NULLIF(TRIM(p_role), ''), 'rider');

  IF v_clean_username = '' THEN
    RETURN json_build_object('success', false, 'error', 'missing_username', 'message', 'اسم الدخول مطلوب');
  END IF;

  IF p_new_pin IS NOT NULL AND p_new_pin <> '' AND NOT (p_new_pin ~ '^\d{4}$') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_pin_format', 'message', 'PIN يجب أن يكون 4 أرقام فقط');
  END IF;

  SELECT name INTO v_rider_name FROM public.riders WHERE id = p_rider_id LIMIT 1;
  IF v_rider_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'rider_not_found', 'message', 'المندوب غير موجود');
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT COALESCE(name, display_name) INTO v_branch_name FROM public.branches WHERE id = p_branch_id LIMIT 1;
    IF v_branch_name IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'branch_not_found', 'message', 'الفرع غير موجود');
    END IF;
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
      CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN extensions.crypt(p_new_pin, extensions.gen_salt('bf')) ELSE NULL END,
      NULL,
      TRUE,
      CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN COALESCE(p_force_change, TRUE) ELSE FALSE END,
      CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN NOW() ELSE NULL END,
      NOW()
    ) RETURNING id INTO v_account_id;
  ELSE
    UPDATE public.rider_accounts
    SET username = v_clean_username,
        display_name = v_rider_name,
        role = v_role,
        status = COALESCE(status, 'active'),
        pin_hash = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN extensions.crypt(p_new_pin, extensions.gen_salt('bf')) ELSE pin_hash END,
        pin_plain = NULL,
        pin_enabled = TRUE,
        must_change_pin = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN COALESCE(p_force_change, TRUE) ELSE must_change_pin END,
        pin_changed_at = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN NOW() ELSE pin_changed_at END,
        updated_at = NOW()
    WHERE id = v_account_id;
  END IF;

  UPDATE public.riders
  SET username = v_clean_username,
      branch_id = COALESCE(p_branch_id, branch_id),
      branch_name = COALESCE(v_branch_name, branch_name),
      pin = NULL,
      pin_enabled = TRUE,
      must_change_pin = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN COALESCE(p_force_change, TRUE) ELSE COALESCE(must_change_pin, FALSE) END,
      pin_changed_at = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN NOW() ELSE pin_changed_at END,
      updated_at = NOW()
  WHERE id = p_rider_id;

  IF NULLIF(p_new_pin, '') IS NOT NULL THEN
    INSERT INTO public.rider_pin_reset_audit(rider_id, account_id, rider_name, username, reset_by, reset_by_name, reason)
    VALUES (p_rider_id, v_account_id, v_rider_name, v_clean_username, auth.uid(), COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'مدير النظام'), COALESCE(p_reason, 'تعديل الحساب وتعيين PIN من لوحة الإدارة'));
  END IF;

  RETURN json_build_object(
    'success', true,
    'account_id', v_account_id,
    'username', v_clean_username,
    'role', v_role,
    'branch_id', COALESCE(p_branch_id, (SELECT branch_id FROM public.riders WHERE id = p_rider_id)),
    'branch_name', COALESCE(v_branch_name, (SELECT branch_name FROM public.riders WHERE id = p_rider_id)),
    'pin_changed', NULLIF(p_new_pin, '') IS NOT NULL,
    'message', 'تم حفظ الحساب بنجاح'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_rider_account(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- Edit account profile with branch + optional PIN
CREATE OR REPLACE FUNCTION public.admin_update_rider_account_profile(
  p_rider_id UUID,
  p_username TEXT,
  p_role TEXT DEFAULT 'rider',
  p_branch_id UUID DEFAULT NULL,
  p_new_pin TEXT DEFAULT NULL,
  p_force_change BOOLEAN DEFAULT TRUE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN public.admin_upsert_rider_account(
    p_rider_id,
    p_username,
    p_role,
    p_branch_id,
    p_new_pin,
    p_force_change,
    'تعديل بيانات الحساب من لوحة الإدارة'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_rider_account_profile(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
