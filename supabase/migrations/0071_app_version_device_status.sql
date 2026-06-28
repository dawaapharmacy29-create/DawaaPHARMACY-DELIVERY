alter table rider_device_status add column if not exists app_version text;
alter table rider_device_status add column if not exists app_version_label text;
alter table rider_device_status add column if not exists device_label text;

create index if not exists idx_rider_device_status_app_version on rider_device_status (app_version);

create or replace view rider_app_version_admin_view as
select
  s.rider_id,
  coalesce(s.rider_name, r.name, r.username) as rider_name,
  coalesce(s.branch_name, r.branch_name) as branch_name,
  s.last_seen_at,
  s.device_label,
  s.device_user_agent,
  s.platform,
  s.app_version,
  s.app_version_label,
  case
    when s.app_version is null or trim(s.app_version) = '' then 'unknown'
    when s.app_version <> '2026.06.28.1' then 'old'
    else 'current'
  end as app_version_status,
  s.online,
  s.warning_level,
  s.battery_percent
from rider_device_status s
left join riders r on r.id = s.rider_id;
