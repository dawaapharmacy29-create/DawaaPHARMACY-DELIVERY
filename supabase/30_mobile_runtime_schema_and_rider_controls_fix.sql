-- ============================================================
-- Migration 30: Mobile runtime schema + rider admin controls fix
-- Safe: no DROP tables, no DELETE, no TRUNCATE
-- Purpose:
-- 1) Prevent order save failures from missing receipt/OCR columns.
-- 2) Keep old orders safe; no records are deleted.
-- 3) Prepare manager review, transfer/delete/restore, notifications and policy tables.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────
-- delivery_orders: all fields used by rider app, reconciliation, OCR and audit
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_code_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_address_snapshot TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS manual_customer BOOLEAN DEFAULT false;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS delivery_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_value NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'registered';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS failed_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'rider_app';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS created_source TEXT DEFAULT 'rider_app';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_duplicate_invoice BOOLEAN DEFAULT false;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_warning BOOLEAN DEFAULT false;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_note TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS original_order_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_review_status TEXT DEFAULT 'not_required';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_reviewed_by TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS preparing_doctor_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_multiplier_order BOOLEAN DEFAULT false;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_multiplier NUMERIC DEFAULT 1;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_rate NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS order_earning NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS multiplier_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS bconnect_match_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS bconnect_invoice_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS matched_amount NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reconciliation_notes TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_countable BOOLEAN DEFAULT false;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS final_count_status TEXT DEFAULT 'pending_reconciliation';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS count_exclusion_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS delete_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS restored_by TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS restore_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS transferred_from_rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS transferred_from_rider_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS transferred_to_rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS transferred_to_rider_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS transfer_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS transferred_by TEXT;

-- receipt image + OCR fields
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_image_path TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_image_url TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_file_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_file_size BIGINT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_mime_type TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_status TEXT DEFAULT 'not_uploaded';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_note TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_json JSONB;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_ocr_confidence NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_invoice_no TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_code TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_customer_phone TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_address TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_extracted_doctor_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS receipt_review_status TEXT DEFAULT 'not_required';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.delivery_orders ALTER COLUMN customer_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider_id ON public.delivery_orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_delivery_date ON public.delivery_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_number ON public.delivery_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON public.delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_review_status ON public.delivery_orders(review_status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_count_status ON public.delivery_orders(final_count_status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_deleted ON public.delivery_orders(is_deleted);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_receipt_ocr_status ON public.delivery_orders(receipt_ocr_status);

-- Fill required fields safely before insert/update.
CREATE OR REPLACE FUNCTION public.delivery_orders_runtime_defaults()
RETURNS TRIGGER AS $$
BEGIN
  NEW.customer_name := COALESCE(NULLIF(NEW.customer_name, ''), NULLIF(NEW.customer_name_snapshot, ''), 'عميل غير مسجل');
  NEW.customer_code := COALESCE(NULLIF(NEW.customer_code, ''), NULLIF(NEW.customer_code_snapshot, ''));
  NEW.customer_phone := COALESCE(NULLIF(NEW.customer_phone, ''), NULLIF(NEW.customer_phone_snapshot, ''));
  NEW.customer_address := COALESCE(NULLIF(NEW.customer_address, ''), NULLIF(NEW.customer_address_snapshot, ''));
  NEW.invoice_number := COALESCE(NULLIF(NEW.invoice_number, ''), NULLIF(NEW.invoice_no, ''));
  NEW.invoice_no := COALESCE(NULLIF(NEW.invoice_no, ''), NULLIF(NEW.invoice_number, ''));
  NEW.updated_at := now();
  IF NEW.status = 'failed' THEN
    NEW.is_countable := false;
    NEW.final_count_status := 'excluded_failed';
    NEW.count_exclusion_reason := COALESCE(NEW.count_exclusion_reason, 'failed_order');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_orders_runtime_defaults ON public.delivery_orders;
CREATE TRIGGER trg_delivery_orders_runtime_defaults
BEFORE INSERT OR UPDATE ON public.delivery_orders
FOR EACH ROW EXECUTE FUNCTION public.delivery_orders_runtime_defaults();

-- ────────────────────────────────────────────────────────────
-- internal_trips proof/audit fields
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.internal_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS trip_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS trip_type TEXT DEFAULT 'other';
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS from_label TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS to_label TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_approval';
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS related_invoice_number TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS has_invoice_reference BOOLEAN DEFAULT false;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS requester_name TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS proof_type TEXT DEFAULT 'invoice';
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS proof_note TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS proof_image_path TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS proof_image_url TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT true;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_internal_trips_rider_id ON public.internal_trips(rider_id);
CREATE INDEX IF NOT EXISTS idx_internal_trips_trip_date ON public.internal_trips(trip_date);
CREATE INDEX IF NOT EXISTS idx_internal_trips_status ON public.internal_trips(status);

-- ────────────────────────────────────────────────────────────
-- rider_schedules used by admin rider schedule modal
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rider_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  day_name TEXT,
  day_name_ar TEXT,
  shift_start TEXT,
  shift_end TEXT,
  start_time TEXT,
  end_time TEXT,
  is_day_off BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS day_name TEXT;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS day_name_ar TEXT;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS shift_start TEXT;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS shift_end TEXT;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS end_time TEXT;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS is_day_off BOOLEAN DEFAULT false;
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.rider_schedules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_rider_schedules_rider_id ON public.rider_schedules(rider_id);

-- ────────────────────────────────────────────────────────────
-- rider shift actions: notice/deduction/reward review workflow
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rider_shift_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  action_type TEXT,
  severity TEXT DEFAULT 'medium',
  incident_at TIMESTAMPTZ DEFAULT now(),
  shift_date DATE DEFAULT CURRENT_DATE,
  summary TEXT,
  requested_amount NUMERIC,
  requested_by_auth_user_id UUID,
  requested_by_name TEXT,
  requested_by_role TEXT,
  review_status TEXT DEFAULT 'pending_general_manager',
  final_decision TEXT,
  final_amount NUMERIC,
  general_manager_note TEXT,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  cycle_start DATE,
  cycle_end DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium';
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS incident_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_amount NUMERIC;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_by_auth_user_id UUID;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_by_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS requested_by_role TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending_general_manager';
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS final_decision TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS final_amount NUMERIC;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS general_manager_note TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS cycle_start DATE;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS cycle_end DATE;
ALTER TABLE public.rider_shift_actions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_rider_id ON public.rider_shift_actions(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_review_status ON public.rider_shift_actions(review_status);
CREATE INDEX IF NOT EXISTS idx_rider_shift_actions_incident_at ON public.rider_shift_actions(incident_at);

-- ────────────────────────────────────────────────────────────
-- notification/policy foundation for next UI stage
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rider_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  notification_type TEXT DEFAULT 'info',
  priority TEXT DEFAULT 'normal',
  read_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rider_notifications_rider_id ON public.rider_notifications(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_notifications_read_at ON public.rider_notifications(read_at);

CREATE TABLE IF NOT EXISTS public.delivery_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  active BOOLEAN DEFAULT true,
  effective_from DATE DEFAULT CURRENT_DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_policies_active ON public.delivery_policies(active);

-- ────────────────────────────────────────────────────────────
-- Summary view: countable 1.0 vs 1.5 vs failed/trips by rider and cycle
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.rider_cycle_audit_summary AS
WITH orders AS (
  SELECT
    rider_id,
    COALESCE(rider_name, 'غير محدد') AS rider_name,
    COUNT(*) FILTER (WHERE COALESCE(is_deleted,false) = false) AS total_orders,
    COUNT(*) FILTER (WHERE COALESCE(is_deleted,false) = false AND status = 'failed') AS failed_orders,
    COUNT(*) FILTER (WHERE COALESCE(is_deleted,false) = false AND COALESCE(is_countable,false) = true AND COALESCE(order_multiplier,1) = 1) AS countable_1_orders,
    COUNT(*) FILTER (WHERE COALESCE(is_deleted,false) = false AND COALESCE(is_countable,false) = true AND COALESCE(order_multiplier,1) > 1) AS countable_15_orders,
    COUNT(*) FILTER (WHERE COALESCE(is_deleted,false) = false AND COALESCE(order_multiplier,1) > 1 AND COALESCE(is_countable,false) = false) AS multiplier_pending_orders,
    COUNT(*) FILTER (WHERE COALESCE(is_deleted,false) = false AND (COALESCE(is_duplicate_invoice,false) OR COALESCE(duplicate_warning,false))) AS duplicate_orders,
    COUNT(*) FILTER (WHERE COALESCE(is_deleted,false) = true) AS deleted_orders
  FROM public.delivery_orders
  GROUP BY rider_id, COALESCE(rider_name, 'غير محدد')
), trips AS (
  SELECT
    rider_id,
    COUNT(*) AS total_trips,
    COUNT(*) FILTER (WHERE status IN ('approved','completed')) AS approved_trips,
    COUNT(*) FILTER (WHERE status IN ('pending','pending_approval')) AS pending_trips
  FROM public.internal_trips
  GROUP BY rider_id
)
SELECT
  o.rider_id,
  o.rider_name,
  o.total_orders,
  o.countable_1_orders,
  o.countable_15_orders,
  o.multiplier_pending_orders,
  o.failed_orders,
  o.duplicate_orders,
  o.deleted_orders,
  COALESCE(t.total_trips,0) AS total_trips,
  COALESCE(t.approved_trips,0) AS approved_trips,
  COALESCE(t.pending_trips,0) AS pending_trips
FROM orders o
LEFT JOIN trips t ON t.rider_id = o.rider_id;

-- ────────────────────────────────────────────────────────────
-- RLS: current app uses PIN/local session, so allow anon/authenticated runtime access.
-- Tighten later when migrating riders to auth.users.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delivery_orders_public_all" ON public.delivery_orders;
CREATE POLICY "delivery_orders_public_all" ON public.delivery_orders
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.internal_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "internal_trips_public_all" ON public.internal_trips;
CREATE POLICY "internal_trips_public_all" ON public.internal_trips
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.rider_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_schedules_public_all" ON public.rider_schedules;
CREATE POLICY "rider_schedules_public_all" ON public.rider_schedules
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.rider_shift_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_shift_actions_public_all" ON public.rider_shift_actions;
CREATE POLICY "rider_shift_actions_public_all" ON public.rider_shift_actions
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.rider_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_notifications_public_all" ON public.rider_notifications;
CREATE POLICY "rider_notifications_public_all" ON public.rider_notifications
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.delivery_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delivery_policies_public_select" ON public.delivery_policies;
CREATE POLICY "delivery_policies_public_select" ON public.delivery_policies
FOR SELECT TO anon, authenticated USING (active = true OR auth.role() = 'authenticated');

-- Storage bucket for receipt/proof images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'delivery-receipts',
  'delivery-receipts',
  TRUE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

NOTIFY pgrst, 'reload schema';
