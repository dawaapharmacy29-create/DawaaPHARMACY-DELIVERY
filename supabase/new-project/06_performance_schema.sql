-- Performance, incentives, notifications, leaderboard schema

-- ===== PERFORMANCE SCORES =====
create table if not exists public.delivery_performance_scores (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.delivery_riders(id) on delete cascade,
  period_id uuid not null references public.delivery_payroll_periods(id) on delete cascade,
  attendance_score numeric default 0,
  speed_score numeric default 0,
  accuracy_score numeric default 0,
  success_score numeric default 0,
  internal_trip_score numeric default 0,
  manager_score numeric default 0,
  bonus_points numeric default 0,
  penalty_points numeric default 0,
  score_total numeric generated always as (
    greatest(0, least(100, coalesce(attendance_score,0) + coalesce(speed_score,0) + coalesce(accuracy_score,0) + coalesce(success_score,0) + coalesce(internal_trip_score,0) + coalesce(manager_score,0) + coalesce(bonus_points,0) - coalesce(penalty_points,0)))
  ) stored,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (rider_id, period_id)
);

-- ===== INCENTIVE RULES =====n
-- ===== INCENTIVE RULES =====
create table if not exists public.delivery_incentive_rules (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null unique,
  rule_name text,
  rule_type text not null check (rule_type in ('bonus','penalty')),
  amount_type text not null check (amount_type in ('fixed','points','percentage')),
  amount numeric not null default 0,
  severity text check (severity in ('low','medium','high','critical')),
  applies_to_level text,
  repeat_multiplier boolean default false,
  requires_review boolean default true,
  active boolean default true,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===== INCENTIVE EVENTS =====
create table if not exists public.delivery_incentive_events (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.delivery_riders(id),
  period_id uuid references public.delivery_payroll_periods(id),
  rule_id uuid references public.delivery_incentive_rules(id),
  event_type text check (event_type in ('bonus','penalty')),
  amount numeric default 0,
  points numeric default 0,
  reason text not null,
  source_type text,
  source_id uuid,
  status text default 'pending' check (status in ('pending','approved','dismissed')),
  created_by uuid references public.user_profiles(id),
  approved_by uuid references public.user_profiles(id),
  created_at timestamptz default now(),
  approved_at timestamptz
);

-- ===== NOTIFICATIONS =====
create table if not exists public.delivery_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid references public.user_profiles(id),
  rider_id uuid references public.delivery_riders(id),
  notification_type text not null,
  title text not null,
  message text not null,
  severity text default 'info' check (severity in ('info','success','warning','danger','critical')),
  status text default 'unread' check (status in ('unread','read','resolved')),
  action_url text,
  created_at timestamptz default now(),
  read_at timestamptz
);

-- ===== LEADERBOARD SNAPSHOTS =====
create table if not exists public.delivery_leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references public.delivery_payroll_periods(id),
  rider_id uuid references public.delivery_riders(id),
  rank integer,
  score numeric,
  orders_count integer default 0,
  trips_count integer default 0,
  avg_duration numeric default 0,
  success_rate numeric default 0,
  penalty_total numeric default 0,
  bonus_total numeric default 0,
  expected_incentive numeric default 0,
  created_at timestamptz default now()
);

-- ensure indexes for common queries
create index if not exists idx_perf_rider_period on public.delivery_performance_scores (rider_id, period_id);
create index if not exists idx_incentive_rider on public.delivery_incentive_events (rider_id);
create index if not exists idx_notifications_recipient on public.delivery_notifications (recipient_profile_id, rider_id, status);
create index if not exists idx_leader_period on public.delivery_leaderboard_snapshots (period_id, rank);
