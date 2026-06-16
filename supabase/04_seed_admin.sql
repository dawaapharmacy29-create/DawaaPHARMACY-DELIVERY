-- IMPORTANT: Before running this script, you must create the Auth User in Supabase Dashboard:
-- Go to Authentication > Users > Add user
-- Email: dr.moaz@dawaa-delivery.local
-- Password: 9493
-- Auto-confirm user: Yes

-- After creating the Auth User, get the user ID and replace AUTH_USER_ID below
-- You can find the user ID in Authentication > Users > dr.moaz@dawaa-delivery.local

-- Replace this with the actual Auth User ID from Supabase Dashboard
-- DO NOT run this script until you have the actual UUID
-- Example: SET LOCAL auth_user_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- Insert default branch
INSERT INTO branches (name, code, address, active) VALUES
('المعادي', 'MA', 'المعادي، القاهرة', true),
('النزهة', 'NA', 'النزهة، القاهرة', true),
('مدينة نصر', 'MN', 'مدينة نصر، القاهرة', true),
('المقطم', 'MK', 'المقطم، القاهرة', true)
ON CONFLICT (code) DO NOTHING;

-- Insert login alias for admin
INSERT INTO login_aliases (username, email, active) VALUES
('DR.MOAZ', 'dr.moaz@dawaa-delivery.local', true)
ON CONFLICT (username) DO NOTHING;

-- NOTE: The user profile will be created after you get the Auth User ID
-- Run the following manually in Supabase SQL Editor after getting the UUID:

/*
-- Replace AUTH_USER_ID with the actual UUID from Supabase Dashboard
INSERT INTO user_profiles (
  auth_user_id,
  username,
  email,
  display_name,
  role,
  status,
  branch_id
) VALUES (
  'AUTH_USER_ID', -- Replace with actual UUID
  'DR.MOAZ',
  'dr.moaz@dawaa-delivery.local',
  'د. معاز',
  'admin',
  'active',
  (SELECT id FROM branches WHERE code = 'MA' LIMIT 1)
);
*/

-- Insert sample riders (without auth users for now)
INSERT INTO riders (name, username, phone, branch_id, level, hourly_rate, order_rate, trip_rate, monthly_incentive_base, quarterly_incentive_base, status) VALUES
('أحمد محمد', 'ahmed.m', '01012345678', (SELECT id FROM branches WHERE code = 'MA' LIMIT 1), 'mid', 21.5, 8, 4, 750, 750, 'active'),
('محمد علي', 'mohamed.a', '01098765432', (SELECT id FROM branches WHERE code = 'NA' LIMIT 1), 'senior', 23, 10, 4, 1000, 1000, 'active'),
('عمر حسن', 'omar.h', '01123456789', (SELECT id FROM branches WHERE code = 'MN' LIMIT 1), 'junior', 19.25, 6, 3, 750, 750, 'active')
ON CONFLICT (username) DO NOTHING;

-- Insert sample customers
INSERT INTO customers (customer_code, customer_name, phone, address, branch_id, active) VALUES
('C001', 'محمد أحمد عبدالله', '01012345678', 'شارع التسعين، المعادي', (SELECT id FROM branches WHERE code = 'MA' LIMIT 1), true),
('C002', 'فاطمة محمود حسن', '01098765432', 'شارع عباس العقاد، النزهة', (SELECT id FROM branches WHERE code = 'NA' LIMIT 1), true),
('C003', 'علي عبدالرحمن', '01123456789', 'شارع عباس العكاشي، مدينة نصر', (SELECT id FROM branches WHERE code = 'MN' LIMIT 1), true)
ON CONFLICT (customer_code) DO NOTHING;
