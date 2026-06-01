-- Demo data for Dawaa Delivery
-- This file inserts branches, riders, customers, settings, and one payroll period.

with branch_a as (
  insert into public.delivery_branches (id, name, address, phone)
  values (
    '11111111-1111-1111-1111-111111111111'::uuid,
    'فرع الضواحي',
    'شارع ١٢٤، الحي السابع',
    '01010000001'
  )
  on conflict (name) do update set address = excluded.address, phone = excluded.phone
  returning id
), branch_b as (
  insert into public.delivery_branches (id, name, address, phone)
  values (
    '22222222-2222-2222-2222-222222222222'::uuid,
    'فرع المركز',
    'شارع التحرير، بلوك ب',
    '01010000002'
  )
  on conflict (name) do update set address = excluded.address, phone = excluded.phone
  returning id
), settings_a as (
  insert into public.delivery_settings (branch_id, internal_trip_requires_approval, branch_lat, branch_lng, geofence_radius_meters)
  select id, true, 30.045, 31.235, 300 from branch_a
  on conflict (branch_id) do update set internal_trip_requires_approval = excluded.internal_trip_requires_approval, branch_lat = excluded.branch_lat, branch_lng = excluded.branch_lng, geofence_radius_meters = excluded.geofence_radius_meters
  returning branch_id
), settings_b as (
  insert into public.delivery_settings (branch_id, internal_trip_requires_approval, branch_lat, branch_lng, geofence_radius_meters)
  select id, false, 30.040, 31.225, 300 from branch_b
  on conflict (branch_id) do update set internal_trip_requires_approval = excluded.internal_trip_requires_approval, branch_lat = excluded.branch_lat, branch_lng = excluded.branch_lng, geofence_radius_meters = excluded.geofence_radius_meters
  returning branch_id
)
insert into public.delivery_riders (id, user_id, branch_id, display_name, phone, tier, hourly_rate, order_rate, internal_trip_rate)
values
  ('33333333-3333-3333-3333-333333333333'::uuid, null, (select id from branch_a), 'مروان سامي', '01010000011', 'senior', 28.5, 8, 5),
  ('33333333-3333-3333-3333-333333333334'::uuid, null, (select id from branch_a), 'هشام يوسف', '01010000012', 'mid', 22, 6, 4),
  ('33333333-3333-3333-3333-333333333335'::uuid, null, (select id from branch_b), 'ليلى محمود', '01010000013', 'junior', 18, 5, 3)
on conflict (id) do update set
  branch_id = excluded.branch_id,
  display_name = excluded.display_name,
  phone = excluded.phone,
  tier = excluded.tier,
  hourly_rate = excluded.hourly_rate,
  order_rate = excluded.order_rate,
  internal_trip_rate = excluded.internal_trip_rate,
  updated_at = now();

insert into public.delivery_customers (id, customer_code, name, phone, address, branch_id)
values
  ('44444444-4444-4444-4444-444444444444'::uuid, 'DC-001', 'صيدلية الشروق', '01020000001', 'شارع النيل، مبنى ١', (select id from branch_a)),
  ('44444444-4444-4444-4444-444444444445'::uuid, 'DC-002', 'صيدلية النهار', '01020000002', 'الميدان التجارى، الطابق الأرضى', (select id from branch_a)),
  ('44444444-4444-4444-4444-444444444446'::uuid, 'DC-003', 'صيدلية الندى', '01020000003', 'حي السلام، شارع ٥', (select id from branch_a)),
  ('44444444-4444-4444-4444-444444444447'::uuid, 'DC-004', 'صيدلية الزهور', '01020000004', 'شارع القصر، بجانب البنك', (select id from branch_b)),
  ('44444444-4444-4444-4444-444444444448'::uuid, 'DC-005', 'صيدلية الأمل', '01020000005', 'شارع النصر، عمارة ١٠', (select id from branch_b)),
  ('44444444-4444-4444-4444-444444444449'::uuid, 'DC-006', 'صيدلية السلام', '01020000006', 'شارع التحرير، بجانب المترو', (select id from branch_b)),
  ('44444444-4444-4444-4444-444444444450'::uuid, 'DC-007', 'صيدلية الرحمة', '01020000007', 'شارع الجامعة، أمام سوبر ماركت', (select id from branch_a)),
  ('44444444-4444-4444-4444-444444444451'::uuid, 'DC-008', 'صيدلية المدينة', '01020000008', 'شارع النخيل، جنب موقف الأتوبيس', (select id from branch_b)),
  ('44444444-4444-4444-4444-444444444452'::uuid, 'DC-009', 'صيدلية الفجر', '01020000009', 'شارع بورسعيد، عمارة ٥', (select id from branch_a)),
  ('44444444-4444-4444-4444-444444444453'::uuid, 'DC-010', 'صيدلية البركة', '01020000010', 'الحي السابع، شارع ١٠', (select id from branch_b))
on conflict (customer_code) do update set
  name = excluded.name,
  phone = excluded.phone,
  address = excluded.address,
  branch_id = excluded.branch_id,
  updated_at = now();

insert into public.delivery_payroll_periods (id, start_date, end_date, status)
values (
  '55555555-5555-5555-5555-555555555555'::uuid,
  (case when extract(day from current_date) >= 26 then (date_trunc('month', current_date)::date + interval '25 days')::date else ((date_trunc('month', current_date) - interval '1 month')::date + interval '25 days')::date end),
  (case when extract(day from current_date) >= 26 then ((date_trunc('month', current_date)::date + interval '25 days')::date + interval '1 month - 1 day')::date else (((date_trunc('month', current_date) - interval '1 month')::date + interval '25 days')::date + interval '1 month - 1 day')::date end),
  'open'
)
on conflict (start_date, end_date) do update set status = excluded.status, updated_at = now();
