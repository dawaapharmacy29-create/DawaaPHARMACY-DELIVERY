-- Keep the existing dashboard RPC contract and session validation intact.
-- COALESCE(work_date, delivery_date) predicates could only use rider_id indexes,
-- forcing historical rider rows to be loaded and filtered. This exact Boolean
-- expansion lets PostgreSQL use the existing rider/work_date indexes.
-- Do not replace this with an unguarded OR: a populated work_date wins.
CREATE OR REPLACE FUNCTION public.rider_get_dashboard_data(
  p_token text,
  p_date_start date DEFAULT NULL::date,
  p_date_end date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_session record; v_account record; v_rider record; v_att record;
  v_today date := ((now() at time zone 'Africa/Cairo')::date);
  v_start date := coalesce(p_date_start, v_today - 31);
  v_end date := coalesce(p_date_end, v_today);
  v_work_date date;
  v_orders_today jsonb; v_orders_cycle jsonb;
  v_trips_today jsonb; v_trips_cycle jsonb;
  v_latest_orders jsonb; v_open_count int;
BEGIN
  SELECT * INTO v_session
  FROM public.rider_sessions
  WHERE session_token = p_token
    AND coalesce(revoked, false) = false
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired_session');
  END IF;

  UPDATE public.rider_sessions SET last_seen = now() WHERE id = v_session.id;
  SELECT * INTO v_account FROM public.rider_accounts WHERE id = v_session.account_id LIMIT 1;
  SELECT * INTO v_rider FROM public.riders WHERE id = coalesce(v_session.rider_id, v_account.rider_id) LIMIT 1;
  SELECT * INTO v_att FROM public.delivery_attendance
  WHERE rider_id = v_rider.id
    AND check_in_time IS NOT NULL
    AND check_out_time IS NULL
    AND check_in_time >= now() - interval '16 hours'
  ORDER BY check_in_time DESC NULLS LAST, created_at DESC LIMIT 1;
  v_work_date := coalesce(v_att.shift_date, v_today);

  SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.registered_at DESC), '[]'::jsonb)
  INTO v_orders_today
  FROM public.delivery_orders o
  WHERE o.rider_id = v_rider.id
    AND (coalesce(o.attendance_id = v_att.id, false)
      OR coalesce(o.work_date, o.delivery_date) = v_work_date);

  SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY coalesce(o.work_date, o.delivery_date) DESC, o.registered_at DESC), '[]'::jsonb)
  INTO v_orders_cycle
  FROM public.delivery_orders o
  WHERE o.rider_id = v_rider.id
    AND (o.work_date BETWEEN v_start AND v_end
      OR (o.work_date IS NULL AND o.delivery_date BETWEEN v_start AND v_end));

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.registered_at DESC), '[]'::jsonb)
  INTO v_trips_today
  FROM public.internal_trips t
  WHERE t.rider_id = v_rider.id
    AND (coalesce(t.attendance_id = v_att.id, false)
      OR coalesce(t.work_date, t.trip_date) = v_work_date);

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY coalesce(t.work_date, t.trip_date) DESC, t.registered_at DESC), '[]'::jsonb)
  INTO v_trips_cycle
  FROM public.internal_trips t
  WHERE t.rider_id = v_rider.id
    AND (t.work_date BETWEEN v_start AND v_end
      OR (t.work_date IS NULL AND t.trip_date BETWEEN v_start AND v_end));

  SELECT count(*)::int INTO v_open_count
  FROM public.delivery_orders o
  WHERE o.rider_id = v_rider.id
    AND lower(coalesce(o.status, 'registered')) NOT IN ('delivered', 'تم التسليم', 'failed', 'cancelled', 'canceled');

  SELECT coalesce(jsonb_agg(x.row_json), '[]'::jsonb)
  INTO v_latest_orders
  FROM (
    SELECT to_jsonb(o) AS row_json FROM public.delivery_orders o
    WHERE o.rider_id = v_rider.id ORDER BY o.registered_at DESC LIMIT 10
  ) x;

  RETURN jsonb_build_object(
    'success', true, 'session_valid', true,
    'rider', to_jsonb(v_rider),
    'attendance', CASE WHEN v_att.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_att.id, 'rider_id', v_att.rider_id, 'branch_id', v_att.branch_id,
      'work_date', v_att.shift_date, 'shift_date', v_att.shift_date,
      'check_in_at', v_att.check_in_time, 'check_out_at', v_att.check_out_time,
      'total_minutes', v_att.total_minutes, 'status', v_att.status
    ) END,
    'current_work_date', v_work_date, 'shift_open', v_att.id IS NOT NULL,
    'current_shift_orders', jsonb_array_length(v_orders_today),
    'current_shift_trips', jsonb_array_length(v_trips_today),
    'open_orders_count', v_open_count, 'latest_orders', v_latest_orders,
    'orders', jsonb_build_object('today', v_orders_today, 'cycle', v_orders_cycle),
    'trips', jsonb_build_object('today', v_trips_today, 'cycle', v_trips_cycle),
    'notifications', '[]'::jsonb,
    'cycle_start', v_start, 'cycle_end', v_end,
    'session_expires_at', v_session.expires_at
  );
END;
$function$;
