-- 0064_rider_device_status_battery.sql
-- Stores live rider device battery/online status and exposes low-battery alerts.

create table if not exists rider_device_status (
  rider_id uuid primary key,
  rider_name text,
  branch_id uuid,
  branch_name text,
  battery_level numeric,
  battery_percent integer,
  is_charging boolean,
  battery_supported boolean default false,
  online boolean default true,
  warning_level text default 'unsupported',
  device_user_agent text,
  platform text,
  last_seen_at timestamptz default now(),
  last_sync_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_rider_device_status_warning on rider_device_status (warning_level, battery_percent);
create index if not exists idx_rider_device_status_last_seen on rider_device_status (last_seen_at desc);

create or replace view rider_battery_overview as
select
  s.rider_id,
  coalesce(s.rider_name, r.name, r.username) as rider_name,
  coalesce(s.branch_name, r.branch_name) as branch_name,
  s.battery_percent,
  s.is_charging,
  s.battery_supported,
  s.online,
  s.warning_level,
  s.last_seen_at,
  case
    when s.battery_supported is false then 'unsupported'
    when s.online is false then 'offline'
    when s.is_charging is true then 'charging'
    when s.battery_percent <= 10 then 'critical'
    when s.battery_percent <= 20 then 'low'
    else 'safe'
  end as battery_alert_level,
  case
    when s.battery_supported is false then 'المتصفح لا يدعم قراءة البطارية'
    when s.online is false then 'الجهاز غير متصل حالياً'
    when s.is_charging is true then 'الجهاز على الشاحن'
    when s.battery_percent <= 10 then 'البطارية حرجة ويجب الشحن فوراً'
    when s.battery_percent <= 20 then 'البطارية منخفضة ويجب تنبيه الدليفري بالشحن'
    else 'آمن'
  end as battery_alert_message
from rider_device_status s
left join riders r on r.id = s.rider_id;
