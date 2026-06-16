-- ══════════════════════════════════════════════════════════════════
-- Migration: GPS Geofence & Order Timers Support
-- ══════════════════════════════════════════════════════════════════

-- 1. أضف حقول GPS لتسجيل موقع التسليم في delivery_orders
DO $$
BEGIN
  -- موقع التسليم الفعلي
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'delivery_lat') THEN
    ALTER TABLE delivery_orders ADD COLUMN delivery_lat DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'delivery_lng') THEN
    ALTER TABLE delivery_orders ADD COLUMN delivery_lng DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'gps_accuracy_m') THEN
    ALTER TABLE delivery_orders ADD COLUMN gps_accuracy_m DOUBLE PRECISION;
  END IF;
  -- تايمر الأوردر
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'departed_at') THEN
    ALTER TABLE delivery_orders ADD COLUMN departed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'returned_at') THEN
    ALTER TABLE delivery_orders ADD COLUMN returned_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_orders' AND column_name = 'trip_duration_minutes') THEN
    ALTER TABLE delivery_orders ADD COLUMN trip_duration_minutes INTEGER;
  END IF;
END $$;

COMMENT ON COLUMN delivery_orders.delivery_lat IS 'GPS latitude at delivery point';
COMMENT ON COLUMN delivery_orders.delivery_lng IS 'GPS longitude at delivery point';
COMMENT ON COLUMN delivery_orders.gps_accuracy_m IS 'GPS accuracy in meters at delivery';
COMMENT ON COLUMN delivery_orders.departed_at IS 'When rider left pharmacy geofence';
COMMENT ON COLUMN delivery_orders.returned_at IS 'When rider returned to pharmacy geofence';
COMMENT ON COLUMN delivery_orders.trip_duration_minutes IS 'Total trip duration in minutes';

-- 2. جدول إعدادات الـ Geofence للفروع
CREATE TABLE IF NOT EXISTS branch_geofence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 150,
  address_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (branch_id)
);

COMMENT ON TABLE branch_geofence IS 'GPS geofence config per branch for rider tracking';

-- RLS for branch_geofence
ALTER TABLE branch_geofence ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "branch_geofence_read_all" ON branch_geofence FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "branch_geofence_admin_write" ON branch_geofence FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE auth_user_id = auth.uid() AND role IN ('admin', 'shift_manager'))
);

-- 3. جدول تسجيل أحداث الـ GPS (مفيد للأدمن لمراجعة مسارات المندوبين)
CREATE TABLE IF NOT EXISTS rider_gps_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES riders(id) ON DELETE CASCADE,
  branch_id UUID,
  event_type TEXT NOT NULL, -- 'enter' | 'exit'
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  order_id UUID REFERENCES delivery_orders(id) ON DELETE SET NULL,
  event_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_gps_rider ON rider_gps_events(rider_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_gps_order ON rider_gps_events(order_id);

COMMENT ON TABLE rider_gps_events IS 'GPS enter/exit events for rider geofence tracking';

ALTER TABLE rider_gps_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "gps_events_rider_own" ON rider_gps_events FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "gps_events_admin_read" ON rider_gps_events FOR SELECT USING (true);
