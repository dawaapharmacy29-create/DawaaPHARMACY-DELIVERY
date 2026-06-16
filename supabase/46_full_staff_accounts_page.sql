-- ============================================================
-- SQL 46: Full staff accounts page
-- Shows riders, branch managers, operations manager, branches manager, general manager, admin
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
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

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

DROP VIEW IF EXISTS public.staff_accounts_full_view;

CREATE VIEW public.staff_accounts_full_view AS
SELECT
  ('rider:' || r.id::TEXT) AS row_id,
  ra.id AS account_id,
  r.id AS rider_id,
  COALESCE(r.name, ra.display_name, ra.username, 'بدون اسم') AS person_name,
  COALESCE(r.status, 'active') AS rider_status,
  COALESCE(ra.branch_id, r.branch_id) AS branch_id,
  COALESCE(b_acc.display_name, b_acc.name, b_r.display_name, b_r.name, r.branch_name) AS branch_name,
  ra.username,
  ra.display_name,
  COALESCE(ra.role, 'rider') AS role,
  COALESCE(ra.pin_enabled, TRUE) AS pin_enabled,
  COALESCE(ra.must_change_pin, FALSE) AS must_change_pin,
  ra.pin_changed_at,
  ra.last_login_at,
  COALESCE(ra.failed_attempts, 0) AS failed_attempts,
  NULL::TIMESTAMPTZ AS locked_until,
  COALESCE(ra.status, CASE WHEN ra.id IS NULL THEN 'no_account' ELSE 'active' END) AS account_status,
  ra.created_at AS account_created_at,
  'rider'::TEXT AS account_scope,
  20 AS sort_order
FROM public.riders r
LEFT JOIN public.rider_accounts ra ON ra.rider_id = r.id
LEFT JOIN public.branches b_r ON b_r.id = r.branch_id
LEFT JOIN public.branches b_acc ON b_acc.id = ra.branch_id

UNION ALL

SELECT
  ('account:' || ra.id::TEXT) AS row_id,
  ra.id AS account_id,
  NULL::UUID AS rider_id,
  COALESCE(ra.display_name, ra.username, 'حساب بدون اسم') AS person_name,
  NULL::TEXT AS rider_status,
  ra.branch_id,
  COALESCE(b.display_name, b.name) AS branch_name,
  ra.username,
  ra.display_name,
  COALESCE(ra.role, 'staff') AS role,
  COALESCE(ra.pin_enabled, TRUE) AS pin_enabled,
  COALESCE(ra.must_change_pin, FALSE) AS must_change_pin,
  ra.pin_changed_at,
  ra.last_login_at,
  COALESCE(ra.failed_attempts, 0) AS failed_attempts,
  NULL::TIMESTAMPTZ AS locked_until,
  COALESCE(ra.status, 'active') AS account_status,
  ra.created_at AS account_created_at,
  CASE
    WHEN COALESCE(ra.role, '') IN ('admin','general_manager','operations_manager','branches_manager','branch_manager','shift_manager') THEN 'manager'
    ELSE 'staff'
  END AS account_scope,
  CASE
    WHEN COALESCE(ra.role, '') IN ('admin','general_manager') THEN 1
    WHEN COALESCE(ra.role, '') IN ('operations_manager','branches_manager') THEN 2
    WHEN COALESCE(ra.role, '') IN ('branch_manager','shift_manager') THEN 3
    ELSE 10
  END AS sort_order
FROM public.rider_accounts ra
LEFT JOIN public.branches b ON b.id = ra.branch_id
WHERE ra.rider_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.riders r WHERE r.id = ra.rider_id);

CREATE INDEX IF NOT EXISTS idx_rider_accounts_username_upper
ON public.rider_accounts (UPPER(TRIM(username)));

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_save_staff_account'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s)', rec.nspname, rec.proname, rec.args);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_save_staff_account(
  p_account_id UUID DEFAULT NULL,
  p_rider_id UUID DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL,
  p_username TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'rider',
  p_branch_id UUID DEFAULT NULL,
  p_new_pin TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'active',
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
  v_clean_username TEXT;
  v_display_name TEXT;
  v_role TEXT;
  v_status TEXT;
  v_branch_name TEXT;
  v_rider_name TEXT;
BEGIN
  v_clean_username := TRIM(COALESCE(p_username, ''));
  v_role := COALESCE(NULLIF(TRIM(p_role), ''), 'rider');
  v_status := COALESCE(NULLIF(TRIM(p_status), ''), 'active');

  IF v_clean_username = '' THEN
    RETURN json_build_object('success', false, 'error', 'missing_username', 'message', 'اسم الدخول مطلوب');
  END IF;

  IF p_new_pin IS NOT NULL AND p_new_pin <> '' AND NOT (p_new_pin ~ '^\d{4}$') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_pin_format', 'message', 'PIN يجب أن يكون 4 أرقام فقط');
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT COALESCE(display_name, name) INTO v_branch_name
    FROM public.branches
    WHERE id = p_branch_id
    LIMIT 1;
  END IF;

  IF p_rider_id IS NOT NULL THEN
    SELECT name INTO v_rider_name
    FROM public.riders
    WHERE id = p_rider_id
    LIMIT 1;

    IF v_rider_name IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'rider_not_found', 'message', 'المندوب غير موجود');
    END IF;
  END IF;

  v_display_name := COALESCE(NULLIF(TRIM(p_display_name), ''), v_rider_name, v_clean_username);

  SELECT id INTO v_account_id
  FROM public.rider_accounts
  WHERE (p_account_id IS NOT NULL AND id = p_account_id)
     OR (p_account_id IS NULL AND p_rider_id IS NOT NULL AND rider_id = p_rider_id)
  ORDER BY created_at NULLS LAST
  LIMIT 1;

  IF EXISTS (
    SELECT 1
    FROM public.rider_accounts
    WHERE UPPER(TRIM(username)) = UPPER(v_clean_username)
      AND (v_account_id IS NULL OR id <> v_account_id)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'username_exists', 'message', 'اسم الدخول مستخدم مع حساب آخر');
  END IF;

  IF v_account_id IS NULL THEN
    INSERT INTO public.rider_accounts (
      rider_id, username, legacy_username, display_name, role, branch_id, status,
      pin_hash, pin_plain, pin_enabled, must_change_pin, pin_changed_at, failed_attempts, updated_at
    )
    VALUES (
      p_rider_id,
      v_clean_username,
      NULL,
      v_display_name,
      v_role,
      p_branch_id,
      v_status,
      CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN extensions.crypt(p_new_pin, extensions.gen_salt('bf')) ELSE NULL END,
      NULL,
      TRUE,
      CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN COALESCE(p_force_change, TRUE) ELSE FALSE END,
      CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN NOW() ELSE NULL END,
      0,
      NOW()
    )
    RETURNING id INTO v_account_id;
  ELSE
    UPDATE public.rider_accounts
    SET username = v_clean_username,
        display_name = v_display_name,
        role = v_role,
        branch_id = p_branch_id,
        status = v_status,
        pin_hash = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN extensions.crypt(p_new_pin, extensions.gen_salt('bf')) ELSE pin_hash END,
        pin_plain = NULL,
        pin_enabled = TRUE,
        must_change_pin = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN COALESCE(p_force_change, TRUE) ELSE COALESCE(must_change_pin, FALSE) END,
        pin_changed_at = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN NOW() ELSE pin_changed_at END,
        failed_attempts = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN 0 ELSE COALESCE(failed_attempts,0) END,
        last_failed_at = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN NULL ELSE last_failed_at END,
        updated_at = NOW()
    WHERE id = v_account_id;
  END IF;

  IF p_rider_id IS NOT NULL THEN
    UPDATE public.riders
    SET username = v_clean_username,
        branch_id = COALESCE(p_branch_id, branch_id),
        branch_name = COALESCE(v_branch_name, branch_name),
        pin_enabled = TRUE,
        must_change_pin = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN COALESCE(p_force_change, TRUE) ELSE COALESCE(must_change_pin, FALSE) END,
        pin_changed_at = CASE WHEN NULLIF(p_new_pin, '') IS NOT NULL THEN NOW() ELSE pin_changed_at END,
        updated_at = NOW()
    WHERE id = p_rider_id;
  END IF;

  IF NULLIF(p_new_pin, '') IS NOT NULL THEN
    INSERT INTO public.rider_pin_reset_audit(rider_id, account_id, rider_name, username, reset_by, reset_by_name, reason)
    VALUES (
      p_rider_id,
      v_account_id,
      v_display_name,
      v_clean_username,
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'مدير النظام'),
      COALESCE(p_reason, 'حفظ أو إعادة تعيين PIN من صفحة كل الحسابات')
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'account_id', v_account_id,
    'rider_id', p_rider_id,
    'display_name', v_display_name,
    'username', v_clean_username,
    'role', v_role,
    'branch_id', p_branch_id,
    'pin_changed', NULLIF(p_new_pin, '') IS NOT NULL,
    'message', 'تم حفظ الحساب بنجاح'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_save_staff_account(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
