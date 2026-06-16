-- ============================================================
-- Migration 32: Monthly PDF report + 26/25 cycle + attendance fix + rules
-- Safe: no DROP tables, no DELETE, no TRUNCATE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Attendance table/runtime repair
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  work_date DATE DEFAULT CURRENT_DATE,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  planned_shift_start TEXT,
  planned_shift_end TEXT,
  late_minutes INTEGER DEFAULT 0,
  early_leave_minutes INTEGER DEFAULT 0,
  total_minutes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS work_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS planned_shift_start TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS planned_shift_end TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS early_leave_minutes INTEGER DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS total_minutes INTEGER DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS attendance_rider_work_date_unique
ON public.attendance(rider_id, work_date)
WHERE rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_rider_id ON public.attendance(rider_id);
CREATE INDEX IF NOT EXISTS idx_attendance_work_date ON public.attendance(work_date);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_public_all" ON public.attendance;
CREATE POLICY "attendance_public_all" ON public.attendance
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2) Incentive/deduction support fields on riders and actions
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS monthly_incentive_base NUMERIC DEFAULT 0;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS monthly_bonus_base NUMERIC DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.rider_shift_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  action_type TEXT,
  severity TEXT DEFAULT 'medium',
  incident_at TIMESTAMPTZ DEFAULT now(),
  shift_date DATE DEFAULT CURRENT_DATE,
  summary TEXT,
  requested_amount NUMERIC DEFAULT 0,
  requested_by_name TEXT,
  requested_by_role TEXT,
  review_status TEXT DEFAULT 'pending_general_manager',
  final_action_type TEXT,
  final_amount NUMERIC DEFAULT 0,
  final_decision TEXT,
  general_manager_note TEXT,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  cycle_start DATE,
  cycle_end DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium';
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS incident_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_amount NUMERIC DEFAULT 0;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_by_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_by_role TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending_general_manager';
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS final_action_type TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS final_amount NUMERIC DEFAULT 0;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS final_decision TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS general_manager_note TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS cycle_start DATE;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS cycle_end DATE;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_rider_id ON public.rider_shift_actions(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_shift_date ON public.rider_shift_actions(shift_date);
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_review_status ON public.rider_shift_actions(review_status);
ALTER TABLE public.rider_shift_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_shift_actions_public_all" ON public.rider_shift_actions;
CREATE POLICY "rider_shift_actions_public_all" ON public.rider_shift_actions
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3) Deduction / reward rule catalog for clear in-app options
CREATE TABLE IF NOT EXISTS public.rider_action_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL,
  code TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  default_amount NUMERIC DEFAULT 0,
  requires_general_manager BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.rider_action_rules (rule_type, code, title, description, default_amount, sort_order)
VALUES
  ('deduction','late_arrival','تأخير عن ميعاد الشيفت','تأخير بدون إذن أو بدون سبب مقبول',50,10),
  ('deduction','missing_checkout','نسيان تسجيل الانصراف','عدم تسجيل الانصراف أو ترك الشيفت بدون إثبات',25,20),
  ('deduction','failed_order_fault','أوردر فشل بسبب الدليفري','تقصير أو تأخير تسبب في فشل الأوردر',50,30),
  ('deduction','fake_trip','مشوار غير مثبت','تسجيل مشوار بدون إثبات أو سبب واضح',50,40),
  ('deduction','duplicate_invoice_abuse','تكرار فاتورة بدون سبب','محاولة احتساب فاتورة مكررة بدون سبب إداري واضح',75,50),
  ('deduction','bad_customer_behavior','أسلوب غير مناسب مع عميل','شكوى أو تعامل غير مناسب',100,60),
  ('deduction','uniform_or_phone','مخالفة تعليمات الشيفت','لبس/موبايل/التزام عام حسب سياسة الفرع',25,70),
  ('reward','excellent_shift','شيفت ممتاز','التزام واضح وسرعة وتعاون في ضغط الشغل',50,110),
  ('reward','high_orders','أداء عالي في الأوردرات','إنجاز عدد كبير من الأوردرات بدون أخطاء',75,120),
  ('reward','customer_praise','إشادة عميل','عميل أشاد بالمندوب أو الخدمة',50,130),
  ('reward','help_team','مساعدة الفريق','تعاون واضح أو إنقاذ موقف في الشيفت',50,140),
  ('reward','extra_effort','مجهود إضافي','مجهود خارج الطبيعي بموافقة الإدارة',100,150)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  default_amount = EXCLUDED.default_amount,
  active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

ALTER TABLE public.rider_action_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_action_rules_public_select" ON public.rider_action_rules;
CREATE POLICY "rider_action_rules_public_select" ON public.rider_action_rules
FOR SELECT TO anon, authenticated USING (true);

-- 4) Current cycle totals view, cycle always 26 -> 25.
-- Uses deleted_at rather than non-existing is_deleted.
CREATE OR REPLACE VIEW public.rider_current_cycle_totals AS
WITH bounds AS (
  SELECT
    CASE
      WHEN EXTRACT(DAY FROM CURRENT_DATE)::int >= 26 THEN (date_trunc('month', CURRENT_DATE)::date + 25)
      ELSE ((date_trunc('month', CURRENT_DATE)::date - INTERVAL '1 month')::date + 25)
    END AS cycle_start,
    CASE
      WHEN EXTRACT(DAY FROM CURRENT_DATE)::int >= 26 THEN ((date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')::date + 24)
      ELSE (date_trunc('month', CURRENT_DATE)::date + 24)
    END AS cycle_end
), orders AS (
  SELECT
    o.rider_id,
    COUNT(*) FILTER (WHERE o.deleted_at IS NULL) AS cycle_orders,
    COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND COALESCE(o.delivery_date, o.created_at::date) = CURRENT_DATE) AS today_orders,
    COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND COALESCE(o.order_multiplier,1) < 1.5) AS cycle_orders_1,
    COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND COALESCE(o.order_multiplier,1) >= 1.5) AS cycle_orders_15,
    COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'failed') AS cycle_failed_orders,
    COUNT(*) FILTER (WHERE o.deleted_at IS NULL AND COALESCE(o.is_duplicate_invoice,false) = true) AS cycle_duplicate_orders
  FROM public.delivery_orders o, bounds b
  WHERE o.rider_id IS NOT NULL
    AND COALESCE(o.delivery_date, o.created_at::date) BETWEEN b.cycle_start AND b.cycle_end
  GROUP BY o.rider_id
), trips AS (
  SELECT
    t.rider_id,
    COUNT(*) AS cycle_trips,
    COUNT(*) FILTER (WHERE COALESCE(t.trip_date, t.created_at::date) = CURRENT_DATE) AS today_trips,
    COUNT(*) FILTER (WHERE t.status IN ('approved','completed')) AS cycle_approved_trips,
    COUNT(*) FILTER (WHERE t.status IN ('pending','pending_approval')) AS cycle_pending_trips
  FROM public.internal_trips t, bounds b
  WHERE t.rider_id IS NOT NULL
    AND COALESCE(t.trip_date, t.created_at::date) BETWEEN b.cycle_start AND b.cycle_end
  GROUP BY t.rider_id
), att AS (
  SELECT
    a.rider_id,
    COUNT(DISTINCT a.work_date) FILTER (WHERE a.check_in_at IS NOT NULL) AS attendance_days,
    ROUND((COALESCE(SUM(CASE
      WHEN COALESCE(a.total_minutes,0) > 0 THEN a.total_minutes
      WHEN a.check_in_at IS NOT NULL AND a.check_out_at IS NOT NULL THEN EXTRACT(EPOCH FROM (a.check_out_at - a.check_in_at))/60
      ELSE 0 END),0) / 60.0)::numeric, 2) AS attendance_hours
  FROM public.attendance a, bounds b
  WHERE a.rider_id IS NOT NULL AND a.work_date BETWEEN b.cycle_start AND b.cycle_end
  GROUP BY a.rider_id
), actions AS (
  SELECT
    a.rider_id,
    COUNT(*) FILTER (WHERE a.action_type IN ('permission','late_permission','early_leave','absence','leave')) AS permissions_count,
    COALESCE(SUM(CASE WHEN a.review_status = 'approved' AND COALESCE(a.final_action_type,a.action_type) IN ('deduction','deduction_request') THEN COALESCE(a.final_amount,a.requested_amount,0) ELSE 0 END),0) AS deductions_amount,
    COALESCE(SUM(CASE WHEN a.review_status = 'approved' AND COALESCE(a.final_action_type,a.action_type) IN ('reward','reward_request') THEN COALESCE(a.final_amount,a.requested_amount,0) ELSE 0 END),0) AS rewards_amount
  FROM public.rider_shift_actions a, bounds b
  WHERE a.rider_id IS NOT NULL AND COALESCE(a.shift_date, a.incident_at::date) BETWEEN b.cycle_start AND b.cycle_end
  GROUP BY a.rider_id
)
SELECT
  r.id AS rider_id,
  r.name AS rider_name,
  r.username,
  r.branch_id,
  r.branch_name,
  b.cycle_start,
  b.cycle_end,
  COALESCE(o.today_orders,0) AS today_orders,
  COALESCE(t.today_trips,0) AS today_trips,
  COALESCE(o.cycle_orders,0) AS cycle_orders,
  COALESCE(t.cycle_trips,0) AS cycle_trips,
  COALESCE(o.cycle_orders_1,0) AS cycle_orders_1,
  COALESCE(o.cycle_orders_15,0) AS cycle_orders_15,
  COALESCE(o.cycle_failed_orders,0) AS cycle_failed_orders,
  COALESCE(o.cycle_duplicate_orders,0) AS cycle_duplicate_orders,
  COALESCE(t.cycle_approved_trips,0) AS cycle_approved_trips,
  COALESCE(t.cycle_pending_trips,0) AS cycle_pending_trips,
  COALESCE(att.attendance_days,0) AS attendance_days,
  COALESCE(att.attendance_hours,0) AS attendance_hours,
  COALESCE(actions.permissions_count,0) AS permissions_count,
  COALESCE(actions.deductions_amount,0) AS deductions_amount,
  COALESCE(actions.rewards_amount,0) AS rewards_amount,
  COALESCE(r.monthly_incentive_base, r.monthly_bonus_base, 0) AS incentive_base,
  GREATEST(0, COALESCE(r.monthly_incentive_base, r.monthly_bonus_base, 0) - COALESCE(actions.deductions_amount,0)) + COALESCE(actions.rewards_amount,0) AS incentive_after_deductions
FROM public.riders r
CROSS JOIN bounds b
LEFT JOIN orders o ON o.rider_id = r.id
LEFT JOIN trips t ON t.rider_id = r.id
LEFT JOIN att ON att.rider_id = r.id
LEFT JOIN actions ON actions.rider_id = r.id;

NOTIFY pgrst, 'reload schema';
