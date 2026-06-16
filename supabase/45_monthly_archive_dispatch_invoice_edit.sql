-- ============================================================
-- SQL 45: Monthly invoice archive + dispatch time + branch manager invoice edit
-- Safe: no delete, no truncate
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) وقت خروج الأوردر وسجل تعديل رقم الفاتورة
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'pending';
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_number_original TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_edit_count INT DEFAULT 0;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_edited_at TIMESTAMPTZ;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_edited_by_name TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS invoice_edit_reason TEXT;

UPDATE public.delivery_orders
SET dispatched_at = COALESCE(dispatched_at, registered_at, created_at),
    dispatch_status = COALESCE(dispatch_status, 'dispatched')
WHERE dispatched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_dispatched_at ON public.delivery_orders(dispatched_at);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice_dispatch ON public.delivery_orders(invoice_number, dispatched_at);

CREATE TABLE IF NOT EXISTS public.delivery_order_invoice_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  old_invoice_number TEXT,
  new_invoice_number TEXT NOT NULL,
  edited_by UUID,
  edited_by_name TEXT,
  reason TEXT NOT NULL,
  branch_id UUID,
  branch_name TEXT,
  rider_id UUID,
  rider_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_edit_history_order ON public.delivery_order_invoice_edit_history(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_edit_history_invoice ON public.delivery_order_invoice_edit_history(new_invoice_number);

CREATE OR REPLACE FUNCTION public.branch_manager_update_order_invoice(
  p_order_id UUID,
  p_new_invoice_number TEXT,
  p_reason TEXT,
  p_actor_name TEXT DEFAULT 'مدير الفرع'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_new TEXT;
BEGIN
  v_new := regexp_replace(trim(coalesce(p_new_invoice_number, '')), '\s+', '', 'g');

  IF v_new = '' THEN
    RETURN json_build_object('success', false, 'error', 'missing_invoice', 'message', 'رقم الفاتورة الجديد مطلوب');
  END IF;

  IF trim(coalesce(p_reason, '')) = '' OR length(trim(p_reason)) < 5 THEN
    RETURN json_build_object('success', false, 'error', 'missing_reason', 'message', 'يجب كتابة سبب واضح لتعديل رقم الفاتورة');
  END IF;

  SELECT * INTO v_order
  FROM public.delivery_orders
  WHERE id = p_order_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'order_not_found', 'message', 'الأوردر غير موجود');
  END IF;

  INSERT INTO public.delivery_order_invoice_edit_history (
    order_id, old_invoice_number, new_invoice_number, edited_by, edited_by_name, reason,
    branch_id, branch_name, rider_id, rider_name
  )
  VALUES (
    p_order_id,
    COALESCE(v_order.invoice_number, v_order.invoice_no),
    v_new,
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), 'مدير الفرع'),
    trim(p_reason),
    v_order.branch_id,
    v_order.branch_name,
    v_order.rider_id,
    v_order.rider_name
  );

  UPDATE public.delivery_orders
  SET
    invoice_number_original = COALESCE(invoice_number_original, invoice_number, invoice_no),
    invoice_number = v_new,
    invoice_no = v_new,
    invoice_edit_count = COALESCE(invoice_edit_count, 0) + 1,
    invoice_edited_at = NOW(),
    invoice_edited_by_name = COALESCE(NULLIF(p_actor_name, ''), 'مدير الفرع'),
    invoice_edit_reason = trim(p_reason),
    bconnect_match_status = 'pending',
    final_count_status = 'pending_reconciliation',
    is_countable = false,
    needs_review = true,
    review_status = 'invoice_edited_by_branch_manager',
    updated_at = NOW()
  WHERE id = p_order_id;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_rider_notification') THEN
    PERFORM public.create_rider_notification(
      v_order.rider_id,
      'تم تعديل رقم فاتورة',
      'تم تعديل رقم الفاتورة من ' || COALESCE(v_order.invoice_number, v_order.invoice_no, 'غير محدد') || ' إلى ' || v_new || ' بواسطة مدير الفرع. السبب: ' || trim(p_reason),
      'invoice_edit',
      'warning',
      'delivery_orders',
      p_order_id,
      jsonb_build_object('old_invoice', COALESCE(v_order.invoice_number, v_order.invoice_no), 'new_invoice', v_new, 'reason', trim(p_reason))
    );
  END IF;

  RETURN json_build_object('success', true, 'order_id', p_order_id, 'old_invoice', COALESCE(v_order.invoice_number, v_order.invoice_no), 'new_invoice', v_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.branch_manager_update_order_invoice(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 2) أرشيف شهري دائم لملفات السيستم والمطابقة
CREATE TABLE IF NOT EXISTS public.monthly_invoice_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  file_name TEXT,
  total_rows INT DEFAULT 0,
  delivery_rows INT DEFAULT 0,
  uploaded_by UUID,
  uploaded_by_name TEXT,
  status TEXT DEFAULT 'uploaded',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  matched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_monthly_batches_period ON public.monthly_invoice_import_batches(period_start, period_end, created_at DESC);

CREATE TABLE IF NOT EXISTS public.monthly_system_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.monthly_invoice_import_batches(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_type TEXT,
  branch_name TEXT,
  normalized_branch_name TEXT,
  customer_code TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  delivery_address TEXT,
  invoice_date_text TEXT,
  gross_total NUMERIC DEFAULT 0,
  net_total NUMERIC DEFAULT 0,
  system_user TEXT,
  close_time_text TEXT,
  raw_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_system_invoices_batch_invoice ON public.monthly_system_invoices(batch_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_monthly_system_invoices_invoice ON public.monthly_system_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_monthly_system_invoices_period ON public.monthly_system_invoices(period_start, period_end);

CREATE TABLE IF NOT EXISTS public.monthly_invoice_reconciliation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.monthly_invoice_import_batches(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  invoice_number TEXT,
  rider_id UUID,
  rider_name TEXT,
  app_order_id UUID,
  match_status TEXT NOT NULL,
  difference_reason TEXT,
  app_amount NUMERIC,
  system_amount NUMERIC,
  app_customer_code TEXT,
  system_customer_code TEXT,
  app_customer_name TEXT,
  system_customer_name TEXT,
  app_branch_name TEXT,
  system_branch_name TEXT,
  is_countable BOOLEAN DEFAULT false,
  needs_review BOOLEAN DEFAULT true,
  approved_by UUID,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  raw_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_recon_batch ON public.monthly_invoice_reconciliation_results(batch_id);
CREATE INDEX IF NOT EXISTS idx_monthly_recon_invoice ON public.monthly_invoice_reconciliation_results(invoice_number);
CREATE INDEX IF NOT EXISTS idx_monthly_recon_rider ON public.monthly_invoice_reconciliation_results(rider_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_monthly_recon_status ON public.monthly_invoice_reconciliation_results(match_status);

CREATE TABLE IF NOT EXISTS public.monthly_rider_performance_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.monthly_invoice_import_batches(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rider_id UUID,
  rider_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  app_orders_count INT DEFAULT 0,
  matched_count INT DEFAULT 0,
  app_only_count INT DEFAULT 0,
  system_only_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  duplicate_count INT DEFAULT 0,
  multiplier_count INT DEFAULT 0,
  trips_count INT DEFAULT 0,
  deductions_amount NUMERIC DEFAULT 0,
  rewards_amount NUMERIC DEFAULT 0,
  final_countable_orders INT DEFAULT 0,
  final_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(batch_id, rider_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_rider_archive_period ON public.monthly_rider_performance_archive(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_monthly_rider_archive_rider ON public.monthly_rider_performance_archive(rider_id, period_start, period_end);

CREATE OR REPLACE FUNCTION public.save_monthly_invoice_import_batch(
  p_period_start DATE,
  p_period_end DATE,
  p_file_name TEXT,
  p_total_rows INT,
  p_delivery_rows INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.monthly_invoice_import_batches (
    period_start, period_end, file_name, total_rows, delivery_rows, uploaded_by, uploaded_by_name, status
  )
  VALUES (
    p_period_start, p_period_end, p_file_name, COALESCE(p_total_rows,0), COALESCE(p_delivery_rows,0),
    auth.uid(), COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'مدير النظام'), 'uploaded'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_monthly_invoice_import_batch(DATE, DATE, TEXT, INT, INT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.archive_monthly_rider_performance(
  p_batch_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.monthly_rider_performance_archive (
    batch_id, period_start, period_end, rider_id, rider_name, branch_id, branch_name,
    app_orders_count, matched_count, app_only_count, system_only_count, failed_count, duplicate_count,
    multiplier_count, trips_count, deductions_amount, rewards_amount, final_countable_orders, final_note
  )
  SELECT
    p_batch_id,
    p_period_start,
    p_period_end,
    r.id,
    r.name,
    r.branch_id,
    COALESCE(r.branch_name, b.name),
    COALESCE(o.app_orders_count, 0),
    COALESCE(m.matched_count, 0),
    COALESCE(m.app_only_count, 0),
    COALESCE(m.system_only_count, 0),
    COALESCE(o.failed_count, 0),
    COALESCE(o.duplicate_count, 0),
    COALESCE(o.multiplier_count, 0),
    COALESCE(t.trips_count, 0),
    COALESCE(a.deductions_amount, 0),
    COALESCE(a.rewards_amount, 0),
    COALESCE(m.final_countable_orders, 0),
    'أرشيف تلقائي بعد رفع ملف السيستم والمطابقة'
  FROM public.riders r
  LEFT JOIN public.branches b ON b.id = r.branch_id
  LEFT JOIN (
    SELECT rider_id,
      COUNT(*)::INT AS app_orders_count,
      COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed_count,
      COUNT(*) FILTER (WHERE COALESCE(is_duplicate_invoice,false) = true)::INT AS duplicate_count,
      COUNT(*) FILTER (WHERE COALESCE(order_multiplier,1) >= 1.5)::INT AS multiplier_count
    FROM public.delivery_orders
    WHERE delivery_date BETWEEN p_period_start AND p_period_end
    GROUP BY rider_id
  ) o ON o.rider_id = r.id
  LEFT JOIN (
    SELECT rider_id,
      COUNT(*) FILTER (WHERE match_status LIKE 'matched%')::INT AS matched_count,
      COUNT(*) FILTER (WHERE match_status = 'app_only')::INT AS app_only_count,
      COUNT(*) FILTER (WHERE match_status = 'system_only')::INT AS system_only_count,
      COUNT(*) FILTER (WHERE is_countable = true)::INT AS final_countable_orders
    FROM public.monthly_invoice_reconciliation_results
    WHERE batch_id = p_batch_id
    GROUP BY rider_id
  ) m ON m.rider_id = r.id
  LEFT JOIN (
    SELECT rider_id, COUNT(*)::INT AS trips_count
    FROM public.internal_trips
    WHERE trip_date BETWEEN p_period_start AND p_period_end
    GROUP BY rider_id
  ) t ON t.rider_id = r.id
  LEFT JOIN (
    SELECT rider_id,
      COALESCE(SUM(CASE WHEN COALESCE(final_action_type, action_type) IN ('deduction','deduction_request') THEN COALESCE(final_amount, requested_amount, amount, 0) ELSE 0 END),0) AS deductions_amount,
      COALESCE(SUM(CASE WHEN COALESCE(final_action_type, action_type) IN ('reward','reward_request','bonus_request') THEN COALESCE(final_amount, requested_amount, amount, 0) ELSE 0 END),0) AS rewards_amount
    FROM public.rider_shift_actions
    WHERE incident_at::date BETWEEN p_period_start AND p_period_end
    GROUP BY rider_id
  ) a ON a.rider_id = r.id
  ON CONFLICT (batch_id, rider_id) DO UPDATE SET
    app_orders_count = EXCLUDED.app_orders_count,
    matched_count = EXCLUDED.matched_count,
    app_only_count = EXCLUDED.app_only_count,
    system_only_count = EXCLUDED.system_only_count,
    failed_count = EXCLUDED.failed_count,
    duplicate_count = EXCLUDED.duplicate_count,
    multiplier_count = EXCLUDED.multiplier_count,
    trips_count = EXCLUDED.trips_count,
    deductions_amount = EXCLUDED.deductions_amount,
    rewards_amount = EXCLUDED.rewards_amount,
    final_countable_orders = EXCLUDED.final_countable_orders,
    final_note = EXCLUDED.final_note,
    created_at = NOW();

  UPDATE public.monthly_invoice_import_batches
  SET status = 'matched', matched_at = NOW()
  WHERE id = p_batch_id;

  RETURN json_build_object('success', true, 'batch_id', p_batch_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_monthly_rider_performance(UUID, DATE, DATE) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_invoice_global(p_invoice_number TEXT)
RETURNS TABLE (
  source TEXT,
  invoice_number TEXT,
  rider_name TEXT,
  branch_name TEXT,
  customer_name TEXT,
  customer_code TEXT,
  amount NUMERIC,
  status TEXT,
  registered_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  system_user TEXT,
  match_status TEXT,
  notes TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    'app_order'::TEXT AS source,
    COALESCE(o.invoice_number, o.invoice_no)::TEXT AS invoice_number,
    o.rider_name::TEXT,
    o.branch_name::TEXT,
    COALESCE(o.customer_name_snapshot, o.customer_name)::TEXT AS customer_name,
    COALESCE(o.customer_code_snapshot, o.customer_code)::TEXT AS customer_code,
    COALESCE(o.invoice_amount, o.invoice_value, 0)::NUMERIC AS amount,
    o.status::TEXT,
    o.registered_at,
    o.dispatched_at,
    o.delivered_at,
    NULL::TEXT AS system_user,
    o.bconnect_match_status::TEXT AS match_status,
    o.reconciliation_notes::TEXT AS notes
  FROM public.delivery_orders o
  WHERE regexp_replace(COALESCE(o.invoice_number, o.invoice_no, ''), '\s+', '', 'g') = regexp_replace(COALESCE(p_invoice_number,''), '\s+', '', 'g')

  UNION ALL

  SELECT
    'system_invoice'::TEXT AS source,
    s.invoice_number,
    NULL::TEXT,
    s.branch_name,
    s.customer_name,
    s.customer_code,
    COALESCE(s.net_total, s.gross_total, 0)::NUMERIC,
    s.invoice_type,
    NULL::TIMESTAMPTZ,
    NULL::TIMESTAMPTZ,
    NULL::TIMESTAMPTZ,
    s.system_user,
    NULL::TEXT,
    ('وقت الإقفال: ' || COALESCE(s.close_time_text,''))::TEXT
  FROM public.monthly_system_invoices s
  WHERE regexp_replace(COALESCE(s.invoice_number, ''), '\s+', '', 'g') = regexp_replace(COALESCE(p_invoice_number,''), '\s+', '', 'g');
$$;

GRANT EXECUTE ON FUNCTION public.search_invoice_global(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
