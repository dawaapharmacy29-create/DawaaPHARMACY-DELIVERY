-- ============================================================
-- SQL 48: Stability, offline sync logs, dashboard support
-- Safe: no delete, no truncate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Offline sync audit
CREATE TABLE IF NOT EXISTS public.offline_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id TEXT,
  table_name TEXT,
  action TEXT,
  label TEXT,
  payload_json JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'synced',
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offline_sync_logs_time ON public.offline_sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offline_sync_logs_table ON public.offline_sync_logs(table_name, created_at DESC);

-- Columns used by offline queue in app
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS offline_created_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS offline_sync_status TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS offline_created_at TIMESTAMPTZ;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS offline_sync_status TEXT;

-- Dispatch fields
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatch_battery_percent INT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatch_online BOOLEAN;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatch_device_snapshot JSONB DEFAULT '{}'::jsonb;

UPDATE public.delivery_orders
SET dispatched_at = COALESCE(dispatched_at, registered_at, created_at),
    dispatch_status = COALESCE(dispatch_status, 'dispatched')
WHERE dispatched_at IS NULL;

-- Device status table if not already installed
CREATE TABLE IF NOT EXISTS public.rider_device_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL UNIQUE,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  battery_level NUMERIC,
  battery_percent INT,
  is_charging BOOLEAN,
  battery_supported BOOLEAN DEFAULT FALSE,
  online BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ DEFAULT NOW(),
  device_user_agent TEXT,
  platform TEXT,
  warning_level TEXT DEFAULT 'safe',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rider_device_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  event_type TEXT NOT NULL,
  battery_percent INT,
  is_charging BOOLEAN,
  online BOOLEAN,
  warning_level TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_device_status_branch ON public.rider_device_status(branch_id);
CREATE INDEX IF NOT EXISTS idx_rider_device_status_seen ON public.rider_device_status(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_device_events_rider_time ON public.rider_device_events(rider_id, created_at DESC);

-- Operations dashboard view: today rider summary
CREATE OR REPLACE VIEW public.today_rider_operations_view AS
SELECT
  r.id AS rider_id,
  r.name AS rider_name,
  r.branch_id,
  COALESCE(b.display_name, b.name, r.branch_name) AS branch_name,
  COALESCE(o.orders_today, 0) AS orders_today,
  COALESCE(o.delivered_today, 0) AS delivered_today,
  COALESCE(o.failed_today, 0) AS failed_today,
  COALESCE(t.trips_today, 0) AS trips_today,
  ds.battery_percent,
  ds.is_charging,
  ds.battery_supported,
  ds.online,
  ds.warning_level,
  ds.last_seen_at,
  ds.last_sync_at
FROM public.riders r
LEFT JOIN public.branches b ON b.id = r.branch_id
LEFT JOIN (
  SELECT rider_id,
    COUNT(*)::INT AS orders_today,
    COUNT(*) FILTER (WHERE status = 'delivered')::INT AS delivered_today,
    COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed_today
  FROM public.delivery_orders
  WHERE delivery_date = CURRENT_DATE
    AND deleted_at IS NULL
  GROUP BY rider_id
) o ON o.rider_id = r.id
LEFT JOIN (
  SELECT rider_id, COUNT(*)::INT AS trips_today
  FROM public.internal_trips
  WHERE trip_date = CURRENT_DATE
  GROUP BY rider_id
) t ON t.rider_id = r.id
LEFT JOIN public.rider_device_status ds ON ds.rider_id = r.id;

GRANT SELECT, INSERT ON public.offline_sync_logs TO anon, authenticated;
GRANT SELECT ON public.today_rider_operations_view TO anon, authenticated;

ALTER TABLE public.offline_sync_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_sync_logs' AND policyname='offline_sync_logs_open_select'
  ) THEN
    CREATE POLICY offline_sync_logs_open_select ON public.offline_sync_logs FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_sync_logs' AND policyname='offline_sync_logs_open_insert'
  ) THEN
    CREATE POLICY offline_sync_logs_open_insert ON public.offline_sync_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
