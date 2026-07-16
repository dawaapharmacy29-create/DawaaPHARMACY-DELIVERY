with duplicate_groups as (
  select
    client_request_id,
    count(*) as duplicate_count,
    count(*) - 1 as extra_duplicate_rows,
    count(distinct rider_id) as rider_count,
    count(distinct coalesce(trip_type::text, '')) as trip_type_count,
    count(distinct coalesce(from_label, '')) as from_label_count,
    count(distinct coalesce(to_label, '')) as to_label_count,
    count(distinct coalesce(reason, '')) as reason_count,
    count(distinct coalesce(proof_sha256, '')) as proof_sha256_count,
    min(registered_at) as oldest_registered_at,
    max(registered_at) as newest_registered_at,
    bool_or(coalesce(nullif(trim(proof_image_url), ''), null) is not null) as has_proof_image_url,
    bool_or(coalesce(nullif(trim(proof_image_path), ''), null) is not null) as has_proof_image_path,
    bool_or(coalesce(nullif(trim(proof_sha256), ''), null) is not null) as has_proof_sha256,
    array_agg(id order by registered_at) as trip_ids,
    array_agg(distinct rider_id) as rider_ids
  from public.internal_trips
  where client_request_id is not null
  group by client_request_id
  having count(*) > 1
)
select
  client_request_id,
  duplicate_count,
  extra_duplicate_rows,
  rider_count,
  rider_ids,
  oldest_registered_at,
  newest_registered_at,
  has_proof_image_url,
  has_proof_image_path,
  has_proof_sha256,
  case
    when rider_count = 1
      and trip_type_count = 1
      and from_label_count = 1
      and to_label_count = 1
      and reason_count = 1
      and proof_sha256_count <= 1
    then 'likely_same_trip_duplicate'
    else 'possibly_different_trips_or_data_conflict'
  end as duplicate_classification,
  trip_ids
from duplicate_groups
order by duplicate_count desc, newest_registered_at desc;

select
  count(*) as duplicated_client_request_groups,
  coalesce(sum(duplicate_count), 0) as duplicated_rows_total,
  coalesce(sum(extra_duplicate_rows), 0) as extra_duplicate_rows_total
from (
  select count(*) as duplicate_count, count(*) - 1 as extra_duplicate_rows
  from public.internal_trips
  where client_request_id is not null
  group by client_request_id
  having count(*) > 1
) grouped_duplicates;

select
  rider_id,
  trip_type,
  from_label,
  to_label,
  date_trunc('minute', registered_at) as minute_bucket,
  count(*) as trips_count,
  min(registered_at) as oldest_registered_at,
  max(registered_at) as newest_registered_at,
  bool_or(coalesce(nullif(trim(proof_image_url), ''), null) is not null) as has_proof_image_url,
  bool_or(coalesce(nullif(trim(proof_image_path), ''), null) is not null) as has_proof_image_path,
  bool_or(coalesce(nullif(trim(proof_sha256), ''), null) is not null) as has_proof_sha256,
  count(distinct coalesce(client_request_id, '')) as client_request_id_count,
  count(distinct coalesce(proof_sha256, '')) as proof_sha256_count,
  case
    when count(distinct coalesce(client_request_id, '')) <= 1
      and count(distinct coalesce(proof_sha256, '')) <= 1
    then 'likely_same_trip_duplicate'
    else 'possibly_different_trips_or_data_conflict'
  end as duplicate_classification,
  array_agg(id order by registered_at) as trip_ids
from public.internal_trips
group by
  rider_id,
  trip_type,
  from_label,
  to_label,
  date_trunc('minute', registered_at)
having count(*) > 1
order by minute_bucket desc;
