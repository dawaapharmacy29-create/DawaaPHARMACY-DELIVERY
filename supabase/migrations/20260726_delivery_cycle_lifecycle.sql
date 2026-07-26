-- Delivery cycle lifecycle: 26th through 25th.
-- Non-destructive foundation for closing, snapshotting and archiving monthly delivery data.

create table if not exists public.delivery_cycles (
  id uuid primary key default gen_random_uuid(),
  cycle_key text not null unique,
  cycle_label text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open','under_review','approved','archived','locked')),
  reconciliation_status text not null default 'not_started' check (reconciliation_status in ('not_started','in_progress','differences','ready','approved')),
  reports_status text not null default 'not_started' check (reports_status in ('not_started','in_progress','ready','approved')),
  archive_status text not null default 'not_started' check (archive_status in ('not_started','in_progress','verified','cleaned')),
  approved_at timestamptz null,
  approved_by text null,
  archived_at timestamptz null,
  locked_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (extract(day from period_start) = 26),
  check (extract(day from period_end) = 25)
);

create index if not exists delivery_cycles_period_idx
  on public.delivery_cycles(period_start desc, period_end desc);

create table if not exists public.rider_cycle_reports (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.delivery_cycles(id) on delete restrict,
  rider_id uuid not null,
  rider_name text not null,
  branch_id uuid null,
  branch_name text null,
  orders_total integer not null default 0,
  orders_delivered integer not null default 0,
  orders_1x integer not null default 0,
  orders_1_5x integer not null default 0,
  orders_failed integer not null default 0,
  orders_cancelled integer not null default 0,
  orders_duplicate_excluded integer not null default 0,
  orders_other_excluded integer not null default 0,
  trips_total integer not null default 0,
  trips_approved integer not null default 0,
  trips_rejected integer not null default 0,
  trips_pending integer not null default 0,
  trips_excluded integer not null default 0,
  delivered_invoice_value numeric not null default 0,
  orders_incentive numeric not null default 0,
  trips_incentive numeric not null default 0,
  bonuses numeric not null default 0,
  penalties numeric not null default 0,
  manual_adjustment numeric not null default 0,
  final_due numeric not null default 0,
  report_status text not null default 'draft' check (report_status in ('draft','ready','approved','locked')),
  snapshot jsonb not null default '{}'::jsonb,
  approved_at timestamptz null,
  approved_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cycle_id, rider_id)
);

create index if not exists rider_cycle_reports_cycle_idx
  on public.rider_cycle_reports(cycle_id, report_status, rider_name);

create table if not exists public.delivery_cycle_archive_assets (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.delivery_cycles(id) on delete restrict,
  asset_type text not null check (asset_type in ('orders_export','trips_export','reports_export','storage_manifest','database_snapshot','other')),
  provider text not null default 'google_drive',
  provider_file_id text null,
  archive_path text not null,
  bytes bigint null,
  sha256 text null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','failed')),
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(cycle_id, asset_type, archive_path)
);

create table if not exists public.delivery_cycle_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.delivery_cycles(id) on delete restrict,
  run_mode text not null default 'dry_run' check (run_mode in ('dry_run','execute')),
  target text not null check (target in ('storage_images','order_details','trip_details','temporary_data')),
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','cancelled')),
  proposed_objects integer not null default 0,
  proposed_rows integer not null default 0,
  proposed_bytes bigint not null default 0,
  removed_objects integer not null default 0,
  removed_rows integer not null default 0,
  removed_bytes bigint not null default 0,
  manifest_path text null,
  error_message text null,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now()
);

create or replace function public.delivery_cycle_key(p_start date, p_end date)
returns text
language sql
immutable
as $$
  select to_char(p_start, 'YYYY-MM-DD') || '_' || to_char(p_end, 'YYYY-MM-DD');
$$;

create or replace function public.ensure_delivery_cycle(p_start date, p_end date, p_label text default null)
returns public.delivery_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.delivery_cycles;
  v_key text;
begin
  if extract(day from p_start) <> 26 or extract(day from p_end) <> 25 then
    raise exception 'Delivery cycles must start on day 26 and end on day 25';
  end if;
  if p_end < p_start then
    raise exception 'Invalid cycle date range';
  end if;

  v_key := public.delivery_cycle_key(p_start, p_end);
  insert into public.delivery_cycles(cycle_key, cycle_label, period_start, period_end, status)
  values (
    v_key,
    coalesce(nullif(trim(p_label), ''), 'دورة ' || to_char(p_end, 'YYYY-MM')),
    p_start,
    p_end,
    case when current_date between p_start and p_end then 'open' else 'under_review' end
  )
  on conflict (cycle_key) do update
    set cycle_label = coalesce(nullif(trim(excluded.cycle_label), ''), public.delivery_cycles.cycle_label),
        updated_at = now()
  returning * into v_cycle;
  return v_cycle;
end;
$$;

create or replace function public.delivery_cycle_close_readiness(p_cycle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cycle public.delivery_cycles;
  v_pending_orders integer := 0;
  v_pending_trips integer := 0;
  v_unapproved_reports integer := 0;
  v_unverified_assets integer := 0;
begin
  select * into v_cycle from public.delivery_cycles where id = p_cycle_id;
  if v_cycle.id is null then
    return jsonb_build_object('ready', false, 'error', 'cycle_not_found');
  end if;

  if to_regclass('public.delivery_orders') is not null then
    execute format(
      'select count(*) from public.delivery_orders where coalesce(delivery_date, work_date, registered_at::date, created_at::date) between $1 and $2 and coalesce(status,'''') not in (''delivered'',''failed'',''cancelled'',''canceled'') and coalesce(deleted_at, null) is null'
    ) into v_pending_orders using v_cycle.period_start, v_cycle.period_end;
  end if;

  if to_regclass('public.internal_trips') is not null then
    execute format(
      'select count(*) from public.internal_trips where coalesce(trip_date, work_date, registered_at::date, created_at::date) between $1 and $2 and coalesce(status, review_status, '''') like ''pending%%'' and duplicate_of is null'
    ) into v_pending_trips using v_cycle.period_start, v_cycle.period_end;
  end if;

  select count(*) into v_unapproved_reports
  from public.rider_cycle_reports
  where cycle_id = p_cycle_id and report_status not in ('approved','locked');

  select count(*) into v_unverified_assets
  from public.delivery_cycle_archive_assets
  where cycle_id = p_cycle_id and verification_status <> 'verified';

  return jsonb_build_object(
    'ready', v_pending_orders = 0 and v_pending_trips = 0 and v_unapproved_reports = 0,
    'pending_orders', v_pending_orders,
    'pending_trips', v_pending_trips,
    'unapproved_reports', v_unapproved_reports,
    'unverified_archive_assets', v_unverified_assets,
    'storage_cleanup_allowed', v_cycle.status in ('approved','archived','locked') and v_unapproved_reports = 0 and v_unverified_assets = 0
  );
end;
$$;

grant select on public.delivery_cycles, public.rider_cycle_reports, public.delivery_cycle_archive_assets, public.delivery_cycle_cleanup_runs to anon, authenticated;
grant execute on function public.ensure_delivery_cycle(date, date, text) to authenticated;
grant execute on function public.delivery_cycle_close_readiness(uuid) to authenticated;

comment on table public.delivery_cycles is 'Monthly delivery operational cycles, always 26th through 25th.';
comment on table public.rider_cycle_reports is 'Immutable-ready monthly rider snapshots used after detailed rows and images are archived.';
comment on table public.delivery_cycle_archive_assets is 'Verified external archive manifests and exports for a closed delivery cycle.';
comment on table public.delivery_cycle_cleanup_runs is 'Audited dry-run and execution records for post-approval storage/data cleanup.';
