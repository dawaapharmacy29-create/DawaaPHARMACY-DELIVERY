-- 56_delivery_intelligence_suite.sql
-- طبقة البيانات للعمليات الحية، إثبات التسليم، الكاش، التنبيهات والحماية.

alter table if exists public.delivery_orders
  add column if not exists delivery_proof_photo_url text,
  add column if not exists delivery_proof_captured_at timestamptz,
  add column if not exists payment_type text not null default 'cash',
  add column if not exists cash_collected numeric,
  add column if not exists cash_collected_at timestamptz,
  add column if not exists cash_collected_by text,
  add column if not exists cash_handover_id uuid;

create table if not exists public.delivery_order_notifications (
  id uuid primary key default gen_random_uuid(), order_id text,
  notification_type text not null, channel text not null default 'whatsapp', recipient_phone text,
  message_preview text, sent_at timestamptz default now(), status text default 'sent', created_at timestamptz default now()
);
alter table public.delivery_order_notifications drop constraint if exists delivery_order_notifications_order_id_fkey;
alter table public.delivery_order_notifications alter column order_id type text using order_id::text;

create table if not exists public.daily_cash_handovers (
  id uuid primary key default gen_random_uuid(), rider_id uuid not null references public.riders(id), branch_id uuid references public.branches(id),
  handover_date date not null default current_date, expected_amount numeric not null default 0, actual_amount numeric not null default 0,
  variance numeric generated always as (actual_amount - expected_amount) stored, handover_photo_url text,
  received_by text, received_by_name text, notes text, status text not null default 'pending', created_at timestamptz default now(),
  unique (rider_id, handover_date)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_orders_cash_handover_fk') then
    alter table public.delivery_orders add constraint delivery_orders_cash_handover_fk foreign key (cash_handover_id) references public.daily_cash_handovers(id) on delete set null;
  end if;
end $$;

create table if not exists public.fraud_signals (
  id uuid primary key default gen_random_uuid(), order_id text,
  rider_id uuid not null references public.riders(id), signal_type text not null, severity text not null default 'medium',
  description text not null, status text not null default 'open', reviewed_by text, reviewed_at timestamptz,
  resolution_notes text, auto_detected boolean not null default true, created_at timestamptz default now()
);
alter table public.fraud_signals drop constraint if exists fraud_signals_order_id_fkey;
alter table public.fraud_signals alter column order_id type text using order_id::text;
create unique index if not exists uq_fraud_signal_order_type on public.fraud_signals(order_id, signal_type) where order_id is not null;

create table if not exists public.delivery_customer_ratings (
  id uuid primary key default gen_random_uuid(), order_id text,
  rider_id uuid references public.riders(id), customer_code text, customer_name text,
  rating int check (rating between 1 and 5), speed_rating int check (speed_rating between 1 and 5),
  behavior_rating int check (behavior_rating between 1 and 5), comment text, rating_token text unique,
  submitted_at timestamptz, created_at timestamptz default now()
);
alter table public.delivery_customer_ratings drop constraint if exists delivery_customer_ratings_order_id_fkey;
alter table public.delivery_customer_ratings alter column order_id type text using order_id::text;

create table if not exists public.smart_delivery_alerts (
  id uuid primary key default gen_random_uuid(), alert_type text not null, severity text not null default 'warning',
  title text not null, description text, related_order_id text,
  related_rider_id uuid references public.riders(id) on delete set null, branch_id uuid references public.branches(id) on delete set null,
  status text not null default 'active', auto_resolved_at timestamptz, resolved_by text, resolved_at timestamptz, created_at timestamptz default now()
);
alter table public.smart_delivery_alerts drop constraint if exists smart_delivery_alerts_related_order_id_fkey;
alter table public.smart_delivery_alerts alter column related_order_id type text using related_order_id::text;
create index if not exists idx_smart_alerts_active on public.smart_delivery_alerts(status, created_at desc) where status = 'active';
create index if not exists idx_cash_handovers_date on public.daily_cash_handovers(handover_date, branch_id);
create index if not exists idx_fraud_signals_status on public.fraud_signals(status, severity, created_at desc);

alter table public.delivery_order_notifications enable row level security;
alter table public.daily_cash_handovers enable row level security;
alter table public.fraud_signals enable row level security;
alter table public.delivery_customer_ratings enable row level security;
alter table public.smart_delivery_alerts enable row level security;

drop policy if exists delivery_intelligence_authenticated_read_notifications on public.delivery_order_notifications;
create policy delivery_intelligence_authenticated_read_notifications on public.delivery_order_notifications for select to authenticated using (true);
drop policy if exists delivery_intelligence_authenticated_manage_cash on public.daily_cash_handovers;
create policy delivery_intelligence_authenticated_manage_cash on public.daily_cash_handovers for all to authenticated using (true) with check (true);
drop policy if exists delivery_intelligence_authenticated_manage_fraud on public.fraud_signals;
create policy delivery_intelligence_authenticated_manage_fraud on public.fraud_signals for all to authenticated using (true) with check (true);
drop policy if exists delivery_intelligence_authenticated_read_alerts on public.smart_delivery_alerts;
create policy delivery_intelligence_authenticated_read_alerts on public.smart_delivery_alerts for select to authenticated using (true);

insert into storage.buckets (id, name, public)
values ('delivery-proofs', 'delivery-proofs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists delivery_proofs_authenticated_upload on storage.objects;
create policy delivery_proofs_authenticated_upload on storage.objects for insert to authenticated
with check (bucket_id = 'delivery-proofs');
drop policy if exists delivery_proofs_public_read on storage.objects;
create policy delivery_proofs_public_read on storage.objects for select to public
using (bucket_id = 'delivery-proofs');

drop function if exists public.rider_log_customer_notification(text, uuid, text, text);
create or replace function public.rider_log_customer_notification(
  p_token text, p_order_id text, p_recipient_phone text, p_message_preview text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session record; v_order record;
begin
  select * into v_session from public.rider_sessions
  where session_token = p_token and revoked_at is null and (expires_at is null or expires_at > now()) limit 1;
  if not found then return jsonb_build_object('success', false, 'error', 'invalid_session'); end if;
  select o.* into v_order from public.delivery_orders o
  join public.rider_accounts a on a.rider_id = o.rider_id
  where o.id = p_order_id and a.id = v_session.account_id limit 1;
  if not found then return jsonb_build_object('success', false, 'error', 'order_not_allowed'); end if;
  insert into public.delivery_order_notifications(order_id, notification_type, channel, recipient_phone, message_preview, status)
  values (p_order_id, 'customer_dispatch_notification', 'whatsapp', p_recipient_phone, left(p_message_preview, 500), 'opened');
  return jsonb_build_object('success', true);
end $$;
grant execute on function public.rider_log_customer_notification(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
