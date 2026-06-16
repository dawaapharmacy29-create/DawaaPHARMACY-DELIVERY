-- ============================================================
-- SQL 44: PWA + rider notifications backbone
-- Creates rider_notifications and automatic notifications for policy/order/action changes.
-- Safe: no delete, no truncate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.rider_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  severity TEXT DEFAULT 'info',
  related_table TEXT,
  related_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_notifications_rider_created
ON public.rider_notifications(rider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rider_notifications_unread
ON public.rider_notifications(rider_id, read_at)
WHERE read_at IS NULL;

ALTER TABLE public.rider_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rider_notifications_read_open" ON public.rider_notifications;
CREATE POLICY "rider_notifications_read_open"
ON public.rider_notifications
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "rider_notifications_insert_open" ON public.rider_notifications;
CREATE POLICY "rider_notifications_insert_open"
ON public.rider_notifications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "rider_notifications_update_read_open" ON public.rider_notifications;
CREATE POLICY "rider_notifications_update_read_open"
ON public.rider_notifications
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.create_rider_notification(
  p_rider_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'general',
  p_severity TEXT DEFAULT 'info',
  p_related_table TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.rider_notifications (
    rider_id, title, message, type, severity, related_table, related_id, metadata, created_by
  )
  VALUES (
    p_rider_id,
    COALESCE(NULLIF(p_title, ''), 'تنبيه جديد'),
    COALESCE(NULLIF(p_message, ''), 'يوجد تحديث جديد متعلق بعملك.'),
    COALESCE(NULLIF(p_type, ''), 'general'),
    COALESCE(NULLIF(p_severity, ''), 'info'),
    p_related_table,
    p_related_id,
    COALESCE(p_metadata, '{}'::jsonb),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_rider_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, JSONB)
TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_rider_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rider_notifications
  SET read_at = COALESCE(read_at, NOW())
  WHERE id = p_notification_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_rider_notification_read(UUID) TO anon, authenticated;

-- Delivery order notifications: cancel/fail/delete/reassign/review/1.5 changes.
CREATE OR REPLACE FUNCTION public.notify_rider_from_delivery_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n JSONB := to_jsonb(NEW);
  o JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_rider_id UUID;
  v_id UUID;
  v_invoice TEXT;
  v_status TEXT;
  v_old_status TEXT;
  v_title TEXT;
  v_message TEXT;
BEGIN
  v_rider_id := NULLIF(n->>'rider_id', '')::UUID;
  IF v_rider_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_id := NULLIF(n->>'id', '')::UUID;
  v_invoice := COALESCE(NULLIF(n->>'invoice_number',''), NULLIF(n->>'invoice_no',''), 'بدون رقم');
  v_status := COALESCE(n->>'status', n->>'order_status', n->>'review_status', '');
  v_old_status := COALESCE(o->>'status', o->>'order_status', o->>'review_status', '');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_rider_notification(
      v_rider_id,
      'تم تسجيل أوردر جديد',
      'تم تسجيل فاتورة رقم ' || v_invoice || ' بنجاح.',
      'order_created',
      'info',
      TG_TABLE_NAME,
      v_id,
      n
    );
    RETURN NEW;
  END IF;

  IF COALESCE(n->>'deleted_at','') <> COALESCE(o->>'deleted_at','') AND COALESCE(n->>'deleted_at','') <> '' THEN
    v_title := 'تم إلغاء أوردر';
    v_message := 'تم إلغاء أو حذف فاتورة رقم ' || v_invoice || '. راجع سبب الإلغاء من الإدارة.';
  ELSIF v_status IS DISTINCT FROM v_old_status THEN
    v_title := 'تغيير حالة أوردر';
    v_message := 'تم تغيير حالة فاتورة رقم ' || v_invoice || ' من ' || COALESCE(v_old_status,'غير محدد') || ' إلى ' || COALESCE(v_status,'غير محدد') || '.';
  ELSIF COALESCE(n->>'is_countable','') IS DISTINCT FROM COALESCE(o->>'is_countable','') THEN
    v_title := 'تغيير احتساب أوردر';
    v_message := 'تم تغيير احتساب فاتورة رقم ' || v_invoice || ' في التقرير الشهري.';
  ELSIF COALESCE(n->>'approval_status','') IS DISTINCT FROM COALESCE(o->>'approval_status','') THEN
    v_title := 'مراجعة أوردر';
    v_message := 'تم تحديث اعتماد فاتورة رقم ' || v_invoice || ' إلى ' || COALESCE(n->>'approval_status','غير محدد') || '.';
  ELSIF COALESCE(n->>'is_multiplier_order','') IS DISTINCT FROM COALESCE(o->>'is_multiplier_order','') OR COALESCE(n->>'order_multiplier','') IS DISTINCT FROM COALESCE(o->>'order_multiplier','') THEN
    v_title := 'تحديث طلب ×1.5';
    v_message := 'تم تحديث حالة طلب ×1.5 لفاتورة رقم ' || v_invoice || '.';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.create_rider_notification(
    v_rider_id,
    v_title,
    v_message,
    'order_changed',
    'warning',
    TG_TABLE_NAME,
    v_id,
    jsonb_build_object('old', o, 'new', n)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_rider_delivery_orders ON public.delivery_orders;
CREATE TRIGGER trg_notify_rider_delivery_orders
AFTER INSERT OR UPDATE ON public.delivery_orders
FOR EACH ROW EXECUTE FUNCTION public.notify_rider_from_delivery_order_change();

-- Deductions / rewards / incentives / violations notifications from rider_shift_actions if table exists.
CREATE OR REPLACE FUNCTION public.notify_rider_from_action_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n JSONB := to_jsonb(NEW);
  o JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_rider_id UUID;
  v_id UUID;
  v_action TEXT;
  v_review TEXT;
  v_amount TEXT;
  v_title TEXT;
  v_message TEXT;
BEGIN
  v_rider_id := NULLIF(n->>'rider_id', '')::UUID;
  IF v_rider_id IS NULL THEN RETURN NEW; END IF;

  v_id := NULLIF(n->>'id', '')::UUID;
  v_action := COALESCE(n->>'final_action_type', n->>'action_type', n->>'type', 'action');
  v_review := COALESCE(n->>'review_status', n->>'status', 'pending');
  v_amount := COALESCE(n->>'final_amount', n->>'requested_amount', n->>'amount', '0');

  IF v_action ILIKE '%deduction%' OR v_action IN ('خصم','deduction_request') THEN
    v_title := 'تم تسجيل خصم';
    v_message := 'تم تسجيل خصم بقيمة ' || v_amount || ' وحالته: ' || v_review || '.';
  ELSIF v_action ILIKE '%reward%' OR v_action ILIKE '%bonus%' OR v_action IN ('مكافأة','حافز','reward_request','bonus_request') THEN
    v_title := 'تم تسجيل مكافأة أو حافز';
    v_message := 'تم تسجيل مكافأة/حافز بقيمة ' || v_amount || ' وحالتها: ' || v_review || '.';
  ELSE
    v_title := 'تحديث إداري جديد';
    v_message := COALESCE(n->>'summary', n->>'reason', 'تم تسجيل إجراء إداري متعلق بك.');
  END IF;

  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;

  PERFORM public.create_rider_notification(
    v_rider_id, v_title, v_message, 'rider_action', 
    CASE WHEN v_title LIKE '%خصم%' THEN 'danger' ELSE 'success' END,
    TG_TABLE_NAME, v_id, jsonb_build_object('old', o, 'new', n)
  );

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rider_shift_actions') THEN
    DROP TRIGGER IF EXISTS trg_notify_rider_shift_actions ON public.rider_shift_actions;
    CREATE TRIGGER trg_notify_rider_shift_actions
    AFTER INSERT OR UPDATE ON public.rider_shift_actions
    FOR EACH ROW EXECUTE FUNCTION public.notify_rider_from_action_change();
  END IF;
END $$;

-- Schedule exceptions: leave/permission notifications if table exists.
CREATE OR REPLACE FUNCTION public.notify_rider_from_schedule_exception()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n JSONB := to_jsonb(NEW);
  v_rider_id UUID;
  v_id UUID;
  v_type TEXT;
  v_status TEXT;
BEGIN
  v_rider_id := NULLIF(n->>'rider_id', '')::UUID;
  IF v_rider_id IS NULL THEN RETURN NEW; END IF;
  v_id := NULLIF(n->>'id','')::UUID;
  v_type := COALESCE(n->>'exception_type', n->>'type', 'إذن/إجازة');
  v_status := COALESCE(n->>'status', n->>'review_status', 'تم التسجيل');

  PERFORM public.create_rider_notification(
    v_rider_id,
    'تحديث إذن أو إجازة',
    'تم تسجيل/تحديث ' || v_type || ' وحالته: ' || v_status || '.',
    'schedule_exception',
    'warning',
    TG_TABLE_NAME,
    v_id,
    n
  );

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rider_schedule_exceptions') THEN
    DROP TRIGGER IF EXISTS trg_notify_rider_schedule_exceptions ON public.rider_schedule_exceptions;
    CREATE TRIGGER trg_notify_rider_schedule_exceptions
    AFTER INSERT OR UPDATE ON public.rider_schedule_exceptions
    FOR EACH ROW EXECUTE FUNCTION public.notify_rider_from_schedule_exception();
  END IF;
END $$;

-- Broadcast policy changes to all riders (rider_id NULL = general notification).
CREATE OR REPLACE FUNCTION public.notify_riders_from_policy_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n JSONB := to_jsonb(NEW);
  v_id UUID;
BEGIN
  v_id := NULLIF(n->>'id','')::UUID;
  PERFORM public.create_rider_notification(
    NULL,
    'سياسة جديدة أو تعديل سياسة',
    COALESCE(n->>'title', 'تم إضافة سياسة أو تعليمات جديدة.'),
    'policy',
    'info',
    TG_TABLE_NAME,
    v_id,
    n
  );
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='delivery_policies') THEN
    DROP TRIGGER IF EXISTS trg_notify_delivery_policies ON public.delivery_policies;
    CREATE TRIGGER trg_notify_delivery_policies
    AFTER INSERT OR UPDATE ON public.delivery_policies
    FOR EACH ROW EXECUTE FUNCTION public.notify_riders_from_policy_change();
  END IF;
END $$;

-- Quick general notification so riders see the new system after refresh.
SELECT public.create_rider_notification(
  NULL,
  'تم تفعيل نظام التنبيهات',
  'من الآن سيظهر لك تنبيه عند إضافة سياسة، خصم، مكافأة، حافز، إلغاء أوردر، أو أي تغيير مهم.',
  'system',
  'success',
  NULL,
  NULL,
  '{}'::jsonb
);

NOTIFY pgrst, 'reload schema';
