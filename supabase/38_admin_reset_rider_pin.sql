-- ============================================================
-- Migration 38: Admin reset rider PIN safely
-- Safe: no DELETE, no TRUNCATE, no data loss
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.rider_accounts
ADD COLUMN IF NOT EXISTS pin_hash TEXT;

ALTER TABLE public.rider_accounts
ADD COLUMN IF NOT EXISTS pin_plain TEXT;

ALTER TABLE public.rider_accounts
ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN DEFAULT FALSE;

ALTER TABLE public.rider_accounts
ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE public.rider_accounts
ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;

ALTER TABLE public.rider_accounts
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

ALTER TABLE public.rider_accounts
ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;

ALTER TABLE public.rider_accounts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.rider_accounts
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE public.riders
ADD COLUMN IF NOT EXISTS pin TEXT;

ALTER TABLE public.riders
ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE public.riders
ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;

ALTER TABLE public.riders
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.rider_pin_reset_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES public.riders(id) ON DELETE SET NULL,
  account_id UUID,
  reset_by UUID,
  reset_by_name TEXT,
  reason TEXT,
  force_change BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_pin_reset_audit_rider
ON public.rider_pin_reset_audit(rider_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_reset_rider_pin(
  p_rider_id UUID,
  p_new_pin TEXT,
  p_force_change BOOLEAN DEFAULT TRUE,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_account public.rider_accounts%ROWTYPE;
  v_rider public.riders%ROWTYPE;
  v_admin RECORD;
BEGIN
  IF NOT (p_new_pin ~ '^\d{4,8}$') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'invalid_pin_format',
      'message', 'PIN يجب أن يكون من 4 إلى 8 أرقام'
    );
  END IF;

  SELECT
    up.auth_user_id,
    COALESCE(up.display_name, up.username, up.email, 'مدير النظام') AS admin_name,
    up.role,
    COALESCE(up.status, 'active') AS status
  INTO v_admin
  FROM public.user_profiles up
  WHERE up.auth_user_id = auth.uid()
    AND up.role IN ('admin', 'general_manager', 'shift_manager', 'branch_manager')
    AND COALESCE(up.status, 'active') = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'not_authorized',
      'message', 'غير مسموح لك بإعادة تعيين PIN'
    );
  END IF;

  SELECT * INTO v_rider
  FROM public.riders
  WHERE id = p_rider_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'rider_not_found',
      'message', 'المندوب غير موجود'
    );
  END IF;

  SELECT * INTO v_account
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
  SET
    pin_hash = crypt(p_new_pin, gen_salt('bf')),
    pin_plain = NULL,
    must_change_pin = COALESCE(p_force_change, TRUE),
    pin_enabled = TRUE,
    failed_attempts = 0,
    locked_until = NULL,
    pin_changed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_account.id;

  UPDATE public.riders
  SET
    pin = NULL,
    pin_enabled = TRUE,
    pin_changed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_rider_id;

  INSERT INTO public.rider_pin_reset_audit (
    rider_id,
    account_id,
    reset_by,
    reset_by_name,
    reason,
    force_change
  ) VALUES (
    p_rider_id,
    v_account.id,
    v_admin.auth_user_id,
    v_admin.admin_name,
    p_reason,
    COALESCE(p_force_change, TRUE)
  );

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    INSERT INTO public.notifications (
      rider_id,
      branch_id,
      title,
      body,
      message,
      notification_type,
      severity,
      category,
      is_read,
      status,
      created_by,
      created_by_name
    ) VALUES (
      p_rider_id,
      v_rider.branch_id,
      'تم تعيين PIN جديد',
      'تم تعيين رقم PIN جديد لحسابك. قد يُطلب منك تغييره عند أول دخول.',
      'تم تعيين رقم PIN جديد لحسابك. قد يُطلب منك تغييره عند أول دخول.',
      'pin_reset',
      'info',
      'account',
      FALSE,
      'active',
      v_admin.auth_user_id,
      v_admin.admin_name
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'تم تعيين PIN جديد بنجاح',
    'rider_id', p_rider_id,
    'rider_name', v_rider.name,
    'force_change', COALESCE(p_force_change, TRUE)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_rider_pin(UUID, TEXT, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.admin_reset_rider_pin(UUID, TEXT, BOOLEAN, TEXT)
IS 'Admin/manager securely resets rider PIN with bcrypt hash and audit log';

NOTIFY pgrst, 'reload schema';
