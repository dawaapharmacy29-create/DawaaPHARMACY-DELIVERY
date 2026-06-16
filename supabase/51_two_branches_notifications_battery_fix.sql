-- ============================================================
-- SQL 51: Two branches cleanup + notification/battery fixes
-- فرعين فقط: فرع الشامي وفرع شكري + إصلاح إرسال التنبيهات + صلاحيات البطارية
-- Safe: لا يحذف بيانات، فقط يطبع/يوحد ويرتب
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) تأكيد وجود فرعي التشغيل الرسميين
INSERT INTO public.branches (name, display_name, status, created_at)
SELECT 'فرع الشامي', 'فرع الشامي', 'active', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches
  WHERE name = 'فرع الشامي' OR display_name = 'فرع الشامي' OR name ILIKE '%الشامي%'
);

INSERT INTO public.branches (name, display_name, status, created_at)
SELECT 'فرع شكري', 'فرع شكري', 'active', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches
  WHERE name = 'فرع شكري' OR display_name = 'فرع شكري' OR name ILIKE '%شكري%' OR name ILIKE '%شكرى%'
);

-- 2) توحيد أسماء الفرعين داخل branches قدر الإمكان
UPDATE public.branches
SET name = 'فرع الشامي',
    display_name = 'فرع الشامي',
    status = COALESCE(NULLIF(status, ''), 'active')
WHERE name ILIKE '%شامي%'
   OR display_name ILIKE '%شامي%';

UPDATE public.branches
SET name = 'فرع شكري',
    display_name = 'فرع شكري',
    status = COALESCE(NULLIF(status, ''), 'active')
WHERE name ILIKE '%شكري%'
   OR name ILIKE '%شكرى%'
   OR display_name ILIKE '%شكري%'
   OR display_name ILIKE '%شكرى%';

-- 3) أرشفة أي فرع آخر حتى لا يظهر في الاختيارات
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='branches' AND column_name='status'
  ) THEN
    UPDATE public.branches
    SET status = 'inactive'
    WHERE COALESCE(display_name, name) NOT IN ('فرع الشامي', 'فرع شكري');
  END IF;
END $$;

-- 4) تحديث branch_id والاسم في الجداول الرئيسية طبقاً للاسم
DO $$
DECLARE
  v_shamy UUID;
  v_shokry UUID;
BEGIN
  SELECT id INTO v_shamy
  FROM public.branches
  WHERE COALESCE(display_name, name) = 'فرع الشامي'
  ORDER BY created_at NULLS FIRST
  LIMIT 1;

  SELECT id INTO v_shokry
  FROM public.branches
  WHERE COALESCE(display_name, name) = 'فرع شكري'
  ORDER BY created_at NULLS FIRST
  LIMIT 1;

  -- riders
  UPDATE public.riders
  SET branch_id = v_shamy,
      branch_name = 'فرع الشامي'
  WHERE (branch_name ILIKE '%شامي%' OR name ILIKE '%الشامي%') AND v_shamy IS NOT NULL;

  UPDATE public.riders
  SET branch_id = v_shokry,
      branch_name = 'فرع شكري'
  WHERE (branch_name ILIKE '%شكري%' OR branch_name ILIKE '%شكرى%' OR name ILIKE '%شكري%') AND v_shokry IS NOT NULL;

  -- rider_accounts
  UPDATE public.rider_accounts
  SET branch_id = v_shamy
  WHERE branch_id IN (SELECT id FROM public.branches WHERE COALESCE(display_name, name) = 'فرع الشامي') AND v_shamy IS NOT NULL;

  UPDATE public.rider_accounts
  SET branch_id = v_shokry
  WHERE branch_id IN (SELECT id FROM public.branches WHERE COALESCE(display_name, name) = 'فرع شكري') AND v_shokry IS NOT NULL;

  -- delivery_orders
  UPDATE public.delivery_orders
  SET branch_id = v_shamy,
      branch_name = 'فرع الشامي'
  WHERE branch_name ILIKE '%شامي%' AND v_shamy IS NOT NULL;

  UPDATE public.delivery_orders
  SET branch_id = v_shokry,
      branch_name = 'فرع شكري'
  WHERE (branch_name ILIKE '%شكري%' OR branch_name ILIKE '%شكرى%') AND v_shokry IS NOT NULL;

  -- internal_trips
  UPDATE public.internal_trips
  SET branch_id = v_shamy,
      branch_name = 'فرع الشامي'
  WHERE branch_name ILIKE '%شامي%' AND v_shamy IS NOT NULL;

  UPDATE public.internal_trips
  SET branch_id = v_shokry,
      branch_name = 'فرع شكري'
  WHERE (branch_name ILIKE '%شكري%' OR branch_name ILIKE '%شكرى%') AND v_shokry IS NOT NULL;

  -- rider_device_status
  UPDATE public.rider_device_status
  SET branch_id = v_shamy,
      branch_name = 'فرع الشامي'
  WHERE branch_name ILIKE '%شامي%' AND v_shamy IS NOT NULL;

  UPDATE public.rider_device_status
  SET branch_id = v_shokry,
      branch_name = 'فرع شكري'
  WHERE (branch_name ILIKE '%شكري%' OR branch_name ILIKE '%شكرى%') AND v_shokry IS NOT NULL;
END $$;

-- 5) جدول التنبيهات + أعمدة توافقية
CREATE TABLE IF NOT EXISTS public.rider_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  title TEXT,
  message TEXT,
  body TEXT,
  description TEXT,
  notification_type TEXT DEFAULT 'general',
  severity TEXT DEFAULT 'info',
  reference_table TEXT,
  reference_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS notification_type TEXT DEFAULT 'general';
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'info';
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS reference_table TEXT;
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE public.rider_notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 6) دالة إرسال تنبيه متوافقة مع كل الصفحات
CREATE OR REPLACE FUNCTION public.create_rider_notification(
  p_rider_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT 'تنبيه',
  p_message TEXT DEFAULT '',
  p_notification_type TEXT DEFAULT 'general',
  p_severity TEXT DEFAULT 'info',
  p_reference_table TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_body TEXT;
BEGIN
  v_body := COALESCE(NULLIF(p_message, ''), p_title, 'تنبيه');

  INSERT INTO public.rider_notifications (
    rider_id, title, message, body, description,
    notification_type, severity, reference_table, reference_id,
    metadata, is_read, created_at
  )
  VALUES (
    p_rider_id,
    COALESCE(NULLIF(p_title, ''), 'تنبيه'),
    v_body,
    v_body,
    v_body,
    COALESCE(NULLIF(p_notification_type, ''), 'general'),
    COALESCE(NULLIF(p_severity, ''), 'info'),
    p_reference_table,
    p_reference_id,
    COALESCE(p_metadata, '{}'::jsonb),
    FALSE,
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_rider_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) TO anon, authenticated;

-- 7) صلاحيات الجداول والبطارية والتنبيهات
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.branches TO anon, authenticated;
GRANT SELECT ON public.riders TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rider_notifications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rider_device_status TO anon, authenticated;
GRANT SELECT, INSERT ON public.rider_device_events TO anon, authenticated;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_device_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_device_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='branches' AND policyname='app_select_branches_any') THEN
    CREATE POLICY app_select_branches_any ON public.branches FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_notifications' AND policyname='app_select_rider_notifications_any') THEN
    CREATE POLICY app_select_rider_notifications_any ON public.rider_notifications FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_notifications' AND policyname='app_insert_rider_notifications_any') THEN
    CREATE POLICY app_insert_rider_notifications_any ON public.rider_notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_notifications' AND policyname='app_update_rider_notifications_any') THEN
    CREATE POLICY app_update_rider_notifications_any ON public.rider_notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_status' AND policyname='app_select_rider_device_status_any') THEN
    CREATE POLICY app_select_rider_device_status_any ON public.rider_device_status FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_status' AND policyname='app_insert_rider_device_status_any') THEN
    CREATE POLICY app_insert_rider_device_status_any ON public.rider_device_status FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_status' AND policyname='app_update_rider_device_status_any') THEN
    CREATE POLICY app_update_rider_device_status_any ON public.rider_device_status FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_events' AND policyname='app_select_rider_device_events_any') THEN
    CREATE POLICY app_select_rider_device_events_any ON public.rider_device_events FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_events' AND policyname='app_insert_rider_device_events_any') THEN
    CREATE POLICY app_insert_rider_device_events_any ON public.rider_device_events FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $$;

-- 8) اختبار إرسال تنبيه عام
SELECT public.create_rider_notification(
  NULL,
  'اختبار التنبيهات',
  'تم إصلاح نظام إرسال التنبيهات من الإدارة.',
  'system_test',
  'info',
  NULL,
  NULL,
  '{}'::jsonb
) AS notification_test_id;

NOTIFY pgrst, 'reload schema';
