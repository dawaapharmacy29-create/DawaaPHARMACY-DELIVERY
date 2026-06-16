-- Add PIN column to riders table for 4-digit PIN login
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'pin'
  ) THEN
    ALTER TABLE riders ADD COLUMN pin TEXT UNIQUE;
  END IF;
END $$;

-- Add index for PIN lookups
CREATE INDEX IF NOT EXISTS idx_riders_pin ON riders(pin) WHERE pin IS NOT NULL;

-- Add PIN enabled flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'pin_enabled'
  ) THEN
    ALTER TABLE riders ADD COLUMN pin_enabled BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add PIN last changed timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'riders' AND column_name = 'pin_changed_at'
  ) THEN
    ALTER TABLE riders ADD COLUMN pin_changed_at TIMESTAMPTZ;
  END IF;
END $$;

COMMENT ON COLUMN riders.pin IS '4-digit PIN for rider login (hashed)';
COMMENT ON COLUMN riders.pin_enabled IS 'Whether PIN login is enabled for this rider';
COMMENT ON COLUMN riders.pin_changed_at IS 'Timestamp when PIN was last changed';
