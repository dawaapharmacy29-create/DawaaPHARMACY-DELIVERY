-- Cycle-based storage archiving control. Non-destructive: no existing rows or files are deleted.

alter table if exists public.delivery_cycle_archive_assets
  add column if not exists source_table text null,
  add column if not exists source_record_id uuid null,
  add column if not exists source_column text null,
  add column if not exists bucket_id text not null default 'delivery-receipts',
  add column if not exists storage_path text null,
  add column if not exists object_bytes bigint not null default 0,
  add column if not exists sha256 text null,
  add column if not exists archive_provider text not null default 'google_drive',
  add column if not exists archive_path text null,
  add column if not exists archive_file_id text null,
  add column if not exists archive_link text null,
  add column if not exists archived_at timestamptz null,
  add column if not exists verified_at timestamptz null,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists cleanup_eligible boolean not null default false,
  add column if not exists deleted_from_storage_at timestamptz null,
  add column if not exists last_error text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists delivery_cycle_archive_assets_cycle_path_uidx
  on public.delivery_cycle_archive_assets(cycle_id, bucket_id, storage_path)
  where storage_path is not null;

create index if not exists delivery_cycle_archive_assets_status_idx
  on public.delivery_cycle_archive_assets(cycle_id, verification_status, cleanup_eligible);

create or replace function public.get_delivery_cycle_storage_inventory(
  p_period_start date,
  p_period_end date
)
returns table (
  source_table text,
  source_record_id uuid,
  source_column text,
  storage_path text,
  operational_date date,
  rider_id uuid,
  rider_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with assets as (
    select 'delivery_orders'::text as source_table, o.id as source_record_id,
      'receipt_image_path'::text as source_column, nullif(trim(o.receipt_image_path), '') as storage_path,
      coalesce(o.delivery_date, o.work_date, o.registered_at::date, o.created_at::date) as operational_date,
      o.rider_id, o.rider_name
    from public.delivery_orders o
    where coalesce(o.delivery_date, o.work_date, o.registered_at::date, o.created_at::date)
      between p_period_start and p_period_end
    union all
    select 'internal_trips'::text, t.id, 'proof_image_path'::text,
      nullif(trim(t.proof_image_path), ''),
      coalesce(t.trip_date, t.work_date, t.registered_at::date, t.created_at::date),
      t.rider_id, t.rider_name
    from public.internal_trips t
    where coalesce(t.trip_date, t.work_date, t.registered_at::date, t.created_at::date)
      between p_period_start and p_period_end
      and t.duplicate_of is null
  )
  select * from assets where storage_path is not null;
$$;

grant execute on function public.get_delivery_cycle_storage_inventory(date, date) to authenticated;

create or replace function public.mark_cycle_archive_asset_verified(
  p_cycle_id uuid, p_source_table text, p_source_record_id uuid, p_source_column text,
  p_storage_path text, p_object_bytes bigint, p_sha256 text, p_archive_path text,
  p_archive_file_id text, p_archive_link text, p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.delivery_cycle_archive_assets (
    cycle_id, source_table, source_record_id, source_column, bucket_id,
    storage_path, object_bytes, sha256, archive_provider, archive_path,
    archive_file_id, archive_link, archived_at, verified_at,
    verification_status, cleanup_eligible, metadata
  ) values (
    p_cycle_id, p_source_table, p_source_record_id, p_source_column, 'delivery-receipts',
    p_storage_path, coalesce(p_object_bytes, 0), p_sha256, 'google_drive', p_archive_path,
    p_archive_file_id, p_archive_link, now(), now(), 'verified', false, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (cycle_id, bucket_id, storage_path) where storage_path is not null
  do update set
    source_table = excluded.source_table,
    source_record_id = excluded.source_record_id,
    source_column = excluded.source_column,
    object_bytes = excluded.object_bytes,
    sha256 = excluded.sha256,
    archive_path = excluded.archive_path,
    archive_file_id = excluded.archive_file_id,
    archive_link = excluded.archive_link,
    archived_at = excluded.archived_at,
    verified_at = excluded.verified_at,
    verification_status = 'verified',
    last_error = null,
    metadata = delivery_cycle_archive_assets.metadata || excluded.metadata
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.mark_cycle_archive_asset_verified(uuid,text,uuid,text,text,bigint,text,text,text,text,jsonb) from public, anon, authenticated;
