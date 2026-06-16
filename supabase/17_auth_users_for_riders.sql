-- ============================================================
-- Migration 17: ربط كل دليفري بـ auth.users
-- email = username@dawaa.app  |  password = PIN
-- ============================================================
-- هذه الدالة بتنشئ auth user لكل rider ليس عنده auth_user_id
-- تُشغَّل مرة واحدة يدوياً من Supabase Dashboard → SQL Editor

-- 1. تأكد من وجود auth_user_id على riders
ALTER TABLE riders ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. بنى الـ email = username@dawaa.app (lowercase, no spaces)
UPDATE riders
SET email = LOWER(REPLACE(username, ' ', '.')) || '@dawaa.app'
WHERE email IS NULL;

-- 3. دالة تنشئ auth user لكل rider وتربطهم
-- *** شغّل هذه الدالة مرة واحدة بعد رفع الـ migration ***
CREATE OR REPLACE FUNCTION create_auth_users_for_riders()
RETURNS TABLE(username TEXT, email TEXT, status TEXT) AS $$
DECLARE
  v_rider RECORD;
  v_pin TEXT;
  v_user_id UUID;
BEGIN
  FOR v_rider IN
    SELECT r.id, r.name, r.username, r.email,
           COALESCE(ra.pin_plain, r.pin, '1234') AS pin_val,
           r.branch_id, r.branch_name
    FROM riders r
    LEFT JOIN rider_accounts ra ON ra.rider_id = r.id AND ra.status = 'active'
    WHERE r.status = 'active'
      AND r.auth_user_id IS NULL
      AND r.email IS NOT NULL
  LOOP
    v_pin := COALESCE(v_rider.pin_val, '1234');

    BEGIN
      -- Create auth user
      INSERT INTO auth.users (
        id, instance_id,
        email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        role, aud
      ) VALUES (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000',
        v_rider.email,
        crypt(v_pin, gen_salt('bf')),
        NOW(), NOW(), NOW(),
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object(
          'rider_id', v_rider.id,
          'name', v_rider.name,
          'username', v_rider.username,
          'branch_name', v_rider.branch_name,
          'role', 'rider'
        ),
        'authenticated', 'authenticated'
      )
      RETURNING id INTO v_user_id;

      -- Link back to rider
      UPDATE riders SET auth_user_id = v_user_id WHERE id = v_rider.id;

      -- Create user_profile
      INSERT INTO user_profiles (auth_user_id, username, email, display_name, role, status, branch_id)
      VALUES (v_user_id, v_rider.username, v_rider.email, v_rider.name, 'rider', 'active', v_rider.branch_id)
      ON CONFLICT (auth_user_id) DO NOTHING;

      username := v_rider.username;
      email    := v_rider.email;
      status   := 'created';
      RETURN NEXT;

    EXCEPTION WHEN unique_violation THEN
      -- auth user already exists with this email — find and link
      SELECT id INTO v_user_id FROM auth.users WHERE auth.users.email = v_rider.email LIMIT 1;
      IF v_user_id IS NOT NULL THEN
        UPDATE riders SET auth_user_id = v_user_id WHERE id = v_rider.id;
        username := v_rider.username;
        email    := v_rider.email;
        status   := 'linked_existing';
        RETURN NEXT;
      ELSE
        username := v_rider.username;
        email    := v_rider.email;
        status   := 'error_unique';
        RETURN NEXT;
      END IF;
    WHEN OTHERS THEN
      username := v_rider.username;
      email    := v_rider.email;
      status   := 'error: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- *** بعد رفع الـ migration، شغّل في SQL Editor: ***
-- SELECT * FROM create_auth_users_for_riders();

NOTIFY pgrst, 'reload schema';
