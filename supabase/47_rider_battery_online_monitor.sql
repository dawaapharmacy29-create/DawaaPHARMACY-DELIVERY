-- ============================================================
-- SQL 47: Rider battery / online monitor + anti manipulation device status
-- Safe: no delete, no truncate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE INDEX IF NOT EXISTS idx_rider_device_status_branch ON public.rider_device_status(branch_id);
CREATE INDEX IF NOT EXISTS idx_rider_device_status_seen ON public.rider_device_status(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_device_status_warning ON public.rider_device_status(warning_level);

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatch_battery_percent INT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatch_online BOOLEAN;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatch_device_snapshot JSONB DEFAULT '{}'::jsonb;

UPDATE public.delivery_orders
SET dispatched_at = COALESCE(dispatched_at, registered_at, created_at),
    dispatch_status = COALESCE(dispatch_status, 'dispatched')
WHERE dispatched_at IS NULL;

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

CREATE INDEX IF NOT EXISTS idx_rider_device_events_rider_time ON public.rider_device_events(rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_device_events_type ON public.rider_device_events(event_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_rider_device_event_from_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.warning_level IN ('low','critical')
     AND (OLD.warning_level IS DISTINCT FROM NEW.warning_level OR OLD.battery_percent IS DISTINCT FROM NEW.battery_percent)
  THEN
    INSERT INTO public.rider_device_events (
      rider_id, rider_name, branch_id, branch_name, event_type,
      battery_percent, is_charging, online, warning_level, details
    )
    VALUES (
      NEW.rider_id, NEW.rider_name, NEW.branch_id, NEW.branch_name,
      CASE WHEN NEW.warning_level = 'critical' THEN 'battery_critical' ELSE 'battery_low' END,
      NEW.battery_percent, NEW.is_charging, NEW.online, NEW.warning_level,
      jsonb_build_object('last_seen_at', NEW.last_seen_at, 'platform', NEW.platform)
    );
  END IF;

  IF OLD.online IS DISTINCT FROM NEW.online THEN
    INSERT INTO public.rider_device_events (
      rider_id, rider_name, branch_id, branch_name, event_type,
      battery_percent, is_charging, online, warning_level, details
    )
    VALUES (
      NEW.rider_id, NEW.rider_name, NEW.branch_id, NEW.branch_name,
      CASE WHEN NEW.online THEN 'device_online' ELSE 'device_offline' END,
      NEW.battery_percent, NEW.is_charging, NEW.online, NEW.warning_level,
      jsonb_build_object('last_seen_at', NEW.last_seen_at)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rider_device_status_events ON public.rider_device_status;
CREATE TRIGGER trg_rider_device_status_events
AFTER UPDATE ON public.rider_device_status
FOR EACH ROW
EXECUTE FUNCTION public.log_rider_device_event_from_status();

CREATE OR REPLACE VIEW public.rider_device_status_admin_view AS
SELECT
  ds.*,
  r.name AS rider_table_name,
  COALESCE(b.display_name, b.name, ds.branch_name) AS resolved_branch_name,
  CASE
    WHEN ds.battery_supported IS NOT TRUE THEN 'unsupported'
    WHEN ds.is_charging IS TRUE THEN 'safe'
    WHEN COALESCE(ds.battery_percent, 100) <= 10 THEN 'critical'
    WHEN COALESCE(ds.battery_percent, 100) <= 20 THEN 'low'
    ELSE 'safe'
  END AS calculated_warning_level,
  CASE
    WHEN ds.last_seen_at IS NULL THEN true
    WHEN ds.last_seen_at < NOW() - INTERVAL '15 minutes' THEN true
    ELSE false
  END AS stale
FROM public.rider_device_status ds
LEFT JOIN public.riders r ON r.id = ds.rider_id
LEFT JOIN public.branches b ON b.id = COALESCE(ds.branch_id, r.branch_id);

GRANT SELECT, INSERT, UPDATE ON public.rider_device_status TO anon, authenticated;
GRANT SELECT, INSERT ON public.rider_device_events TO anon, authenticated;
GRANT SELECT ON public.rider_device_status_admin_view TO anon, authenticated;

ALTER TABLE public.rider_device_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_device_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_status' AND policyname='rider_device_status_open_select'
  ) THEN
    CREATE POLICY rider_device_status_open_select ON public.rider_device_status FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_status' AND policyname='rider_device_status_open_insert'
  ) THEN
    CREATE POLICY rider_device_status_open_insert ON public.rider_device_status FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_status' AND policyname='rider_device_status_open_update'
  ) THEN
    CREATE POLICY rider_device_status_open_update ON public.rider_device_status FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_events' AND policyname='rider_device_events_open_select'
  ) THEN
    CREATE POLICY rider_device_events_open_select ON public.rider_device_events FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rider_device_events' AND policyname='rider_device_events_open_insert'
  ) THEN
    CREATE POLICY rider_device_events_open_insert ON public.rider_device_events FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
