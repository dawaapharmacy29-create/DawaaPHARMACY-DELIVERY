-- ============================================================
-- SQL 50: One-device lock for riders + stable PIN login
-- ربط حساب كل دليفري بجهاز واحد + تثبيت دالة الدخول
-- Safe: no delete, no truncate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Required account columns
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

-- Device binding table
CREATE TABLE IF NOT EXISTS public.rider_account_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  rider_id UUID,
  username TEXT,
  rider_name TEXT,
  device_id_hash TEXT NOT NULL,
  device_label TEXT,
  user_agent TEXT,
  first_ip TEXT,
  last_ip TEXT,
  status TEXT DEFAULT 'approved', -- approved / pending / blocked / replaced
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  replaced_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(account_id, device_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_rider_account_devices_account ON public.rider_account_devices(account_id, status);
CREATE INDEX IF NOT EXISTS idx_rider_account_devices_rider ON public.rider_account_devices(rider_id, status);
CREATE INDEX IF NOT EXISTS idx_rider_account_devices_status ON public.rider_account_devices(status, first_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.rider_device_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID,
  rider_id UUID,
  username TEXT,
  device_id_hash TEXT,
  device_label TEXT,
  user_agent TEXT,
  ip_address TEXT,
  success BOOLEAN DEFAULT FALSE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_device_login_attempts_time ON public.rider_device_login_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_device_login_attempts_account ON public.rider_device_login_attempts(account_id, created_at DESC);

-- Permissions
GRANT SELECT, INSERT, UPDATE ON public.rider_account_devices TO anon, authenticated;
GRANT SELECT, INSERT ON public.rider_device_login_attempts TO anon, authenticated;

ALTER TABLE public.rider_account_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_device_login_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_account_devices' AND policyname='app_select_rider_account_devices') THEN
    CREATE POLICY app_select_rider_account_devices ON public.rider_account_devices FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_account_devices' AND policyname='app_insert_rider_account_devices') THEN
    CREATE POLICY app_insert_rider_account_devices ON public.rider_account_devices FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_account_devices' AND policyname='app_update_rider_account_devices') THEN
    CREATE POLICY app_update_rider_account_devices ON public.rider_account_devices FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_login_attempts' AND policyname='app_select_device_attempts') THEN
    CREATE POLICY app_select_device_attempts ON public.rider_device_login_attempts FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_login_attempts' AND policyname='app_insert_device_attempts') THEN
    CREATE POLICY app_insert_device_attempts ON public.rider_device_login_attempts FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $$;

-- Drop all old login function versions
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rider_pin_login'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s)', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Stable login function with optional device binding.
CREATE OR REPLACE FUNCTION public.rider_pin_login(
  p_username TEXT,
  p_pin TEXT,
  p_ip TEXT DEFAULT NULL,
  p_ua TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_device_label TEXT DEFAULT NULL
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
  v_device_hash TEXT;
  v_has_approved_device BOOLEAN := FALSE;
  v_this_device_status TEXT;
BEGIN
  IF TRIM(COALESCE(p_username, '')) = '' OR TRIM(COALESCE(p_pin, '')) = '' THEN
    RETURN json_build_object('success', false, 'error', 'missing_credentials', 'message', 'اكتب اسم المستخدم والـ PIN');
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
    LOWER(TRIM(ra.username)) = LOWER(TRIM(p_username))
    OR LOWER(TRIM(COALESCE(ra.legacy_username, ''))) = LOWER(TRIM(p_username))
    OR LOWER(TRIM(COALESCE(ra.display_name, ''))) = LOWER(TRIM(p_username))
  ORDER BY CASE WHEN LOWER(TRIM(ra.username)) = LOWER(TRIM(p_username)) THEN 0 ELSE 1 END
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.rider_device_login_attempts(username, user_agent, ip_address, success, failure_reason)
    VALUES (p_username, p_ua, p_ip, false, 'username_not_found');
    RETURN json_build_object('success', false, 'error', 'username_not_found', 'message', 'اسم المستخدم غير موجود');
  END IF;

  v_role := COALESCE(v_account.role, 'rider');

  IF COALESCE(v_account.status, 'active') <> 'active' THEN
    RETURN json_build_object('success', false, 'error', 'account_inactive', 'message', 'الحساب غير نشط');
  END IF;

  IF COALESCE(v_account.pin_enabled, TRUE) IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'pin_disabled', 'message', 'PIN غير مفعل لهذا الحساب');
  END IF;

  IF v_account.pin_hash IS NULL OR v_account.pin_hash <> extensions.crypt(p_pin, v_account.pin_hash) THEN
    UPDATE public.rider_accounts
    SET failed_attempts = COALESCE(failed_attempts,0) + 1,
        last_failed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_account.id;

    INSERT INTO public.rider_device_login_attempts(account_id, rider_id, username, user_agent, ip_address, success, failure_reason)
    VALUES (v_account.id, v_account.real_rider_id, p_username, p_ua, p_ip, false, 'wrong_pin');

    RETURN json_build_object('success', false, 'error', 'wrong_pin', 'message', 'PIN غير صحيح');
  END IF;

  -- Device lock applies to riders only, not managers.
  IF v_role = 'rider' THEN
    IF COALESCE(p_device_id, '') = '' THEN
      RETURN json_build_object('success', false, 'error', 'device_required', 'message', 'يجب الدخول من جهاز موثق');
    END IF;

    v_device_hash := encode(digest(p_device_id, 'sha256'), 'hex');

    SELECT EXISTS (
      SELECT 1 FROM public.rider_account_devices
      WHERE account_id = v_account.id
        AND status = 'approved'
    ) INTO v_has_approved_device;

    SELECT status INTO v_this_device_status
    FROM public.rider_account_devices
    WHERE account_id = v_account.id
      AND device_id_hash = v_device_hash
    LIMIT 1;

    IF NOT v_has_approved_device THEN
      INSERT INTO public.rider_account_devices(
        account_id, rider_id, username, rider_name, device_id_hash, device_label,
        user_agent, first_ip, last_ip, status, approved_at, first_seen_at, last_seen_at
      )
      VALUES (
        v_account.id, v_account.real_rider_id, v_account.username, v_account.resolved_name,
        v_device_hash, p_device_label, p_ua, p_ip, p_ip, 'approved', NOW(), NOW(), NOW()
      )
      ON CONFLICT (account_id, device_id_hash) DO UPDATE SET
        status = 'approved',
        last_seen_at = NOW(),
        last_ip = EXCLUDED.last_ip,
        user_agent = EXCLUDED.user_agent;

      v_this_device_status := 'approved';

    ELSIF v_this_device_status = 'approved' THEN
      UPDATE public.rider_account_devices
      SET last_seen_at = NOW(),
          last_ip = p_ip,
          user_agent = p_ua,
          device_label = COALESCE(NULLIF(p_device_label,''), device_label)
      WHERE account_id = v_account.id
        AND device_id_hash = v_device_hash;

    ELSE
      INSERT INTO public.rider_account_devices(
        account_id, rider_id, username, rider_name, device_id_hash, device_label,
        user_agent, first_ip, last_ip, status, first_seen_at, last_seen_at
      )
      VALUES (
        v_account.id, v_account.real_rider_id, v_account.username, v_account.resolved_name,
        v_device_hash, p_device_label, p_ua, p_ip, p_ip, 'pending', NOW(), NOW()
      )
      ON CONFLICT (account_id, device_id_hash) DO UPDATE SET
        status = CASE WHEN public.rider_account_devices.status = 'approved' THEN 'approved' ELSE 'pending' END,
        last_seen_at = NOW(),
        last_ip = EXCLUDED.last_ip,
        user_agent = EXCLUDED.user_agent,
        device_label = COALESCE(NULLIF(EXCLUDED.device_label,''), public.rider_account_devices.device_label);

      INSERT INTO public.rider_device_login_attempts(
        account_id, rider_id, username, device_id_hash, device_label, user_agent, ip_address, success, failure_reason
      )
      VALUES (
        v_account.id, v_account.real_rider_id, p_username, v_device_hash, p_device_label, p_ua, p_ip, false, 'device_not_approved'
      );

      RETURN json_build_object(
        'success', false,
        'error', 'device_not_approved',
        'message', 'هذا الحساب مربوط بجهاز آخر. برجاء التواصل مع الإدارة لاعتماد الجهاز الجديد.',
        'device_status', 'pending'
      );
    END IF;
  END IF;

  SELECT COALESCE(display_name, name) INTO v_branch_name
  FROM public.branches
  WHERE id = v_account.resolved_branch_id
  LIMIT 1;

  v_session_token := gen_random_uuid()::TEXT;

  UPDATE public.rider_accounts
  SET last_login_at = NOW(),
      failed_attempts = 0,
      last_failed_at = NULL,
      updated_at = NOW()
  WHERE id = v_account.id;

  INSERT INTO public.rider_device_login_attempts(
    account_id, rider_id, username, device_id_hash, device_label, user_agent, ip_address, success, failure_reason
  )
  VALUES (
    v_account.id, v_account.real_rider_id, p_username, v_device_hash, p_device_label, p_ua, p_ip, true, null
  );

  RETURN json_build_object(
    'success', true,
    'account_id', v_account.id,
    'rider_id', v_account.real_rider_id,
    'rider_name', v_account.resolved_name,
    'display_name', v_account.resolved_name,
    'username', v_account.username,
    'role', v_role,
    'branch_id', v_account.resolved_branch_id,
    'branch_name', v_branch_name,
    'must_change_pin', COALESCE(v_account.must_change_pin, FALSE),
    'session_token', v_session_token,
    'device_status', CASE WHEN v_role = 'rider' THEN 'approved' ELSE 'not_required' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_pin_login(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- Admin function to reset/approve devices
CREATE OR REPLACE FUNCTION public.admin_reset_rider_device(
  p_account_id UUID,
  p_reason TEXT DEFAULT 'تغيير جهاز الدليفري'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rider_account_devices
  SET status = 'replaced',
      replaced_at = NOW(),
      notes = COALESCE(p_reason, 'استبدال الجهاز')
  WHERE account_id = p_account_id
    AND status = 'approved';

  RETURN json_build_object('success', true, 'account_id', p_account_id, 'message', 'تم فك ربط الجهاز القديم. أول دخول قادم سيعتمد الجهاز الجديد تلقائيًا.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_rider_device(UUID, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_rider_device(
  p_device_row_id UUID,
  p_replace_old BOOLEAN DEFAULT TRUE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM public.rider_account_devices WHERE id = p_device_row_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'device_not_found', 'message', 'الجهاز غير موجود');
  END IF;

  IF p_replace_old THEN
    UPDATE public.rider_account_devices
    SET status = 'replaced',
        replaced_at = NOW()
    WHERE account_id = v_row.account_id
      AND status = 'approved'
      AND id <> p_device_row_id;
  END IF;

  UPDATE public.rider_account_devices
  SET status = 'approved',
      approved_at = NOW(),
      approved_by = auth.uid(),
      last_seen_at = NOW()
  WHERE id = p_device_row_id;

  RETURN json_build_object('success', true, 'device_id', p_device_row_id, 'account_id', v_row.account_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_rider_device(UUID, BOOLEAN) TO anon, authenticated;

-- View for admin device management
CREATE OR REPLACE VIEW public.rider_account_devices_view AS
SELECT
  d.*,
  ra.role,
  ra.status AS account_status,
  COALESCE(r.name, d.rider_name, ra.display_name, ra.username) AS resolved_rider_name,
  COALESCE(b.display_name, b.name) AS resolved_branch_name
FROM public.rider_account_devices d
LEFT JOIN public.rider_accounts ra ON ra.id = d.account_id
LEFT JOIN public.riders r ON r.id = COALESCE(d.rider_id, ra.rider_id)
LEFT JOIN public.branches b ON b.id = COALESCE(r.branch_id, ra.branch_id);

GRANT SELECT ON public.rider_account_devices_view TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
