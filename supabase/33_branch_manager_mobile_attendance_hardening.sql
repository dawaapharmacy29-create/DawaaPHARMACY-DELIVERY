-- ============================================================
-- Migration 33: Branch manager dashboard + hardened attendance
-- Safe migration: no DROP DATA, no TRUNCATE, no DELETE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Attendance table hardening
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rider_id, work_date)
);

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS planned_shift_start TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS planned_shift_end TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS late_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS early_leave_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS total_minutes INT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'present';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS attendance_rider_work_date_unique
ON public.attendance(rider_id, work_date);

CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON public.attendance(branch_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_rider_date ON public.attendance(rider_id, work_date);

-- 2) Hardened attendance RPC used by the mobile rider app
CREATE OR REPLACE FUNCTION public.rider_record_attendance(
  p_rider_id UUID,
  p_action TEXT DEFAULT 'checkin'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rider public.riders%ROWTYPE;
  v_att public.attendance%ROWTYPE;
  v_today DATE := CURRENT_DATE;
  v_now TIMESTAMPTZ := NOW();
  v_minutes INT;
BEGIN
  SELECT * INTO v_rider FROM public.riders WHERE id = p_rider_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'rider_not_found');
  END IF;

  SELECT * INTO v_att
  FROM public.attendance
  WHERE rider_id = p_rider_id AND work_date = v_today
  LIMIT 1;

  IF LOWER(COALESCE(p_action, 'checkin')) = 'checkin' THEN
    IF FOUND AND v_att.check_in_at IS NOT NULL THEN
      RETURN json_build_object('success', true, 'already_done', true, 'action', 'checkin', 'attendance_id', v_att.id);
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
      rider_name = EXCLUDED.rider_name,
      branch_id = EXCLUDED.branch_id,
      branch_name = EXCLUDED.branch_name,
      status = 'present',
      updated_at = v_now
    RETURNING * INTO v_att;

    RETURN json_build_object('success', true, 'action', 'checkin', 'attendance_id', v_att.id);
  END IF;

  IF LOWER(COALESCE(p_action, 'checkin')) = 'checkout' THEN
    IF NOT FOUND OR v_att.check_in_at IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'checkin_required_first');
    END IF;

    IF v_att.check_out_at IS NOT NULL THEN
      RETURN json_build_object('success', true, 'already_done', true, 'action', 'checkout', 'attendance_id', v_att.id);
    END IF;

    v_minutes := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (v_now - v_att.check_in_at)) / 60));

    UPDATE public.attendance
    SET check_out_at = v_now,
        total_minutes = v_minutes,
        status = 'present',
        updated_at = v_now
    WHERE id = v_att.id
    RETURNING * INTO v_att;

    RETURN json_build_object('success', true, 'action', 'checkout', 'attendance_id', v_att.id, 'total_minutes', v_minutes);
  END IF;

  RETURN json_build_object('success', false, 'error', 'unknown_action');
END;
$$;

-- 3) Branch manager support columns and audit trail
CREATE TABLE IF NOT EXISTS public.branch_manager_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID,
  branch_name TEXT,
  actor_profile_id UUID,
  actor_name TEXT,
  action_type TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  reason TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branch_manager_audit_branch_date
ON public.branch_manager_audit_log(branch_id, created_at DESC);

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_manager_action_status TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_manager_action_by_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_manager_action_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_manager_action_reason TEXT;

ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS branch_manager_action_status TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS branch_manager_action_by_name TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS branch_manager_action_at TIMESTAMPTZ;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS branch_manager_action_reason TEXT;

-- 4) Shift actions compatibility for branch manager deduction/bonus requests
CREATE TABLE IF NOT EXISTS public.rider_shift_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  action_type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  incident_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary TEXT NOT NULL,
  proposed_amount NUMERIC DEFAULT 0,
  created_by UUID,
  created_by_name TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending_general_manager_review',
  final_action TEXT,
  final_amount NUMERIC DEFAULT 0,
  general_manager_note TEXT,
  reviewed_by UUID,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_branch_status
ON public.rider_shift_actions(branch_id, review_status);

-- 5) Standard Arabic policy/rule items for the delivery workflow
CREATE TABLE IF NOT EXISTS public.delivery_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'normal',
  active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.delivery_policies (policy_type, title, description, severity, sort_order)
VALUES
  ('order_rules', 'تسجيل الفاتورة إلزامي', 'لا يتم احتساب أي أوردر دون رقم فاتورة صحيح أو سبب استثنائي واضح.', 'high', 10),
  ('order_rules', 'طلبات ×1.5 تحتاج موافقة', 'لا يتم احتساب طلب ×1.5 إلا بعد موافقة المدير المختص ووجود سبب واضح.', 'high', 20),
  ('trip_rules', 'المشوار يحتاج إثبات', 'يجب تسجيل سبب المشوار وجهة الخروج والوصول ورقم فاتورة أو صورة/ملاحظة اعتماد إن وجدت.', 'high', 30),
  ('attendance_rules', 'الحضور والانصراف إلزاميان', 'يجب تسجيل الحضور بداية الشيفت والانصراف في نهايته لاحتساب ساعات الحضور.', 'high', 40),
  ('deduction_rules', 'التأخير المتكرر', 'يتم تسجيل طلب خصم عند التأخير أو ترك الشيفت دون إذن، ويعتمد القرار النهائي من المدير العام.', 'medium', 50),
  ('bonus_rules', 'الأداء المتميز', 'يمكن تسجيل مكافأة عند الالتزام العالي أو خدمة عميل ممتازة أو دعم الفريق.', 'normal', 60)
ON CONFLICT DO NOTHING;

-- 6) Branch-cycle summary for dashboards
CREATE OR REPLACE VIEW public.branch_cycle_delivery_summary AS
WITH period AS (
  SELECT
    CASE WHEN EXTRACT(DAY FROM CURRENT_DATE) >= 26
      THEN MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INT, EXTRACT(MONTH FROM CURRENT_DATE)::INT, 26)
      ELSE (MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INT, EXTRACT(MONTH FROM CURRENT_DATE)::INT, 26) - INTERVAL '1 month')::DATE
    END AS start_date,
    CASE WHEN EXTRACT(DAY FROM CURRENT_DATE) >= 26
      THEN (MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INT, EXTRACT(MONTH FROM CURRENT_DATE)::INT, 26) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
      ELSE (MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INT, EXTRACT(MONTH FROM CURRENT_DATE)::INT, 26) - INTERVAL '1 day')::DATE
    END AS end_date
)
SELECT
  b.id AS branch_id,
  COALESCE(b.display_name, b.name) AS branch_name,
  p.start_date,
  p.end_date,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL) AS total_orders,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL AND (o.status = 'delivered' OR o.delivered_at IS NOT NULL)) AS delivered_orders,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL AND (o.status = 'failed' OR o.failed_at IS NOT NULL OR o.failed_reason IS NOT NULL)) AS failed_orders,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL AND COALESCE(o.order_multiplier, CASE WHEN o.is_multiplier_order THEN 1.5 ELSE 1 END) >= 1.5) AS multiplier_orders,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL AND (o.is_duplicate_invoice OR o.duplicate_warning)) AS duplicate_orders,
  COUNT(t.id) AS total_trips,
  COUNT(t.id) FILTER (WHERE t.status = 'pending_approval') AS pending_trips,
  COUNT(a.id) FILTER (WHERE a.check_in_at IS NOT NULL) AS attendance_days,
  COALESCE(SUM(a.total_minutes), 0) AS attendance_minutes
FROM public.branches b
CROSS JOIN period p
LEFT JOIN public.delivery_orders o ON o.branch_id = b.id AND COALESCE(o.delivery_date, o.created_at::DATE) BETWEEN p.start_date AND p.end_date
LEFT JOIN public.internal_trips t ON t.branch_id = b.id AND COALESCE(t.trip_date, t.created_at::DATE) BETWEEN p.start_date AND p.end_date
LEFT JOIN public.attendance a ON a.branch_id = b.id AND a.work_date BETWEEN p.start_date AND p.end_date
GROUP BY b.id, b.display_name, b.name, p.start_date, p.end_date;

NOTIFY pgrst, 'reload schema';
