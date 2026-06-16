-- ============================================================
-- Migration 34: Strong rider attendance status + rich rider policies
-- Safe: no DELETE, no TRUNCATE, no DROP DATA
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Ensure attendance table can support the rider app reliably
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  work_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE),
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  planned_shift_start TEXT,
  planned_shift_end TEXT,
  late_minutes INT NOT NULL DEFAULT 0,
  early_leave_minutes INT NOT NULL DEFAULT 0,
  total_minutes INT,
  status TEXT NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS work_date DATE DEFAULT ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS planned_shift_start TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS planned_shift_end TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS late_minutes INT DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS early_leave_minutes INT DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS total_minutes INT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.attendance
SET
  work_date = COALESCE(work_date, (COALESCE(check_in_at, created_at, NOW()) AT TIME ZONE 'Africa/Cairo')::DATE),
  status = COALESCE(status, 'present'),
  late_minutes = COALESCE(late_minutes, 0),
  early_leave_minutes = COALESCE(early_leave_minutes, 0),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE work_date IS NULL OR status IS NULL OR late_minutes IS NULL OR early_leave_minutes IS NULL OR created_at IS NULL OR updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_rider_work_date_unique
ON public.attendance(rider_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_rider_open ON public.attendance(rider_id, check_out_at) WHERE check_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_rider_date ON public.attendance(rider_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON public.attendance(branch_id, work_date);

-- Optional but helpful for PostgREST direct reads. The RPC below is still the source of truth.
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='attendance' AND policyname='attendance_read_runtime') THEN
    CREATE POLICY attendance_read_runtime ON public.attendance
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='attendance' AND policyname='attendance_write_runtime') THEN
    CREATE POLICY attendance_write_runtime ON public.attendance
      FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='attendance' AND policyname='attendance_update_runtime') THEN
    CREATE POLICY attendance_update_runtime ON public.attendance
      FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2) Security-definer status reader. The rider app calls this after every refresh.
CREATE OR REPLACE FUNCTION public.rider_get_attendance_status(p_rider_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
  v_att public.attendance%ROWTYPE;
BEGIN
  SELECT * INTO v_att
  FROM public.attendance
  WHERE rider_id = p_rider_id
    AND (work_date = v_today OR (check_in_at IS NOT NULL AND check_out_at IS NULL))
  ORDER BY
    CASE WHEN work_date = v_today THEN 0 ELSE 1 END,
    created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', true, 'has_attendance', false, 'today', v_today, 'attendance', NULL);
  END IF;

  RETURN json_build_object(
    'success', true,
    'has_attendance', true,
    'today', v_today,
    'attendance', row_to_json(v_att),
    'status_label', CASE
      WHEN v_att.check_in_at IS NULL THEN 'not_checked_in'
      WHEN v_att.check_out_at IS NULL THEN 'checked_in'
      ELSE 'checked_out'
    END
  );
END;
$$;

-- 3) Hardened check-in/check-out. Uses Egypt day, updates the same day row, and returns the full row.
CREATE OR REPLACE FUNCTION public.rider_record_attendance(
  p_rider_id UUID,
  p_action TEXT DEFAULT 'checkin'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rider public.riders%ROWTYPE;
  v_att public.attendance%ROWTYPE;
  v_today DATE := ((NOW() AT TIME ZONE 'Africa/Cairo')::DATE);
  v_now TIMESTAMPTZ := NOW();
  v_minutes INT;
  v_action TEXT := LOWER(COALESCE(p_action, 'checkin'));
BEGIN
  SELECT * INTO v_rider FROM public.riders WHERE id = p_rider_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'rider_not_found', 'message', 'لم يتم العثور على حساب الدليفري.');
  END IF;

  SELECT * INTO v_att
  FROM public.attendance
  WHERE rider_id = p_rider_id AND work_date = v_today
  LIMIT 1;

  IF v_action = 'checkin' THEN
    IF FOUND AND v_att.check_in_at IS NOT NULL THEN
      RETURN json_build_object('success', true, 'already_done', true, 'action', 'checkin', 'attendance_id', v_att.id, 'attendance', row_to_json(v_att));
    END IF;

    INSERT INTO public.attendance (
      rider_id, rider_name, branch_id, branch_name, work_date,
      check_in_at, status, created_at, updated_at
    )
    VALUES (
      v_rider.id, v_rider.name, v_rider.branch_id, COALESCE(v_rider.branch_name, ''), v_today,
      v_now, 'present', v_now, v_now
    )
    ON CONFLICT (rider_id, work_date) DO UPDATE SET
      check_in_at = COALESCE(public.attendance.check_in_at, EXCLUDED.check_in_at),
      check_out_at = NULL,
      total_minutes = NULL,
      rider_name = EXCLUDED.rider_name,
      branch_id = EXCLUDED.branch_id,
      branch_name = EXCLUDED.branch_name,
      status = 'present',
      updated_at = v_now
    RETURNING * INTO v_att;

    RETURN json_build_object('success', true, 'action', 'checkin', 'attendance_id', v_att.id, 'attendance', row_to_json(v_att));
  END IF;

  IF v_action = 'checkout' THEN
    -- If today's row is missing, try an open row as fallback.
    IF NOT FOUND THEN
      SELECT * INTO v_att
      FROM public.attendance
      WHERE rider_id = p_rider_id AND check_in_at IS NOT NULL AND check_out_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF NOT FOUND OR v_att.check_in_at IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'checkin_required_first', 'message', 'يجب تسجيل الحضور أولاً قبل الانصراف.');
    END IF;

    IF v_att.check_out_at IS NOT NULL THEN
      RETURN json_build_object('success', true, 'already_done', true, 'action', 'checkout', 'attendance_id', v_att.id, 'attendance', row_to_json(v_att));
    END IF;

    v_minutes := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (v_now - v_att.check_in_at)) / 60));

    UPDATE public.attendance
    SET check_out_at = v_now,
        total_minutes = v_minutes,
        status = 'present',
        updated_at = v_now
    WHERE id = v_att.id
    RETURNING * INTO v_att;

    RETURN json_build_object('success', true, 'action', 'checkout', 'attendance_id', v_att.id, 'total_minutes', v_minutes, 'attendance', row_to_json(v_att));
  END IF;

  RETURN json_build_object('success', false, 'error', 'unknown_action', 'message', 'نوع عملية الحضور غير معروف.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_get_attendance_status(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rider_record_attendance(UUID, TEXT) TO anon, authenticated;

-- 4) Rich delivery policies with legacy column compatibility.
CREATE TABLE IF NOT EXISTS public.delivery_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT DEFAULT 'سياسة تشغيل',
  body TEXT DEFAULT '',
  category TEXT DEFAULT 'general',
  active BOOLEAN DEFAULT TRUE,
  effective_date DATE DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS policy_type TEXT DEFAULT 'general';
ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'سياسة تشغيل';
ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';
ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium';
ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 100;
ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS applies_to TEXT DEFAULT 'rider';
ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE public.delivery_policies ADD COLUMN IF NOT EXISTS created_by_name TEXT;

UPDATE public.delivery_policies
SET body = COALESCE(NULLIF(body,''), description, title, 'سياسة تشغيل'),
    description = COALESCE(description, NULLIF(body,''), title, 'سياسة تشغيل')
WHERE body IS NULL OR body = '' OR description IS NULL;

ALTER TABLE public.delivery_policies ALTER COLUMN body SET DEFAULT '';
ALTER TABLE public.delivery_policies ALTER COLUMN title SET DEFAULT 'سياسة تشغيل';
ALTER TABLE public.delivery_policies ALTER COLUMN policy_type SET DEFAULT 'general';
ALTER TABLE public.delivery_policies ALTER COLUMN severity SET DEFAULT 'medium';
ALTER TABLE public.delivery_policies ALTER COLUMN sort_order SET DEFAULT 100;
ALTER TABLE public.delivery_policies ALTER COLUMN active SET DEFAULT TRUE;
ALTER TABLE public.delivery_policies ALTER COLUMN applies_to SET DEFAULT 'rider';

CREATE UNIQUE INDEX IF NOT EXISTS delivery_policies_type_title_unique
ON public.delivery_policies(policy_type, title);

INSERT INTO public.delivery_policies (policy_type, title, description, body, severity, sort_order, active, applies_to)
VALUES
  ('order_rules', 'رقم الفاتورة إلزامي', 'لا يتم احتساب أي أوردر دون رقم فاتورة صحيح ومطابق للفاتورة.', 'لا يتم احتساب أي أوردر دون رقم فاتورة صحيح ومطابق للفاتورة.', 'high', 10, true, 'rider'),
  ('order_rules', 'تصوير الفاتورة عند الطلب', 'يجب رفع صورة واضحة للفاتورة عند طلب الإدارة أو عند وجود مراجعة.', 'يجب رفع صورة واضحة للفاتورة عند طلب الإدارة أو عند وجود مراجعة.', 'high', 20, true, 'rider'),
  ('order_rules', 'طلبات ×1.5 تحت الموافقة', 'طلبات ×1.5 لا تُحتسب إلا بعد موافقة مدير الفرع أو المدير العام ووجود سبب واضح.', 'طلبات ×1.5 لا تُحتسب إلا بعد موافقة مدير الفرع أو المدير العام ووجود سبب واضح.', 'high', 30, true, 'rider'),
  ('trip_rules', 'المشوار يحتاج إثباتاً', 'كل مشوار يجب أن يحتوي على جهة خروج وجهة وصول وسبب وإثبات مناسب.', 'كل مشوار يجب أن يحتوي على جهة خروج وجهة وصول وسبب وإثبات مناسب.', 'high', 40, true, 'rider'),
  ('attendance_rules', 'الحضور والانصراف إلزاميان', 'تسجيل الحضور في بداية الشيفت والانصراف في نهايته شرط لاحتساب ساعات الحضور.', 'تسجيل الحضور في بداية الشيفت والانصراف في نهايته شرط لاحتساب ساعات الحضور.', 'high', 50, true, 'rider'),
  ('review_rules', 'الأوردر الفاشل لا يُحتسب', 'الأوردر الفاشل يظهر في التقرير للمتابعة ولا يدخل في الأوردرات المحتسبة.', 'الأوردر الفاشل يظهر في التقرير للمتابعة ولا يدخل في الأوردرات المحتسبة.', 'high', 60, true, 'rider'),
  ('review_rules', 'الفواتير المكررة تحت المراجعة', 'أي فاتورة مكررة تحتاج مراجعة ولا تُحتسب تلقائياً.', 'أي فاتورة مكررة تحتاج مراجعة ولا تُحتسب تلقائياً.', 'high', 70, true, 'rider'),
  ('route_rules', 'العنوان والمسار', 'يجب كتابة العنوان الفعلي للتسليم واستخدام المسار المعتمد عند الحاجة.', 'يجب كتابة العنوان الفعلي للتسليم واستخدام المسار المعتمد عند الحاجة.', 'medium', 80, true, 'rider'),
  ('service_rules', 'التعامل مع العميل', 'الالتزام بالاحترام والهدوء وتسليم الطلب بصورة مهنية.', 'الالتزام بالاحترام والهدوء وتسليم الطلب بصورة مهنية.', 'medium', 90, true, 'rider'),
  ('audit_rules', 'منع التلاعب', 'أي تعديل أو حذف أو تحويل يتم تسجيله باسم المسؤول ووقت الإجراء.', 'أي تعديل أو حذف أو تحويل يتم تسجيله باسم المسؤول ووقت الإجراء.', 'high', 100, true, 'rider'),
  ('bonus_rules', 'المكافآت', 'الأداء المتميز وخدمة العميل الجيدة يمكن رفعهما للمراجعة كمكافأة.', 'الأداء المتميز وخدمة العميل الجيدة يمكن رفعهما للمراجعة كمكافأة.', 'medium', 110, true, 'rider')
ON CONFLICT (policy_type, title) DO UPDATE SET
  description = EXCLUDED.description,
  body = EXCLUDED.body,
  severity = EXCLUDED.severity,
  sort_order = EXCLUDED.sort_order,
  active = true,
  applies_to = 'rider',
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
