-- 0063_trip_proof_alerts_view.sql
-- Read-only review queue for internal trips that need invoice/bag/request proof.

create or replace view internal_trip_proof_alerts as
select
  t.id,
  t.rider_id,
  t.rider_name,
  t.branch_id,
  t.branch_name,
  t.work_date,
  t.trip_date,
  t.trip_type,
  t.from_label,
  t.to_label,
  t.reason,
  t.related_invoice_number,
  t.has_invoice_reference,
  t.proof_image_url,
  t.proof_note,
  t.status,
  t.review_status,
  t.created_at,
  case
    when coalesce(t.has_invoice_reference, false) = false
     and coalesce(nullif(trim(t.proof_image_url), ''), null) is null
      then 'missing_proof'
    when coalesce(t.has_invoice_reference, false) = false
      then 'manual_proof_review'
    else 'invoice_reference_review'
  end as alert_type,
  case
    when coalesce(t.has_invoice_reference, false) = false
     and coalesce(nullif(trim(t.proof_image_url), ''), null) is null
      then 'high'
    else 'medium'
  end as alert_level
from internal_trips t
where coalesce(t.status, '') not in ('rejected', 'cancelled', 'canceled')
  and (
    coalesce(t.has_invoice_reference, false) = false
    or coalesce(nullif(trim(t.proof_image_url), ''), null) is not null
  );
