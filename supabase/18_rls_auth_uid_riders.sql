-- ============================================================
-- Migration 18 FIXED: Safe RLS for current Rider PIN login system
-- Current app uses rider_accounts.username + pin_plain, NOT auth.users.
-- Safe to run repeatedly. Does not require attendance/delivery_orders/internal_trips to exist.
-- No DROP TABLE, no DELETE, no TRUNCATE.
-- ============================================================

ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Riders can read own profile" ON public.riders;
DROP POLICY IF EXISTS "Rider reads own record" ON public.riders;
DROP POLICY IF EXISTS "Rider updates own record" ON public.riders;
DROP POLICY IF EXISTS "riders_anon_read" ON public.riders;
DROP POLICY IF EXISTS "riders_anon_update" ON public.riders;
DROP POLICY IF EXISTS "riders_authenticated_all" ON public.riders;

CREATE POLICY "riders_anon_read"
ON public.riders
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "riders_anon_update"
ON public.riders
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

ALTER TABLE public.rider_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rider_accounts_authenticated_all" ON public.rider_accounts;
DROP POLICY IF EXISTS "rider_accounts_anon_read" ON public.rider_accounts;
DROP POLICY IF EXISTS "rider_accounts_anon_update" ON public.rider_accounts;

CREATE POLICY "rider_accounts_anon_read"
ON public.rider_accounts
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "rider_accounts_anon_update"
ON public.rider_accounts
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DO $$
BEGIN
  IF to_regclass('public.attendance') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "attendance_anon_all" ON public.attendance';
    EXECUTE 'CREATE POLICY "attendance_anon_all" ON public.attendance FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF to_regclass('public.delivery_orders') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "delivery_orders_anon_all" ON public.delivery_orders';
    EXECUTE 'CREATE POLICY "delivery_orders_anon_all" ON public.delivery_orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF to_regclass('public.internal_trips') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.internal_trips ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "internal_trips_anon_all" ON public.internal_trips';
    EXECUTE 'CREATE POLICY "internal_trips_anon_all" ON public.internal_trips FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF to_regclass('public.trips') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "trips_anon_all" ON public.trips';
    EXECUTE 'CREATE POLICY "trips_anon_all" ON public.trips FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF to_regclass('public.rider_schedules') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.rider_schedules ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "rider_schedules_anon_all" ON public.rider_schedules';
    EXECUTE 'CREATE POLICY "rider_schedules_anon_all" ON public.rider_schedules FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF to_regclass('public.customers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "customers_anon_select" ON public.customers';
    EXECUTE 'CREATE POLICY "customers_anon_select" ON public.customers FOR SELECT TO anon, authenticated USING (true)';
  END IF;

  IF to_regclass('public.branches') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "branches_anon_select" ON public.branches';
    EXECUTE 'CREATE POLICY "branches_anon_select" ON public.branches FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.rider_pin_login(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.rider_pin_login(TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
