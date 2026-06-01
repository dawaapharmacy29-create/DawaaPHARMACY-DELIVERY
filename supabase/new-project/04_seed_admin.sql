-- Seed the first admin account for Dawaa Delivery
-- 1) Create the Supabase Auth user in Supabase Dashboard
--    Email: dr.moaz@dawaa-delivery.local
--    Password: 9493
--    Confirm the email field in the dashboard.
-- 2) Copy the new Auth user id and replace <auth-user-id> below.
-- 3) Run this file after the auth user exists.

insert into public.user_profiles (
  id,
  email,
  username,
  display_name,
  role,
  status,
  branch_id,
  phone
)
values (
  '<auth-user-id>'::uuid,
  'dr.moaz@dawaa-delivery.local',
  'DR.MOAZ',
  'DR.MOAZ',
  'admin',
  null,
  null
)
on conflict (id) do update set
  email = excluded.email,
  username = excluded.username,
  display_name = excluded.display_name,
  role = excluded.role,
  status = excluded.status,
  branch_id = excluded.branch_id,
  phone = excluded.phone,
  updated_at = now();

insert into public.delivery_login_aliases (username, email, role, status)
values ('DR.MOAZ', 'dr.moaz@dawaa-delivery.local', 'admin', 'active')
on conflict (username) do update set
  email = excluded.email,
  role = excluded.role,
  status = excluded.status;
