-- Keep delivery customer imports and rider customer lookup on one canonical identity set.
-- Applied to delivery Supabase on 2026-09-11.

CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_canonical_code
ON public.customers ((btrim(coalesce(customer_code, code, ''))))
WHERE btrim(coalesce(customer_code, code, '')) <> '';

CREATE OR REPLACE FUNCTION public.sync_delivery_customer_to_customers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := btrim(coalesce(NEW.customer_code, NEW.code, ''));
BEGIN
  IF v_code = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.customers c
  SET
    customer_code = v_code,
    code = v_code,
    customer_name = coalesce(nullif(btrim(NEW.customer_name), ''), nullif(btrim(NEW.name), ''), c.customer_name, c.name),
    name = coalesce(nullif(btrim(NEW.name), ''), nullif(btrim(NEW.customer_name), ''), c.name, c.customer_name),
    phone = coalesce(nullif(btrim(NEW.phone), ''), nullif(btrim(NEW.phone_normalized), ''), c.phone),
    customer_phone = coalesce(nullif(btrim(NEW.phone), ''), nullif(btrim(NEW.phone_normalized), ''), c.customer_phone),
    mobile = coalesce(nullif(btrim(NEW.phone2), ''), nullif(btrim(NEW.phone), ''), c.mobile),
    address = coalesce(nullif(btrim(NEW.address), ''), c.address),
    customer_address = coalesce(nullif(btrim(NEW.address), ''), c.customer_address),
    branch_name = coalesce(nullif(btrim(NEW.branch_name), ''), nullif(btrim(NEW.branch), ''), c.branch_name),
    active = coalesce(NEW.active, c.active, true),
    updated_at = now()
  WHERE btrim(coalesce(c.customer_code, c.code, '')) = v_code;

  IF NOT FOUND THEN
    INSERT INTO public.customers (
      customer_code, code, customer_name, name, phone, customer_phone, mobile,
      address, customer_address, branch_name, active, created_at, updated_at
    ) VALUES (
      v_code, v_code,
      coalesce(nullif(btrim(NEW.customer_name), ''), nullif(btrim(NEW.name), '')),
      coalesce(nullif(btrim(NEW.name), ''), nullif(btrim(NEW.customer_name), '')),
      coalesce(nullif(btrim(NEW.phone), ''), nullif(btrim(NEW.phone_normalized), '')),
      coalesce(nullif(btrim(NEW.phone), ''), nullif(btrim(NEW.phone_normalized), '')),
      coalesce(nullif(btrim(NEW.phone2), ''), nullif(btrim(NEW.phone), '')),
      nullif(btrim(NEW.address), ''), nullif(btrim(NEW.address), ''),
      coalesce(nullif(btrim(NEW.branch_name), ''), nullif(btrim(NEW.branch), '')),
      coalesce(NEW.active, true), coalesce(NEW.created_at::timestamptz, now()), now()
    )
    ON CONFLICT ((btrim(coalesce(customer_code, code, ''))))
      WHERE btrim(coalesce(customer_code, code, '')) <> ''
    DO UPDATE SET
      customer_name = coalesce(EXCLUDED.customer_name, public.customers.customer_name),
      name = coalesce(EXCLUDED.name, public.customers.name),
      phone = coalesce(EXCLUDED.phone, public.customers.phone),
      customer_phone = coalesce(EXCLUDED.customer_phone, public.customers.customer_phone),
      mobile = coalesce(EXCLUDED.mobile, public.customers.mobile),
      address = coalesce(EXCLUDED.address, public.customers.address),
      customer_address = coalesce(EXCLUDED.customer_address, public.customers.customer_address),
      branch_name = coalesce(EXCLUDED.branch_name, public.customers.branch_name),
      active = coalesce(EXCLUDED.active, public.customers.active),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_delivery_customer_to_customers ON public.delivery_customers;
CREATE TRIGGER trg_sync_delivery_customer_to_customers
AFTER INSERT OR UPDATE OF customer_code, code, customer_name, name, phone, phone_normalized, phone2, address, branch_name, branch, active
ON public.delivery_customers
FOR EACH ROW
EXECUTE FUNCTION public.sync_delivery_customer_to_customers();

CREATE OR REPLACE FUNCTION public.rider_search_customers(
  p_token text,
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session json;
  v_query text := btrim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
BEGIN
  v_session := public.rider_validate_session(p_token);
  IF NOT coalesce((v_session->>'valid')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', 'session_invalid', 'data', '[]'::json);
  END IF;

  IF v_query = '' THEN
    RETURN json_build_object('success', true, 'data', '[]'::json);
  END IF;

  RETURN json_build_object(
    'success', true,
    'data', (
      SELECT coalesce(json_agg(r), '[]'::json)
      FROM (
        SELECT
          d.id,
          coalesce(nullif(btrim(d.customer_code), ''), nullif(btrim(d.code), '')) AS code,
          coalesce(nullif(btrim(d.customer_name), ''), nullif(btrim(d.name), ''), 'عميل غير مسجل') AS name,
          coalesce(nullif(btrim(d.phone), ''), nullif(btrim(d.phone_normalized), ''), nullif(btrim(d.phone2), '')) AS phone,
          d.address,
          coalesce(nullif(btrim(d.branch_name), ''), nullif(btrim(d.branch), '')) AS branch_name
        FROM public.delivery_customers d
        WHERE coalesce(d.active, true) = true
          AND (
            btrim(coalesce(d.customer_code, d.code, '')) = v_query
            OR coalesce(d.customer_code, d.code, '') ILIKE '%' || v_query || '%'
            OR coalesce(d.customer_name, d.name, '') ILIKE '%' || v_query || '%'
            OR coalesce(d.phone, d.phone_normalized, d.phone2, '') ILIKE '%' || regexp_replace(v_query, '\\D', '', 'g') || '%'
          )
        ORDER BY
          CASE WHEN btrim(coalesce(d.customer_code, d.code, '')) = v_query THEN 0 ELSE 1 END,
          coalesce(d.customer_name, d.name, ''),
          coalesce(d.customer_code, d.code, '')
        LIMIT v_limit
      ) r
    )
  );
END;
$$;
