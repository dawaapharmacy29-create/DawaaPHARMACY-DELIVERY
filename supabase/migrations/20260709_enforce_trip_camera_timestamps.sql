-- Camera-only trip proof audit support.
-- Ensures trip registration time and camera capture/upload timestamps are always available for admin review.

do $$
begin
  if to_regclass('public.internal_trips') is null then
    return;
  end if;

  alter table public.internal_trips
    add column if not exists proof_captured_at timestamptz,
    add column if not exists proof_uploaded_at timestamptz,
    add column if not exists proof_source text,
    add column if not exists proof_image_url text,
    add column if not exists proof_image_path text,
    add column if not exists evidence_status text,
    add column if not exists proof_review_status text;

  -- Backfill registration/capture defaults for older rows so admin pages always have a time to show.
  update public.internal_trips
  set proof_captured_at = coalesce(proof_captured_at, registered_at, created_at, now())
  where proof_captured_at is null
    and (proof_image_url is not null or proof_image_path is not null);

  update public.internal_trips
  set proof_uploaded_at = coalesce(proof_uploaded_at, proof_captured_at, registered_at, created_at, now())
  where proof_uploaded_at is null
    and (proof_image_url is not null or proof_image_path is not null);

  update public.internal_trips
  set proof_source = coalesce(nullif(proof_source, ''), 'camera')
  where (proof_image_url is not null or proof_image_path is not null)
    and coalesce(proof_source, '') = '';
end $$;

create or replace view public.internal_trips_camera_audit as
select
  id,
  rider_id,
  rider_name,
  branch_id,
  branch_name,
  trip_date,
  work_date,
  from_label,
  to_label,
  reason,
  status,
  review_status,
  evidence_status,
  proof_review_status,
  proof_source,
  proof_image_url,
  proof_image_path,
  registered_at,
  proof_captured_at,
  proof_uploaded_at,
  created_at,
  updated_at,
  case
    when proof_image_url is not null or proof_image_path is not null then 'camera_proof_present'
    when evidence_status = 'pending_upload' or proof_review_status = 'pending_upload' then 'camera_proof_pending_upload'
    else 'missing_camera_proof'
  end as camera_audit_status,
  extract(epoch from (coalesce(proof_uploaded_at, updated_at, created_at, now()) - coalesce(proof_captured_at, registered_at, created_at, now())))::integer as seconds_between_capture_and_upload
from public.internal_trips;

grant select on public.internal_trips_camera_audit to anon, authenticated;
