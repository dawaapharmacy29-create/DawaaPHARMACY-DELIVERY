-- ================================================================
-- Migration 16: Complete riders table columns
-- Safe: ADD COLUMN IF NOT EXISTS for all columns used in code
-- ================================================================

-- Add all columns used in the codebase to riders table
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS profile_id UUID;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'junior' CHECK (level IN ('junior', 'mid', 'senior'));
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC DEFAULT 0;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS daily_rate NUMERIC DEFAULT 0;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS salary_type TEXT DEFAULT 'hourly' CHECK (salary_type IN ('hourly', 'daily', 'monthly'));
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC DEFAULT 0;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full-time' CHECK (employment_type IN ('full-time', 'part-time', 'contract'));
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS order_rate NUMERIC DEFAULT 0;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS trip_rate NUMERIC DEFAULT 0;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS monthly_incentive_base NUMERIC DEFAULT 0;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS quarterly_incentive_base NUMERIC DEFAULT 0;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS shift_start TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS shift_end TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS weekly_day_off TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended'));
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN DEFAULT TRUE;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS device_token TEXT;

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_riders_username ON public.riders(username);
CREATE INDEX IF NOT EXISTS idx_riders_status ON public.riders(status);
CREATE INDEX IF NOT EXISTS idx_riders_branch_id ON public.riders(branch_id);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Done ✅
