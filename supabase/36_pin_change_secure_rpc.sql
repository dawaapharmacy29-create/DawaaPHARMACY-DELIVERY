-- ══════════════════════════════════════════════════════════════════
-- Migration 36: rider_change_pin RPC + Security Headers
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rider_change_pin(
  p_rider_id UUID,
  p_new_pin  TEXT,
  p_token    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- تحقق من الـ PIN
  IF NOT (p_new_pin ~ '^\d{4,8}$') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_pin_format', 'message', 'PIN يجب أن يكون 4-8 أرقام');
  END IF;

  -- لو عندنا token نتحقق منه
  IF p_token IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.rider_sessions
      WHERE session_token = p_token
        AND rider_id = p_rider_id
        AND NOT revoked
        AND expires_at > now()
    ) THEN
      RETURN json_build_object('success', false, 'error', 'session_invalid');
    END IF;
  ELSE
    -- بدون token نتحقق إن الـ rider موجود
    IF NOT EXISTS (SELECT 1 FROM public.riders WHERE id = p_rider_id AND status = 'active') THEN
      RETURN json_build_object('success', false, 'error', 'rider_not_found');
    END IF;
  END IF;

  -- جلب الـ account_id
  SELECT id INTO v_account_id
  FROM public.rider_accounts
  WHERE rider_id = p_rider_id AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'account_not_found');
  END IF;

  -- تحديث الـ PIN مع hashing
  UPDATE public.rider_accounts
  SET
    pin_hash = crypt(p_new_pin, gen_salt('bf', 10)),
    pin_plain = NULL,  -- احذف plain text بعد الـ hash
    must_change_pin = false,
    pin_changed_at = now(),
    updated_at = now()
  WHERE id = v_account_id;

  -- تحديث riders table كمان
  UPDATE public.riders
  SET
    pin = NULL,  -- لا نخزن PIN في riders table
    pin_enabled = true,
    pin_changed_at = now()
  WHERE id = p_rider_id;

  RETURN json_build_object('success', true, 'message', 'تم تغيير الـ PIN بنجاح');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_change_pin(UUID, TEXT, TEXT) TO anon;

-- ══════════════════════════════════════════════════════════════════
-- إضافة عمود updated_at لـ rider_accounts لو مش موجود
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE public.rider_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ══════════════════════════════════════════════════════════════════
-- تنظيف: مسح PIN plain text من rider_accounts اللي عندهم hash
-- ══════════════════════════════════════════════════════════════════
UPDATE public.rider_accounts
SET pin_plain = NULL
WHERE pin_hash IS NOT NULL AND pin_plain IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════
-- تأمين notifications و customers tables
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_anon_all" ON public.customers;

-- Customers: قراءة فقط للمصادقين (admin/manager)
CREATE POLICY IF NOT EXISTS "customers_admin_read"
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'shift_manager', 'branch_manager')
    AND status = 'active'
  )
);

-- Rider يقدر يبحث عن الكسمر عبر RPC فقط
REVOKE ALL ON TABLE public.customers FROM anon;

-- ══════════════════════════════════════════════════════════════════
-- RPC: rider_search_customers — بديل آمن للبحث عن الكسمر
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rider_search_customers(
  p_token TEXT,
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session JSON;
  v_pattern TEXT;
BEGIN
  v_session := public.rider_validate_session(p_token);
  IF NOT (v_session->>'valid')::BOOLEAN THEN
    RETURN json_build_object('success', false, 'error', 'session_invalid', 'data', '[]'::json);
  END IF;

  -- تنظيف الـ query من أي محاولات injection
  v_pattern := '%' || REPLACE(REPLACE(REPLACE(p_query, '%', ''), '_', ''), '''', '') || '%';

  RETURN json_build_object(
    'success', true,
    'data', (
      SELECT COALESCE(json_agg(c), '[]'::json)
      FROM (
        SELECT id, code, name, phone, address
        FROM public.customers
        WHERE
          code ILIKE v_pattern
          OR name ILIKE v_pattern
          OR phone ILIKE v_pattern
        ORDER BY name
        LIMIT LEAST(p_limit, 50)
      ) c
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_search_customers(TEXT, TEXT, INT) TO anon;

COMMENT ON FUNCTION public.rider_change_pin IS 'Secure PIN change with bcrypt hashing';
COMMENT ON FUNCTION public.rider_search_customers IS 'Token-gated customer search (no direct table access)';
