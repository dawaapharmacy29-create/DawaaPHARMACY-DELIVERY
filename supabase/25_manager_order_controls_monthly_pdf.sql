-- ============================================================
-- Migration 25: Manager controls + monthly audit/report fields
-- Purpose:
-- 1) Soft-delete orders without losing the audit trail.
-- 2) Restore deleted orders.
-- 3) Reassign orders to another rider with a required reason.
-- 4) Support end-of-cycle PDF/print report from the admin reconciliation page.
-- Safe: no DROP TABLE, no DELETE, no TRUNCATE.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Delivery orders audit columns
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS deleted_by_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS restored_by UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS restored_by_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS restore_reason TEXT;

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassigned_from_rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassigned_to_rider_id UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassignment_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassigned_by UUID;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassigned_by_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS reassigned_at TIMESTAMPTZ;

ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS is_countable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS final_count_status TEXT DEFAULT 'pending_reconciliation';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS count_exclusion_reason TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_delivery_orders_deleted_at ON public.delivery_orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_reassigned_to ON public.delivery_orders(reassigned_to_rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_final_count_status ON public.delivery_orders(final_count_status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_delivery_date ON public.delivery_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_rider_period ON public.delivery_orders(rider_id, delivery_date);

-- Optional monthly audit log for future admin actions. The current UI writes directly to delivery_orders,
-- but this table gives us a clean place to store detailed admin actions later.
CREATE TABLE IF NOT EXISTS public.delivery_order_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id UUID,
  action_type TEXT NOT NULL,
  action_reason TEXT,
  old_rider_id UUID,
  new_rider_id UUID,
  performed_by UUID,
  performed_by_name TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_order_audit_order ON public.delivery_order_audit_log(delivery_order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_order_audit_action ON public.delivery_order_audit_log(action_type);

ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_order_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_orders_public_all" ON public.delivery_orders;
CREATE POLICY "delivery_orders_public_all"
ON public.delivery_orders
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_order_audit_log_public_all" ON public.delivery_order_audit_log;
CREATE POLICY "delivery_order_audit_log_public_all"
ON public.delivery_order_audit_log
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
