-- Safe archive queue for approved internal trip proofs.
-- Files are never deleted by this migration. Deletion happens only after an external worker verifies the Drive copy.

alter table if exists public.internal_trips
  add column if not exists proof_archive_status text,
  add column if not exists proof_archive_requested_at timestamptz,
  add column if not exists proof_archive_drive_file_id text,
  add column if not exists proof_archive_drive_url text,
  add column if not exists proof_archive_verified_at timestamptz,
  add column if not exists proof_image_deleted_at timestamptz,
  add column if not exists proof_archive_error text;

create table if not exists public.trip_proof_archive_queue (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null unique references public.internal_trips(id) on delete cascade,
  source_url text not null,
  storage_bucket text,
  storage_path text,
  status text not null default 'queued' check (status in ('queued','processing','verified','deleted','failed')),
  attempts integer not null default 0,
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  drive_file_id text,
  drive_url text,
  source_bytes bigint,
  drive_bytes bigint,
  sha256 text,
  verified_at timestamptz,
  deleted_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create index if not exists trip_proof_archive_queue_status_idx
  on public.trip_proof_archive_queue(status, requested_at);

create or replace function public.extract_storage_bucket(p_url text)
returns text language sql immutable as $$
  select nullif((regexp_match(coalesce(p_url,''), '/storage/v1/object/(?:public|sign|authenticated)/([^/]+)/'))[1], '')
$$;

create or replace function public.extract_storage_path(p_url text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p_url,''), '^.*?/storage/v1/object/(?:public|sign|authenticated)/[^/]+/', ''), '')
$$;

create or replace function public.queue_approved_trip_proof()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_at_value timestamptz := coalesce(new.proof_archive_requested_at, now());
begin
  if new.status = 'approved' and nullif(trim(coalesce(new.proof_image_url,'')), '') is not null then
    insert into public.trip_proof_archive_queue(trip_id, source_url, storage_bucket, storage_path, status, requested_at, updated_at)
    values (
      new.id,
      new.proof_image_url,
      public.extract_storage_bucket(new.proof_image_url),
      public.extract_storage_path(new.proof_image_url),
      'queued',
      requested_at_value,
      now()
    )
    on conflict (trip_id) do update set
      source_url = excluded.source_url,
      storage_bucket = excluded.storage_bucket,
      storage_path = excluded.storage_path,
      status = case when public.trip_proof_archive_queue.status in ('verified','deleted') then public.trip_proof_archive_queue.status else 'queued' end,
      requested_at = excluded.requested_at,
      updated_at = now(),
      last_error = null;

    update public.internal_trips
    set proof_archive_status = case when proof_archive_status in ('verified','deleted') then proof_archive_status else 'queued' end,
        proof_archive_requested_at = coalesce(proof_archive_requested_at, requested_at_value),
        proof_archive_error = null
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists internal_trips_queue_proof_archive on public.internal_trips;
create trigger internal_trips_queue_proof_archive
after insert or update of status, proof_image_url on public.internal_trips
for each row execute function public.queue_approved_trip_proof();

insert into public.trip_proof_archive_queue(trip_id, source_url, storage_bucket, storage_path, status, requested_at)
select id, proof_image_url, public.extract_storage_bucket(proof_image_url), public.extract_storage_path(proof_image_url), 'queued', coalesce(approved_at, now())
from public.internal_trips
where status = 'approved'
  and nullif(trim(coalesce(proof_image_url,'')), '') is not null
  and proof_image_deleted_at is null
on conflict (trip_id) do nothing;

update public.internal_trips t
set proof_archive_status = 'queued',
    proof_archive_requested_at = coalesce(t.proof_archive_requested_at, q.requested_at)
from public.trip_proof_archive_queue q
where q.trip_id = t.id
  and t.proof_archive_status is null;

comment on table public.trip_proof_archive_queue is
  'Approved trip proof images waiting for verified Google Drive archive. Storage deletion is allowed only after status=verified.';
