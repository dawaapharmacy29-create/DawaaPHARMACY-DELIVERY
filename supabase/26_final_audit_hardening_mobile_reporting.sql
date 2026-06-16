-- ============================================================
-- Migration 26: Final audit hardening for delivery control
-- Safe: no DROP tables, no DELETE, no TRUNCATE
-- Purpose:
-- 1) strengthen trip proof fields to reduce fake branch/warehouse trips
-- 2) add order/trip audit fields and summary view for monthly cycle 26-25
-- 3) keep salary calculation out of rider app; report is proof/review only
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───── delivery_orders audit / monthly review fields ─────────
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS final_count_status TEXT DEFAULT 'pending_reconciliation';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_countable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS count_exclusion_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS bconnect_match_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS matched_amount NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reconciliation_notes TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS deleted_by_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS restored_by_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS restore_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassigned_from_rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassigned_to_rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassigned_by_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassigned_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassignment_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS preparing_doctor_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_warning BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS duplicate_review_status TEXT DEFAULT 'not_required';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS manual_customer BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS created_source TEXT DEFAULT 'rider_app';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_value NUMERIC DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS customer_address TEXT;

-- Keep current DB from rejecting manual/unknown customers.
ALTER TABLE public.delivery_orders ALTER COLUMN customer_name DROP NOT NULL;

-- ───── internal_trips proof / anti-fraud fields ──────────────
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS rider_name TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS requested_by_name TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS proof_required BOOLEAN DEFAULT FALSE;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS evidence_type TEXT DEFAULT 'invoice';
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS evidence_note TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS evidence_status TEXT DEFAULT 'pending_admin_review';
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS invoice_photo_uploaded_at TIMESTAMPTZ;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS approved_by_name TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS reviewer_notes TEXT;
ALTER TABLE public.internal_trips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ───── indexes for fast monthly review ───────────────────────
CREATE INDEX IF NOT EXISTS idx_delivery_orders_period_rider ON public.delivery_orders(delivery_date, rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_number ON public.delivery_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_no ON public.delivery_orders(invoice_no);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_final_status ON public.delivery_orders(final_count_status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_countable ON public.delivery_orders(is_countable);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_deleted ON public.delivery_orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_internal_trips_period_rider ON public.internal_trips(trip_date, rider_id);
CREATE INDEX IF NOT EXISTS idx_internal_trips_evidence_status ON public.internal_trips(evidence_status);

-- ───── audit event table: every admin action can be stored later ─────
CREATE TABLE IF NOT EXISTS public.delivery_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action_type TEXT NOT NULL,
  rider_id UUID,
  rider_name TEXT,
  invoice_number TEXT,
  old_values JSONB DEFAULT '{}'::jsonb,
  new_values JSONB DEFAULT '{}'::jsonb,
  reason TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_audit_events_entity ON public.delivery_audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_delivery_audit_events_rider ON public.delivery_audit_events(rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_audit_events_created_at ON public.delivery_audit_events(created_at);

-- ───── monthly audit summary view ────────────────────────────
CREATE OR REPLACE VIEW public.rider_monthly_audit_summary AS
SELECT
  r.id AS rider_id,
  r.name AS rider_name,
  r.username,
  COALESCE(r.branch_name, b.name) AS branch_name,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL) AS registered_orders,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL AND COALESCE(o.is_countable, false) = true AND COALESCE(o.order_multiplier, 1) < 1.5) AS counted_normal_orders,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL AND COALESCE(o.is_countable, false) = true AND COALESCE(o.order_multiplier, 1) >= 1.5) AS counted_multiplier_orders,
  COALESCE(SUM(CASE WHEN o.deleted_at IS NULL AND COALESCE(o.is_countable, false) = true THEN COALESCE(o.order_multiplier, 1) ELSE 0 END), 0) AS counted_order_units,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL AND o.status = 'failed') AS failed_orders,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL AND o.bconnect_match_status = 'invoice_not_found') AS not_found_in_bconnect,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NULL AND COALESCE(o.is_duplicate_invoice, false) = true) AS duplicate_orders,
  COUNT(o.id) FILTER (WHERE o.deleted_at IS NOT NULL) AS deleted_orders,
  COUNT(t.id) FILTER (WHERE t.status = 'approved') AS approved_trips,
  COUNT(t.id) FILTER (WHERE t.status = 'pending_approval') AS pending_trips,
  COUNT(t.id) AS all_trips
FROM public.riders r
LEFT JOIN public.branches b ON b.id = r.branch_id
LEFT JOIN public.delivery_orders o ON o.rider_id = r.id
LEFT JOIN public.internal_trips t ON t.rider_id = r.id
GROUP BY r.id, r.name, r.username, COALESCE(r.branch_name, b.name);

-- ───── RLS policies for current PIN/local-session frontend ───
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_orders_public_all" ON public.delivery_orders;
CREATE POLICY "delivery_orders_public_all"
ON public.delivery_orders
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "internal_trips_public_all" ON public.internal_trips;
CREATE POLICY "internal_trips_public_all"
ON public.internal_trips
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_audit_events_public_all" ON public.delivery_audit_events;
CREATE POLICY "delivery_audit_events_public_all"
ON public.delivery_audit_events
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
