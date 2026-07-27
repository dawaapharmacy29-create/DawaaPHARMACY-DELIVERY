-- Read-only diagnostics for mobile login problems.
-- Run in the delivery Supabase SQL editor. It does not reveal or change PIN values.

select
  a.id as account_id,
  a.rider_id,
  a.username,
  a.display_name,
  a.role,
  a.status,
  a.pin_enabled,
  a.must_change_pin,
  a.failed_attempts,
  a.locked_until,
  a.approved_device_id,
  a.bypass_device_lock,
  a.last_login_at,
  r.name as rider_name,
  r.status as rider_status,
  r.branch_id
from public.rider_accounts a
left join public.riders r on r.id = a.rider_id
where lower(coalesce(a.display_name,'')) like any (array['%مجدي%','%عبد الرحمن%','%عبدالرحمن%','%معاذ%'])
   or lower(coalesce(a.username,'')) like any (array['%مجدي%','%عبد الرحمن%','%عبدالرحمن%','%moaz%'])
order by a.display_name, a.username;

select
  d.account_id,
  a.display_name,
  a.username,
  d.device_id,
  d.device_label,
  d.status as device_status,
  d.first_seen_at,
  d.last_seen_at,
  d.approved_at,
  d.revoked_at
from public.rider_account_devices d
join public.rider_accounts a on a.id = d.account_id
where lower(coalesce(a.display_name,'')) like any (array['%مجدي%','%عبد الرحمن%','%عبدالرحمن%','%معاذ%'])
   or lower(coalesce(a.username,'')) like any (array['%مجدي%','%عبد الرحمن%','%عبدالرحمن%','%moaz%'])
order by a.display_name, d.last_seen_at desc;
