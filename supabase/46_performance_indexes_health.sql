-- ============================================================
-- Migration 46: Performance & Stability Indexes
-- Safe: CREATE INDEX CONCURRENTLY, no data changes
-- ============================================================

-- 1. delivery_orders — الاستعلامات الأكثر تكراراً
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_orders_rider_date
  ON public.delivery_orders(rider_id, delivery_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_orders_branch_date
  ON public.delivery_orders(branch_id, delivery_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_orders_invoice
  ON public.delivery_orders(invoice_number)
  WHERE invoice_number IS NOT NULL AND deleted_at IS NULL;

-- 2. internal_trips
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_internal_trips_rider_date
  ON public.internal_trips(rider_id, trip_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_internal_trips_branch_date
  ON public.internal_trips(branch_id, trip_date DESC);

-- 3. attendance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_rider_workdate
  ON public.attendance(rider_id, work_date DESC);

-- 4. rider_accounts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rider_accounts_username_upper
  ON public.rider_accounts(UPPER(username));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rider_accounts_status
  ON public.rider_accounts(status)
  WHERE status = 'active';

-- 5. rider_sessions — للـ token lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rider_sessions_token_valid
  ON public.rider_sessions(session_token, expires_at)
  WHERE revoked = FALSE;

-- 6. rider_notifications
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rider_notifications_rider_created
  ON public.rider_notifications(rider_id, created_at DESC);

-- 7. إنظيف الـ sessions المنتهية (older than 48h)
DELETE FROM public.rider_sessions
WHERE expires_at < NOW() - INTERVAL '48 hours'
  AND revoked = FALSE;

-- 8. تأكيد الـ extension pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 9. Health check function للـ /health page
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'status', 'ok',
    'timestamp', NOW(),
    'db', 'connected'
  );
$$;
GRANT EXECUTE ON FUNCTION public.health_check() TO anon, authenticated;

COMMENT ON FUNCTION public.health_check IS 'Simple DB health check — returns ok + timestamp. Migration 46.';
