-- Function to resolve login username to email
CREATE OR REPLACE FUNCTION resolve_login_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- If the input is already an email, return it lowercase
  IF p_username LIKE '%@%' THEN
    RETURN LOWER(p_username);
  END IF;

  -- Search in login_aliases table
  SELECT email INTO v_email
  FROM login_aliases
  WHERE username = p_username
    AND active = true
  LIMIT 1;

  -- If found, return the email
  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  -- If not found, return NULL
  RETURN NULL;
END;
$$;

-- Grant execute permission to anon (public) for login
GRANT EXECUTE ON FUNCTION resolve_login_username(TEXT) TO anon;
