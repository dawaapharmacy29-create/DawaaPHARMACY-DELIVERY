-- Seed real delivery riders and schedules from attendance_report(2).xlsx
-- Run after 01_schema.sql and 04_seed_admin.sql

INSERT INTO branches (name, code, address, active) VALUES
('الشامي', 'SHAMI', 'فرع الشامي', true),
('أبو العزم', 'ABO_AZM', 'فرع أبو العزم', true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, active = true;

CREATE TABLE IF NOT EXISTS rider_weekly_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  day_name TEXT NOT NULL,
  shift_text TEXT NOT NULL,
  is_day_off BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rider_id, day_name)
);

WITH data(name, username, branch_code, level) AS (
  VALUES
  ('مدحت','مدحت','SHAMI','senior'),
  ('محمود','محمود','SHAMI','mid'),
  ('احمد البطل','احمد.البطل','SHAMI','senior'),
  ('مصطفي','مصطفي','SHAMI','junior'),
  ('محمد حافظ','محمد.حافظ','SHAMI','mid'),
  ('يوسف عصام','يوسف.عصام','SHAMI','junior'),
  ('احمد وجيه','احمد.وجيه','ABO_AZM','senior'),
  ('حسين','حسين','ABO_AZM','mid'),
  ('محمد سالم','محمد.سالم','ABO_AZM','senior'),
  ('يوسف ماهر','يوسف.ماهر','ABO_AZM','junior'),
  ('يوسف عيد','يوسف.عيد','ABO_AZM','mid'),
  ('اسلام','اسلام','ABO_AZM','mid'),
  ('محمد شماتة','محمد.شماتة','ABO_AZM','junior')
)
INSERT INTO riders (name, username, branch_id, level, hourly_rate, order_rate, trip_rate, monthly_incentive_base, quarterly_incentive_base, status)
SELECT
  data.name,
  data.username,
  branches.id,
  data.level,
  CASE data.level WHEN 'senior' THEN 23 WHEN 'mid' THEN 21.5 ELSE 19.25 END,
  CASE data.level WHEN 'senior' THEN 10 WHEN 'mid' THEN 8 ELSE 6 END,
  CASE data.level WHEN 'junior' THEN 3 ELSE 4 END,
  CASE data.level WHEN 'senior' THEN 1000 ELSE 750 END,
  CASE data.level WHEN 'senior' THEN 1000 ELSE 750 END,
  'active'
FROM data
JOIN branches ON branches.code = data.branch_code
ON CONFLICT (username) DO UPDATE SET
  name = EXCLUDED.name,
  branch_id = EXCLUDED.branch_id,
  level = EXCLUDED.level,
  hourly_rate = EXCLUDED.hourly_rate,
  order_rate = EXCLUDED.order_rate,
  trip_rate = EXCLUDED.trip_rate,
  monthly_incentive_base = EXCLUDED.monthly_incentive_base,
  quarterly_incentive_base = EXCLUDED.quarterly_incentive_base,
  status = 'active';

-- Demo customers for testing order registration
INSERT INTO customers (customer_code, customer_name, phone, address, active) VALUES
('C001', 'عميل تجربة 1', '01000000001', 'عنوان عميل تجربة 1', true),
('C002', 'عميل تجربة 2', '01000000002', 'عنوان عميل تجربة 2', true),
('C003', 'عميل تجربة 3', '01000000003', 'عنوان عميل تجربة 3', true)
ON CONFLICT (customer_code) DO UPDATE SET customer_name = EXCLUDED.customer_name, phone = EXCLUDED.phone, address = EXCLUDED.address, active = true;

NOTIFY pgrst, 'reload schema';
