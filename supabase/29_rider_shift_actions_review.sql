-- ============================================================
-- Migration 29: Rider shift actions / notices / deductions / rewards
-- الهدف: تسجيل لفت نظر أو طلب خصم أو طلب مكافأة من دكتور الشيفت
--        ويظل تحت مراجعة المدير العام قبل أن يصبح نهائيًا.
-- Safe: no DROP tables, no DELETE, no TRUNCATE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.rider_shift_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,

  action_type TEXT NOT NULL DEFAULT 'notice',
  severity TEXT NOT NULL DEFAULT 'medium',

  incident_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shift_date DATE DEFAULT CURRENT_DATE,
  cycle_start DATE,
  cycle_end DATE,

  summary TEXT NOT NULL,
  requested_amount NUMERIC DEFAULT 0,

  requested_by_auth_user_id UUID,
  requested_by_profile_id UUID,
  requested_by_name TEXT,
  requested_by_role TEXT,

  review_status TEXT NOT NULL DEFAULT 'pending_general_manager',
  final_action_type TEXT DEFAULT 'none',
  final_amount NUMERIC DEFAULT 0,
  general_manager_note TEXT,
  reviewed_by_auth_user_id UUID,
  reviewed_by_profile_id UUID,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'open',
  created_source TEXT DEFAULT 'admin_panel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'notice';
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS incident_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS cycle_start DATE;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS cycle_end DATE;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_amount NUMERIC DEFAULT 0;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_by_auth_user_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_by_profile_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_by_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_by_role TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending_general_manager';
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS final_action_type TEXT DEFAULT 'none';
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS final_amount NUMERIC DEFAULT 0;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS general_manager_note TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS reviewed_by_auth_user_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS reviewed_by_profile_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS created_source TEXT DEFAULT 'admin_panel';
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Optional foreign keys if tables exist and constraints are missing
DO $$
BEGIN
  IF to_regclass('public.riders') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rider_shift_actions_rider_id_fkey') THEN
      ALTER TABLE public.rider_shift_actions
      ADD CONSTRAINT rider_shift_actions_rider_id_fkey
      FOREIGN KEY (rider_id) REFERENCES public.riders(id) ON DELETE SET NULL;
    END IF;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_rider_id ON public.rider_shift_actions(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_branch_id ON public.rider_shift_actions(branch_id);
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_shift_date ON public.rider_shift_actions(shift_date);
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_cycle ON public.rider_shift_actions(cycle_start, cycle_end);
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_review_status ON public.rider_shift_actions(review_status);
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_action_type ON public.rider_shift_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_requested_by ON public.rider_shift_actions(requested_by_name);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_rider_shift_actions_updated_at') THEN
    CREATE TRIGGER set_rider_shift_actions_updated_at
      BEFORE UPDATE ON public.rider_shift_actions
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.rider_shift_actions ENABLE ROW LEVEL SECURITY;

-- لأن النظام الحالي يستخدم PIN/localStorage للدليفري والإدارة تستخدم Supabase Auth،
-- نفتح القراءة/الكتابة للتطبيق مؤقتًا مع الاحتفاظ بكل أثر مراجعة داخل الجدول.
DROP POLICY IF EXISTS "rider_shift_actions_public_all" ON public.rider_shift_actions;
CREATE POLICY "rider_shift_actions_public_all"
ON public.rider_shift_actions
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE OR REPLACE VIEW public.rider_shift_actions_monthly_summary AS
SELECT
  cycle_start,
  cycle_end,
  rider_id,
  COALESCE(rider_name, 'غير محدد') AS rider_name,
  COALESCE(branch_name, 'غير محدد') AS branch_name,
  COUNT(*) AS total_actions,
  COUNT(*) FILTER (WHERE action_type = 'notice') AS notice_count,
  COUNT(*) FILTER (WHERE action_type = 'deduction_request') AS deduction_requests,
  COUNT(*) FILTER (WHERE action_type = 'reward_request') AS reward_requests,
  COUNT(*) FILTER (WHERE review_status = 'pending_general_manager') AS pending_review,
  COUNT(*) FILTER (WHERE review_status = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE review_status = 'rejected') AS rejected_count,
  COALESCE(SUM(final_amount) FILTER (WHERE review_status = 'approved' AND final_action_type = 'deduction'), 0) AS approved_deductions_amount,
  COALESCE(SUM(final_amount) FILTER (WHERE review_status = 'approved' AND final_action_type = 'reward'), 0) AS approved_rewards_amount
FROM public.rider_shift_actions
GROUP BY cycle_start, cycle_end, rider_id, COALESCE(rider_name, 'غير محدد'), COALESCE(branch_name, 'غير محدد');

NOTIFY pgrst, 'reload schema';
