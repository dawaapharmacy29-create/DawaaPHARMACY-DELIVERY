-- ============================================================
-- Migration 31: Rider/Admin cycle totals + attendance/leave runtime fix
-- Safe: no DROP tables, no DELETE, no TRUNCATE
-- Purpose:
-- 1) Ensure attendance check-in/out can be saved from the rider mobile page.
-- 2) Ensure leave/permission requests from /admin/riders can be saved.
-- 3) Add helpful cycle summary view for dashboard/reporting.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────
-- attendance table used by rider check-in/check-out
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  work_date DATE DEFAULT CURRENT_DATE,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  total_minutes INTEGER DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
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
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS total_minutes INTEGER DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0;
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

-- ────────────────────────────────────────────────────────────
-- rider_schedule_exceptions used by admin leave/permission button
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rider_schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  exception_type TEXT DEFAULT 'permission',
  exception_date DATE DEFAULT CURRENT_DATE,
  start_time TEXT,
  end_time TEXT,
  reason TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  requested_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS exception_type TEXT DEFAULT 'permission';
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS exception_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS end_time TEXT;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS requested_by TEXT;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.rider_schedule_exceptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_rider_schedule_exceptions_rider_id ON public.rider_schedule_exceptions(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_schedule_exceptions_date ON public.rider_schedule_exceptions(exception_date);
CREATE INDEX IF NOT EXISTS idx_rider_schedule_exceptions_status ON public.rider_schedule_exceptions(status);

ALTER TABLE public.rider_schedule_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_schedule_exceptions_public_all" ON public.rider_schedule_exceptions;
CREATE POLICY "rider_schedule_exceptions_public_all" ON public.rider_schedule_exceptions
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- Current cycle summary view.
-- Cycle is 26 -> 25. This view is for admin dashboards/reports only.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.rider_current_cycle_totals AS
WITH bounds AS (
  SELECT
    CASE
      WHEN EXTRACT(DAY FROM CURRENT_DATE)::int >= 26 THEN date_trunc('month', CURRENT_DATE)::date + 25
      ELSE (date_trunc('month', CURRENT_DATE)::date - INTERVAL '1 month')::date + 25
    END AS cycle_start,
    CASE
      WHEN EXTRACT(DAY FROM CURRENT_DATE)::int >= 26 THEN (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')::date + 24
      ELSE date_trunc('month', CURRENT_DATE)::date + 24
    END AS cycle_end
), orders AS (
  SELECT
    o.rider_id,
    COUNT(*) FILTER (WHERE COALESCE(o.is_deleted,false) = false) AS cycle_orders,
    COUNT(*) FILTER (WHERE COALESCE(o.is_deleted,false) = false AND o.delivery_date = CURRENT_DATE) AS today_orders,
    COUNT(*) FILTER (WHERE COALESCE(o.is_deleted,false) = false AND COALESCE(o.order_multiplier,1) = 1) AS cycle_orders_1,
    COUNT(*) FILTER (WHERE COALESCE(o.is_deleted,false) = false AND COALESCE(o.order_multiplier,1) >= 1.5) AS cycle_orders_15,
    COUNT(*) FILTER (WHERE COALESCE(o.is_deleted,false) = false AND o.status = 'failed') AS cycle_failed_orders,
    COUNT(*) FILTER (WHERE COALESCE(o.is_deleted,false) = false AND COALESCE(o.is_duplicate_invoice,false) = true) AS cycle_duplicate_orders
  FROM public.delivery_orders o, bounds b
  WHERE o.delivery_date BETWEEN b.cycle_start AND b.cycle_end
  GROUP BY o.rider_id
), trips AS (
  SELECT
    t.rider_id,
    COUNT(*) AS cycle_trips,
    COUNT(*) FILTER (WHERE t.trip_date = CURRENT_DATE) AS today_trips,
    COUNT(*) FILTER (WHERE t.status IN ('approved','completed')) AS cycle_approved_trips,
    COUNT(*) FILTER (WHERE t.status IN ('pending','pending_approval')) AS cycle_pending_trips
  FROM public.internal_trips t, bounds b
  WHERE t.trip_date BETWEEN b.cycle_start AND b.cycle_end
  GROUP BY t.rider_id
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
  COALESCE(t.cycle_pending_trips,0) AS cycle_pending_trips
FROM public.riders r
CROSS JOIN bounds b
LEFT JOIN orders o ON o.rider_id = r.id
LEFT JOIN trips t ON t.rider_id = r.id;

NOTIFY pgrst, 'reload schema';
