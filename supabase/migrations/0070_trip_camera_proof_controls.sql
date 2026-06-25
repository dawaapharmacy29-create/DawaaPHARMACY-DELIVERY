alter table internal_trips add column if not exists proof_required boolean default true;
alter table internal_trips add column if not exists proof_image_url text;
alter table internal_trips add column if not exists proof_note text;
alter table internal_trips add column if not exists proof_captured_at timestamptz;
alter table internal_trips add column if not exists proof_uploaded_at timestamptz;
alter table internal_trips add column if not exists proof_source text;
alter table internal_trips add column if not exists proof_review_status text default 'pending';
alter table internal_trips add column if not exists proof_exception_reason text;
alter table internal_trips add column if not exists proof_exception_status text default 'none';

create index if not exists idx_internal_trips_camera_proof on internal_trips (proof_review_status, proof_required, proof_captured_at desc);
create index if not exists idx_internal_trips_proof_exception on internal_trips (proof_exception_status, trip_date desc);

create or replace view internal_trip_daily_audit as
select
  id,
  rider_id,
  rider_name,
  branch_id,
  branch_name,
  trip_date,
  work_date,
  trip_type,
  from_label,
  to_label,
  reason,
  related_invoice_number,
  has_invoice_reference,
  proof_required,
  proof_image_url,
  proof_note,
  proof_captured_at,
  proof_uploaded_at,
  proof_source,
  proof_review_status,
  proof_exception_reason,
  proof_exception_status,
  status,
  registered_at,
  created_at,
  case
    when coalesce(proof_required, true) = true and coalesce(nullif(trim(proof_image_url), ''), null) is null then 'missing_required_photo'
    when coalesce(nullif(trim(proof_image_url), ''), null) is not null and proof_captured_at is null then 'photo_without_capture_time'
    when proof_exception_status = 'pending' then 'exception_pending_review'
    when status = 'pending_approval' then 'pending_approval'
    else 'ok'
  end as audit_status
from internal_trips;
