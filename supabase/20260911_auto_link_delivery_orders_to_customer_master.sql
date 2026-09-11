-- Auto-link every delivery order to the canonical delivery customer master.
-- Applied to production Supabase on 2026-09-11.

CREATE OR REPLACE FUNCTION public.dawaa_normalize_customer_code_v1(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_code IS NULL THEN NULL
    ELSE (
      WITH x AS (
        SELECT translate(btrim(p_code), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789') AS c
      )
      SELECT CASE
        WHEN c ~ '^[0-9]+$' THEN c
        WHEN c ~ '^([0-9]+)/\1$' THEN split_part(c,'/',1)
        ELSE nullif(c,'')
      END
      FROM x
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.delivery_orders_link_customer_master_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_customer public.delivery_customers%ROWTYPE;
BEGIN
  v_code := public.dawaa_normalize_customer_code_v1(
    coalesce(nullif(NEW.customer_code,''), nullif(NEW.customer_code_snapshot,''))
  );

  IF NEW.customer_id IS NULL AND v_code IS NOT NULL AND v_code ~ '^[0-9]+$' THEN
    SELECT * INTO v_customer
    FROM public.delivery_customers d
    WHERE btrim(coalesce(d.customer_code,d.code,'')) = v_code
      AND coalesce(d.active,true)=true
    LIMIT 1;

    IF FOUND THEN
      NEW.customer_id := v_customer.id;
      NEW.customer_code := v_code;
      NEW.customer_code_snapshot := coalesce(nullif(NEW.customer_code_snapshot,''), v_code);
      NEW.customer_name := coalesce(nullif(NEW.customer_name,''), nullif(v_customer.customer_name,''), nullif(v_customer.name,''));
      NEW.customer_phone := coalesce(nullif(NEW.customer_phone,''), nullif(v_customer.phone,''), nullif(v_customer.phone_normalized,''));
      NEW.customer_address := coalesce(nullif(NEW.customer_address,''), nullif(v_customer.address,''));
    END IF;
  ELSIF NEW.customer_id IS NOT NULL THEN
    SELECT * INTO v_customer
    FROM public.delivery_customers d
    WHERE d.id=NEW.customer_id
    LIMIT 1;

    IF FOUND THEN
      v_code := coalesce(nullif(btrim(v_customer.customer_code),''), nullif(btrim(v_customer.code),''), v_code);
      NEW.customer_code := coalesce(nullif(NEW.customer_code,''), v_code);
      NEW.customer_code_snapshot := coalesce(nullif(NEW.customer_code_snapshot,''), v_code);
      NEW.customer_name := coalesce(nullif(NEW.customer_name,''), nullif(v_customer.customer_name,''), nullif(v_customer.name,''));
      NEW.customer_phone := coalesce(nullif(NEW.customer_phone,''), nullif(v_customer.phone,''), nullif(v_customer.phone_normalized,''));
      NEW.customer_address := coalesce(nullif(NEW.customer_address,''), nullif(v_customer.address,''));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_00_delivery_orders_link_customer_master ON public.delivery_orders;
CREATE TRIGGER trg_00_delivery_orders_link_customer_master
BEFORE INSERT OR UPDATE OF customer_id, customer_code, customer_code_snapshot, customer_name, customer_phone, customer_address
ON public.delivery_orders
FOR EACH ROW
EXECUTE FUNCTION public.delivery_orders_link_customer_master_v1();
