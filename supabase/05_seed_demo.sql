-- This file contains demo data for testing purposes
-- Run this after 04_seed_admin.sql to populate demo data

-- Insert more sample customers
INSERT INTO customers (customer_code, customer_name, phone, address, branch_id, active) VALUES
('C004', 'خالد إبراهيم', '01234567890', 'شارع السلام، المعادي', (SELECT id FROM branches WHERE code = 'MA' LIMIT 1), true),
('C005', 'سارة محمود', '01298765432', 'شارع التحلية، النزهة', (SELECT id FROM branches WHERE code = 'NA' LIMIT 1), true),
('C006', 'يوسف أحمد', '01323456789', 'شارع الملك فيصل، مدينة نصر', (SELECT id FROM branches WHERE code = 'MN' LIMIT 1), true),
('C007', 'نور الدين', '01398765432', 'شارع المقطم، المقطم', (SELECT id FROM branches WHERE code = 'MK' LIMIT 1), true),
('C008', 'مريم حسن', '01412345678', 'شارع المعز، المعادي', (SELECT id FROM branches WHERE code = 'MA' LIMIT 1), true)
ON CONFLICT (customer_code) DO NOTHING;

-- Insert sample attendance records (for current month)
INSERT INTO attendance (rider_id, branch_id, work_date, check_in_at, check_out_at, total_minutes, status, notes) VALUES
((SELECT id FROM riders WHERE username = 'ahmed.m' LIMIT 1), (SELECT id FROM branches WHERE code = 'MA' LIMIT 1), CURRENT_DATE, NOW() - INTERVAL '8 hours', NOW() - INTERVAL '1 hour', 420, 'present', NULL),
((SELECT id FROM riders WHERE username = 'mohamed.a' LIMIT 1), (SELECT id FROM branches WHERE code = 'NA' LIMIT 1), CURRENT_DATE, NOW() - INTERVAL '9 hours', NOW() - INTERVAL '2 hours', 420, 'present', NULL),
((SELECT id FROM riders WHERE username = 'omar.h' LIMIT 1), (SELECT id FROM branches WHERE code = 'MN' LIMIT 1), CURRENT_DATE, NOW() - INTERVAL '8 hours', NULL, NULL, 'present', NULL)
ON CONFLICT (rider_id, work_date) DO NOTHING;

-- Insert sample delivery orders
INSERT INTO delivery_orders (
  rider_id, branch_id, customer_id, delivery_date, invoice_number, invoice_amount,
  customer_code_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot,
  status, bconnect_match_status, registered_at
) VALUES
((SELECT id FROM riders WHERE username = 'ahmed.m' LIMIT 1), (SELECT id FROM branches WHERE code = 'MA' LIMIT 1), 
 (SELECT id FROM customers WHERE customer_code = 'C001' LIMIT 1), CURRENT_DATE, 'INV-001', 150.00,
 'C001', 'محمد أحمد عبدالله', '01012345678', 'شارع التسعين، المعادي',
 'delivered', 'matched', NOW() - INTERVAL '2 hours'),
((SELECT id FROM riders WHERE username = 'ahmed.m' LIMIT 1), (SELECT id FROM branches WHERE code = 'MA' LIMIT 1), 
 (SELECT id FROM customers WHERE customer_code = 'C004' LIMIT 1), CURRENT_DATE, 'INV-002', 200.50,
 'C004', 'خالد إبراهيم', '01234567890', 'شارع السلام، المعادي',
 'registered', 'pending', NOW() - INTERVAL '1 hour'),
((SELECT id FROM riders WHERE username = 'mohamed.a' LIMIT 1), (SELECT id FROM branches WHERE code = 'NA' LIMIT 1), 
 (SELECT id FROM customers WHERE customer_code = 'C002' LIMIT 1), CURRENT_DATE, 'INV-003', 180.00,
 'C002', 'فاطمة محمود حسن', '01098765432', 'شارع عباس العقاد، النزهة',
 'delivered', 'matched', NOW() - INTERVAL '3 hours'),
((SELECT id FROM riders WHERE username = 'omar.h' LIMIT 1), (SELECT id FROM branches WHERE code = 'MN' LIMIT 1), 
 (SELECT id FROM customers WHERE customer_code = 'C003' LIMIT 1), CURRENT_DATE, 'INV-004', 120.00,
 'C003', 'علي عبدالرحمن', '01123456789', 'شارع عباس العكاشي، مدينة نصر',
 'registered', 'pending', NOW() - INTERVAL '30 minutes')
ON CONFLICT DO NOTHING;

-- Insert sample internal trips
INSERT INTO internal_trips (
  rider_id, branch_id, trip_date, trip_type, from_label, to_label, reason, status, registered_at
) VALUES
((SELECT id FROM riders WHERE username = 'ahmed.m' LIMIT 1), (SELECT id FROM branches WHERE code = 'MA' LIMIT 1), 
 CURRENT_DATE, 'warehouse', 'المعادي', 'المخزن الرئيسي', 'استلام مخزون', 'approved', NOW() - INTERVAL '4 hours'),
((SELECT id FROM riders WHERE username = 'mohamed.a' LIMIT 1), (SELECT id FROM branches WHERE code = 'NA' LIMIT 1), 
 CURRENT_DATE, 'branch_to_branch', 'النزهة', 'المعادي', 'نقل فواتير', 'pending_approval', NOW() - INTERVAL '2 hours'),
((SELECT id FROM riders WHERE username = 'omar.h' LIMIT 1), (SELECT id FROM branches WHERE code = 'MN' LIMIT 1), 
 CURRENT_DATE, 'returns', 'مدينة نصر', 'المعادي', 'إرجاع منتجات', 'completed', NOW() - INTERVAL '5 hours')
ON CONFLICT DO NOTHING;

-- Insert sample notifications
INSERT INTO notifications (recipient_profile_id, rider_id, title, message, severity, status, action_url) VALUES
((SELECT id FROM user_profiles WHERE username = 'DR.MOAZ' LIMIT 1), 
 (SELECT id FROM riders WHERE username = 'ahmed.m' LIMIT 1),
 'مشوار جديد يحتاج اعتماد', 'مشوار من النزهة للمعادي يحتاج اعتماد من الإدارة', 'warning', 'unread', '/admin/trips'),
((SELECT id FROM user_profiles WHERE username = 'DR.MOAZ' LIMIT 1), 
 (SELECT id FROM riders WHERE username = 'ahmed.m' LIMIT 1),
 'فاتورة غير مطابقة', 'فاتورة INV-002 غير مطابقة مع بي كونكت', 'danger', 'unread', '/admin/reconciliation'),
((SELECT id FROM user_profiles WHERE username = 'DR.MOAZ' LIMIT 1), NULL,
 'تقرير الشهر جاهز', 'تقرير الشهر الحالي جاهز للمراجعة', 'success', 'unread', '/admin/monthly-review')
ON CONFLICT DO NOTHING;

-- Insert sample incidents
INSERT INTO incidents (rider_id, incident_date, incident_type, severity, description, status, created_by) VALUES
((SELECT id FROM riders WHERE username = 'omar.h' LIMIT 1), CURRENT_DATE - INTERVAL '2 days', 'late_order', 'medium', 'تأخير في تسليم أوردر', 'resolved', (SELECT id FROM user_profiles WHERE username = 'DR.MOAZ' LIMIT 1)),
((SELECT id FROM riders WHERE username = 'ahmed.m' LIMIT 1), CURRENT_DATE - INTERVAL '1 day', 'customer_complaint', 'low', 'شكوى من العميل على التأخير', 'open', (SELECT id FROM user_profiles WHERE username = 'DR.MOAZ' LIMIT 1))
ON CONFLICT DO NOTHING;

-- Insert sample performance scores (for previous month)
INSERT INTO performance_scores (
  period_start, period_end, rider_id,
  invoice_match_score, registration_score, timing_score, trips_score, behavior_score, attendance_score, total_score
) VALUES
(DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month'), 
 (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day'),
 (SELECT id FROM riders WHERE username = 'ahmed.m' LIMIT 1),
 28, 18, 17, 9, 9, 9, 90),
(DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month'), 
 (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day'),
 (SELECT id FROM riders WHERE username = 'mohamed.a' LIMIT 1),
 29, 19, 18, 9, 10, 10, 95),
(DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month'), 
 (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day'),
 (SELECT id FROM riders WHERE username = 'omar.h' LIMIT 1),
 25, 16, 15, 8, 8, 8, 80)
ON CONFLICT (rider_id, period_start, period_end) DO NOTHING;
