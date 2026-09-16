-- Show the exact trip registration time (Cairo local time) in the admin trips review cards.
-- The current TripsFast UI already renders `trip_date`; keeping the display enhancement
-- in the RPC avoids an extra frontend query and preserves the raw timestamps in the payload.

create or replace function public.admin_trips_fast(
  p_period_start date,
  p_period_end date,
  p_status text default null,
  p_proof text default null,
  p_trip_type text default null,
  p_rider_id uuid default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
) returns jsonb
language sql
set search_path to 'public'
as $function$
with base as (
  select
    t.id,t.rider_id,t.rider_name,t.branch_id,t.branch_name,
    (to_char(coalesce(t.trip_date,t.work_date),'DD-MM-YYYY') ||
      coalesce(' · ' || to_char(coalesce(t.registered_at,t.created_at) at time zone 'Africa/Cairo','HH24:MI'),'')
    ) as trip_date,
    t.work_date,t.trip_type,
    t.from_label,t.to_label,t.reason,t.related_invoice_number,t.has_invoice_reference,
    t.proof_required,t.proof_image_url,t.proof_note,t.proof_captured_at,t.proof_uploaded_at,t.proof_source,
    t.proof_review_status,t.proof_exception_reason,t.proof_exception_status,t.status,t.review_status,
    t.needs_review,t.rejection_reason,t.approved_at,t.registered_at,t.created_at,t.trip_rate,t.trip_earning,
    case
      when coalesce(t.proof_required,true)=true and coalesce(nullif(trim(t.proof_image_url),''),null) is null then 'missing_required_photo'
      when coalesce(nullif(trim(t.proof_image_url),''),null) is not null and t.proof_captured_at is null then 'photo_without_capture_time'
      when t.proof_exception_status='pending' then 'exception_pending_review'
      when t.status='pending_approval' then 'pending_approval'
      else 'ok'
    end as audit_status
  from public.internal_trips t
  where coalesce(t.work_date,t.trip_date) between p_period_start and p_period_end
),
summary as (
  select jsonb_build_object(
    'all',count(*),
    'with_photo',count(*) filter(where coalesce(nullif(trim(proof_image_url),''),null) is not null),
    'without_photo',count(*) filter(where coalesce(nullif(trim(proof_image_url),''),null) is null),
    'pending',count(*) filter(where status='pending_approval'),
    'approved',count(*) filter(where status in ('approved','completed')),
    'rejected',count(*) filter(where status='rejected'),
    'proof_exceptions',count(*) filter(where proof_exception_status='pending')
  ) value from base
),
filtered as (
  select * from base
  where (p_status is null or p_status='' or p_status='all' or status=p_status)
    and (p_proof is null or p_proof='' or p_proof='all'
      or (p_proof='with_photo' and coalesce(nullif(trim(proof_image_url),''),null) is not null)
      or (p_proof='without_photo' and coalesce(nullif(trim(proof_image_url),''),null) is null))
    and (p_trip_type is null or p_trip_type='' or p_trip_type='all' or trip_type=p_trip_type)
    and (p_rider_id is null or rider_id=p_rider_id)
    and (coalesce(trim(p_search),'')=''
      or coalesce(rider_name,'') ilike '%'||trim(p_search)||'%'
      or coalesce(branch_name,'') ilike '%'||trim(p_search)||'%'
      or coalesce(reason,'') ilike '%'||trim(p_search)||'%'
      or coalesce(from_label,'') ilike '%'||trim(p_search)||'%'
      or coalesce(to_label,'') ilike '%'||trim(p_search)||'%'
      or coalesce(related_invoice_number,'') ilike '%'||trim(p_search)||'%')
),
page as (
  select * from filtered
  order by registered_at desc nulls last
  limit least(greatest(p_limit,1),200)
  offset greatest(p_offset,0)
)
select jsonb_build_object(
  'success',true,
  'summary',(select value from summary),
  'total_filtered',(select count(*) from filtered),
  'rows',coalesce((select jsonb_agg(to_jsonb(page) order by registered_at desc nulls last) from page),'[]'::jsonb),
  'limit',least(greatest(p_limit,1),200),
  'offset',greatest(p_offset,0)
);
$function$;
