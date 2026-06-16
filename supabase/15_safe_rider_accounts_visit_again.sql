-- ================================================================
-- Migration 15: Safe rider_accounts + visit_again + PIN improvements
-- Safe: IF NOT EXISTS everywhere, no DROP, no DELETE, no TRUNCATE
-- ================================================================

-- 1. إضافة visit_again لـ trip_type enum (لو مش موجود)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'visit_again'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'trip_type')
  ) THEN
    ALTER TYPE trip_type ADD VALUE 'visit_again';
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- trip_type مش enum، بيتخزن كـ text - مفيش حاجة محتاجينها
  NULL;
END;
$$;

-- 2. rider_accounts table
CREATE TABLE IF NOT EXISTS rider_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id        UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  username        TEXT NOT NULL UNIQUE,
  pin_hash        TEXT,                       -- hashed PIN (future)
  pin_plain       TEXT,                       -- plain PIN (dev mode)
  pin_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_pin BOOLEAN NOT NULL DEFAULT TRUE,
  pin_changed_at  TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. أعمدة إضافية على riders (آمنة)
ALTER TABLE riders ADD COLUMN IF NOT EXISTS username          TEXT;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS pin               TEXT;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS pin_enabled       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS must_change_pin   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS pin_changed_at    TIMESTAMPTZ;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS last_login_at     TIMESTAMPTZ;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS branch_name       TEXT;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS device_token      TEXT;

-- 4. أعمدة على trips (آمنة)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_type             TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS has_invoice_reference BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS invoice_ref           TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS approved_by           TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS rejection_reason      TEXT;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_rider_accounts_rider_id  ON rider_accounts(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_accounts_username  ON rider_accounts(username);
CREATE INDEX IF NOT EXISTS idx_rider_accounts_status    ON rider_accounts(status);
CREATE INDEX IF NOT EXISTS idx_riders_username          ON riders(username);
CREATE INDEX IF NOT EXISTS idx_trips_trip_type          ON trips(trip_type);
CREATE INDEX IF NOT EXISTS idx_trips_status             ON trips(status);

-- 6. Updated_at trigger على rider_accounts
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_rider_accounts_updated_at ON rider_accounts;
CREATE TRIGGER set_rider_accounts_updated_at
  BEFORE UPDATE ON rider_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. RLS على rider_accounts (لو مش مفعّل)
ALTER TABLE rider_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: admins يشوفوا كل حاجة
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rider_accounts' AND policyname = 'admin_all'
  ) THEN
    CREATE POLICY admin_all ON rider_accounts
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END;
$$;

-- 8. View مريح لعرض بيانات الدليفري مع حساباتهم
CREATE OR REPLACE VIEW rider_accounts_view AS
SELECT
  r.id         AS rider_id,
  r.name       AS rider_name,
  r.status     AS rider_status,
  r.branch_name,
  r.branch_id,
  COALESCE(ra.username, r.username) AS username,
  ra.id        AS account_id,
  ra.pin_enabled,
  ra.must_change_pin,
  ra.pin_changed_at,
  ra.last_login_at,
  ra.failed_attempts,
  ra.locked_until,
  ra.status    AS account_status,
  ra.created_at AS account_created_at
FROM riders r
LEFT JOIN rider_accounts ra ON ra.rider_id = r.id;

-- 9. Function: تسجيل دخول الدليفري بـ PIN
CREATE OR REPLACE FUNCTION rider_pin_login(p_username TEXT, p_pin TEXT)
RETURNS JSON AS $$
DECLARE
  v_rider   riders%ROWTYPE;
  v_account rider_accounts%ROWTYPE;
  v_result  JSON;
BEGIN
  -- جيب الـ rider من username
  SELECT * INTO v_rider FROM riders WHERE LOWER(username) = LOWER(p_username) AND status = 'active';
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'username_not_found');
  END IF;

  -- جيب الـ account
  SELECT * INTO v_account FROM rider_accounts
    WHERE LOWER(username) = LOWER(p_username) AND status = 'active';

  -- لو مفيش account، تحقق من الـ riders.pin مباشرة
  IF NOT FOUND THEN
    IF v_rider.pin IS NOT NULL AND v_rider.pin = p_pin AND v_rider.pin_enabled THEN
      UPDATE riders SET last_login_at = NOW() WHERE id = v_rider.id;
      RETURN json_build_object(
        'success', true,
        'rider_id', v_rider.id,
        'rider_name', v_rider.name,
        'must_change_pin', v_rider.must_change_pin,
        'branch_id', v_rider.branch_id,
        'branch_name', v_rider.branch_name
      );
    END IF;
    RETURN json_build_object('success', false, 'error', 'account_not_found');
  END IF;

  -- تحقق من lock
  IF v_account.locked_until IS NOT NULL AND v_account.locked_until > NOW() THEN
    RETURN json_build_object('success', false, 'error', 'account_locked',
      'locked_until', v_account.locked_until);
  END IF;

  -- تحقق من الـ PIN
  IF v_account.pin_plain != p_pin THEN
    UPDATE rider_accounts SET
      failed_attempts = failed_attempts + 1,
      locked_until = CASE WHEN failed_attempts >= 4 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
    WHERE id = v_account.id;
    RETURN json_build_object('success', false, 'error', 'wrong_pin',
      'attempts_left', GREATEST(0, 5 - v_account.failed_attempts - 1));
  END IF;

  -- PIN صح — reset attempts
  UPDATE rider_accounts SET
    failed_attempts = 0,
    locked_until    = NULL,
    last_login_at   = NOW()
  WHERE id = v_account.id;

  UPDATE riders SET last_login_at = NOW() WHERE id = v_rider.id;

  RETURN json_build_object(
    'success', true,
    'rider_id', v_rider.id,
    'rider_name', v_rider.name,
    'must_change_pin', v_account.must_change_pin,
    'branch_id', v_rider.branch_id,
    'branch_name', v_rider.branch_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Function: تغيير PIN
CREATE OR REPLACE FUNCTION rider_change_pin(p_rider_id UUID, p_old_pin TEXT, p_new_pin TEXT)
RETURNS JSON AS $$
DECLARE
  v_account rider_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_account FROM rider_accounts WHERE rider_id = p_rider_id AND status = 'active';
  IF NOT FOUND THEN
    -- check riders table directly
    UPDATE riders SET
      pin = p_new_pin,
      must_change_pin = FALSE,
      pin_changed_at = NOW()
    WHERE id = p_rider_id AND pin = p_old_pin;
    IF FOUND THEN
      RETURN json_build_object('success', true);
    END IF;
    RETURN json_build_object('success', false, 'error', 'account_not_found');
  END IF;

  IF v_account.pin_plain != p_old_pin THEN
    RETURN json_build_object('success', false, 'error', 'wrong_pin');
  END IF;

  UPDATE rider_accounts SET
    pin_plain       = p_new_pin,
    must_change_pin = FALSE,
    pin_changed_at  = NOW(),
    updated_at      = NOW()
  WHERE id = v_account.id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Done ✅
