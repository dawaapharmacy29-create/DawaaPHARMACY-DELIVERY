-- ============================================================
-- Migration 14: Add visit_again trip type + rider accounts fixes
-- Safe migration — no DROP, no TRUNCATE, no DELETE
-- ============================================================

-- 1. Add visit_again support note (no schema change needed for text field)
-- The trip_type column is TEXT, so 'visit_again' will work without migration.
-- This comment documents the new valid value.

-- 2. rider_accounts table (if not exists, for compatibility layer)
CREATE TABLE IF NOT EXISTS rider_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES riders(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'rider',
  status TEXT NOT NULL DEFAULT 'active',
  temporary_pin_hash TEXT,
  must_change_pin BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Add username to riders if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'username') THEN
    ALTER TABLE riders ADD COLUMN username TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_riders_username ON riders(username) WHERE username IS NOT NULL;
  END IF;
END $$;

-- 4. Add branch_name to riders if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'branch_name') THEN
    ALTER TABLE riders ADD COLUMN branch_name TEXT;
  END IF;
END $$;

-- 5. Add pin fields to riders if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'pin') THEN
    ALTER TABLE riders ADD COLUMN pin TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'pin_enabled') THEN
    ALTER TABLE riders ADD COLUMN pin_enabled BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'pin_changed_at') THEN
    ALTER TABLE riders ADD COLUMN pin_changed_at TIMESTAMPTZ;
  END IF;
END $$;

-- 6. quick_destinations seed (safe)
INSERT INTO quick_destinations (quick_code, name, destination_type, active)
VALUES 
  ('1', 'مخزن المعداوي', 'warehouse', true),
  ('2', 'مخزن الحياة', 'warehouse', true),
  ('3', 'مخزن سونيستا', 'warehouse', true),
  ('4', 'مخزن الهاشم', 'warehouse', true),
  ('5', 'فرع شكري', 'branch', true),
  ('6', 'فرع الشامي', 'branch', true),
  ('7', 'فرع أبو العزم', 'branch', true)
ON CONFLICT (quick_code) DO NOTHING;

-- 7. Indexes (safe)
CREATE INDEX IF NOT EXISTS idx_rider_accounts_rider_id ON rider_accounts(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_accounts_username ON rider_accounts(username);
CREATE INDEX IF NOT EXISTS idx_rider_accounts_status ON rider_accounts(status);

-- 8. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
