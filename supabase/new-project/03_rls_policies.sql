-- RLS and privileges for Dawaa Delivery

-- Enable Row Level Security on all delivery tables and user_profiles
alter table public.user_profiles enable row level security;
alter table public.delivery_login_aliases enable row level security;
alter table public.delivery_branches enable row level security;
alter table public.delivery_locations enable row level security;
alter table public.delivery_riders enable row level security;
alter table public.delivery_customers enable row level security;
alter table public.delivery_attendance enable row level security;
alter table public.delivery_runs enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_internal_trips enable row level security;
alter table public.delivery_payroll_periods enable row level security;
alter table public.delivery_payroll_runs enable row level security;
alter table public.delivery_payroll_adjustments enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.delivery_audit_log enable row level security;
alter table public.delivery_incidents enable row level security;

-- USER PROFILES
create policy user_profiles_select_self_or_admin on public.user_profiles
  for select using (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or id = auth.uid()::uuid
    )
  );

create policy user_profiles_insert_self on public.user_profiles
  for insert with check (
    auth.uid() is not null and id = auth.uid()::uuid
  );

create policy user_profiles_update_self_or_admin on public.user_profiles
  for update using (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or id = auth.uid()::uuid
    )
  ) with check (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or id = auth.uid()::uuid
    )
  );

-- LOGIN ALIASES
create policy delivery_login_aliases_admin_select on public.delivery_login_aliases
  for select using (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

create policy delivery_login_aliases_admin_modify on public.delivery_login_aliases
  for insert, update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- BRANCHES
create policy delivery_branches_select_authenticated on public.delivery_branches
  for select using (
    auth.uid() is not null
  );

create policy delivery_branches_admin_modify on public.delivery_branches
  for insert, update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- LOCATIONS
create policy delivery_locations_select_authenticated on public.delivery_locations
  for select using (
    auth.uid() is not null
  );

create policy delivery_locations_admin_modify on public.delivery_locations
  for insert, update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- RIDERS
create policy delivery_riders_select on public.delivery_riders
  for select using (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or (public.delivery_current_user_role() = 'shift_manager' and branch_id = public.delivery_current_user_branch_id())
      or user_id = auth.uid()::uuid
    )
  );

create policy delivery_riders_insert_admin on public.delivery_riders
  for insert with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

create policy delivery_riders_update_self_or_admin on public.delivery_riders
  for update using (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or user_id = auth.uid()::uuid
    )
  ) with check (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or user_id = auth.uid()::uuid
    )
  );

-- CUSTOMERS
create policy delivery_customers_select on public.delivery_customers
  for select using (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or (public.delivery_current_user_role() = 'shift_manager' and branch_id = public.delivery_current_user_branch_id())
      or exists (select 1 from public.delivery_riders r where r.user_id = auth.uid()::uuid and r.branch_id = branch_id)
    )
  );

create policy delivery_customers_insert_admin on public.delivery_customers
  for insert with check (
    public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
  );

create policy delivery_customers_update_admin on public.delivery_customers
  for update using (
    public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
  );

-- ATTENDANCE
create policy delivery_attendance_select on public.delivery_attendance
  for select using (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or (public.delivery_current_user_role() = 'shift_manager' and branch_id = public.delivery_current_user_branch_id())
      or exists (select 1 from public.delivery_riders r where r.id = rider_id and r.user_id = auth.uid()::uuid)
    )
  );

create policy delivery_attendance_insert_self on public.delivery_attendance
  for insert with check (
    auth.uid() is not null
    and exists (select 1 from public.delivery_riders r where r.id = new.rider_id and r.user_id = auth.uid()::uuid)
  );

-- DELIVERY RUNS
create policy delivery_runs_select on public.delivery_runs
  for select using (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or (public.delivery_current_user_role() = 'shift_manager' and branch_id = public.delivery_current_user_branch_id())
      or exists (select 1 from public.delivery_riders r where r.id = rider_id and r.user_id = auth.uid()::uuid)
    )
  );

create policy delivery_runs_insert_admin on public.delivery_runs
  for insert with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

create policy delivery_runs_update_admin on public.delivery_runs
  for update with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- ORDERS
create policy delivery_orders_select on public.delivery_orders
  for select using (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or exists (select 1 from public.delivery_riders r where r.id = rider_id and r.user_id = auth.uid()::uuid)
      or exists (select 1 from public.delivery_runs dr where dr.id = trip_id and dr.branch_id = public.delivery_current_user_branch_id() and public.delivery_current_user_role() = 'shift_manager')
    )
  );

create policy delivery_orders_insert on public.delivery_orders
  for insert with check (
    auth.uid() is not null
    and (
      exists (select 1 from public.delivery_riders r where r.id = new.rider_id and r.user_id = auth.uid()::uuid)
      or public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
    )
  );

create policy delivery_orders_update on public.delivery_orders
  for update using (
    auth.uid() is not null
    and (
      exists (select 1 from public.delivery_riders r where r.id = rider_id and r.user_id = auth.uid()::uuid)
      or public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
    )
  ) with check (
    auth.uid() is not null
    and (
      exists (select 1 from public.delivery_riders r where r.id = new.rider_id and r.user_id = auth.uid()::uuid)
      or public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
    )
  );

-- INTERNAL TRIPS
create policy delivery_internal_trips_select on public.delivery_internal_trips
  for select using (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or (public.delivery_current_user_role() = 'shift_manager' and branch_id = public.delivery_current_user_branch_id())
      or exists (select 1 from public.delivery_riders r where r.id = rider_id and r.user_id = auth.uid()::uuid)
    )
  );

create policy delivery_internal_trips_insert on public.delivery_internal_trips
  for insert with check (
    auth.uid() is not null
    and exists (select 1 from public.delivery_riders r where r.id = new.rider_id and r.user_id = auth.uid()::uuid)
  );

create policy delivery_internal_trips_update_admin on public.delivery_internal_trips
  for update using (
    public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
  );

-- PAYROLL PERIODS
create policy delivery_payroll_periods_select_admin on public.delivery_payroll_periods
  for select using (
    public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
  );

create policy delivery_payroll_periods_modify_admin on public.delivery_payroll_periods
  for insert, update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- PAYROLL RUNS
create policy delivery_payroll_runs_select_admin on public.delivery_payroll_runs
  for select using (
    public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
  );

create policy delivery_payroll_runs_modify_admin on public.delivery_payroll_runs
  for insert, update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- PAYROLL ADJUSTMENTS
create policy delivery_payroll_adjustments_select_admin on public.delivery_payroll_adjustments
  for select using (
    public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
  );

create policy delivery_payroll_adjustments_modify_admin on public.delivery_payroll_adjustments
  for insert, update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- SETTINGS
create policy delivery_settings_select on public.delivery_settings
  for select using (
    auth.uid() is not null
    and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or (public.delivery_current_user_role() = 'shift_manager' and branch_id = public.delivery_current_user_branch_id())
      or exists (select 1 from public.delivery_riders r where r.branch_id = branch_id and r.user_id = auth.uid()::uuid)
    )
  );

create policy delivery_settings_modify_admin on public.delivery_settings
  for insert, update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- AUDIT LOG
create policy delivery_audit_log_insert_authenticated on public.delivery_audit_log
  for insert with check (
    auth.uid() is not null
  );

create policy delivery_audit_log_select_admin on public.delivery_audit_log
  for select using (
    public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
  );

create policy delivery_audit_log_modify_admin on public.delivery_audit_log
  for update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- INCIDENTS
create policy delivery_incidents_select on public.delivery_incidents
  for select using (
    auth.uid() is not null
    and public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
  );

create policy delivery_incidents_insert_authenticated on public.delivery_incidents
  for insert with check (
    auth.uid() is not null
  );

create policy delivery_incidents_modify_admin on public.delivery_incidents
  for update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- PERFORMANCE SCORES
alter table public.delivery_performance_scores enable row level security;
create policy perf_select on public.delivery_performance_scores
  for select using (
    auth.uid() is not null and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or (public.delivery_current_user_role() = 'shift_manager' and exists (select 1 from public.delivery_riders r where r.branch_id = public.delivery_current_user_branch_id() and r.id = rider_id))
      or exists (select 1 from public.delivery_riders r where r.user_id = auth.uid()::uuid and r.id = rider_id)
    )
  );

create policy perf_modify_admin on public.delivery_performance_scores
  for insert, update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- INCENTIVE RULES (admin only)
alter table public.delivery_incentive_rules enable row level security;
create policy incentive_rules_admin on public.delivery_incentive_rules
  for select, insert, update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- INCENTIVE EVENTS
alter table public.delivery_incentive_events enable row level security;
create policy incentive_events_select on public.delivery_incentive_events
  for select using (
    auth.uid() is not null and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or exists (select 1 from public.delivery_riders r where r.user_id = auth.uid()::uuid and r.id = rider_id)
    )
  );

create policy incentive_events_insert on public.delivery_incentive_events
  for insert with check (
    auth.uid() is not null and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or exists (select 1 from public.delivery_riders r where r.user_id = auth.uid()::uuid and r.id = new.rider_id)
    )
  );

create policy incentive_events_update_admin on public.delivery_incentive_events
  for update, delete using (
    public.delivery_current_user_role() in ('admin','super_admin')
  ) with check (
    public.delivery_current_user_role() in ('admin','super_admin')
  );

-- NOTIFICATIONS
alter table public.delivery_notifications enable row level security;
create policy notifications_select on public.delivery_notifications
  for select using (
    auth.uid() is not null and (
      public.delivery_current_user_role() in ('admin','super_admin','shift_manager')
      or recipient_profile_id = auth.uid()::uuid
      or exists (select 1 from public.delivery_riders r where r.user_id = auth.uid()::uuid and r.id = rider_id)
    )
  );

create policy notifications_insert on public.delivery_notifications
  for insert with check (
    auth.uid() is not null
  );

create policy notifications_update on public.delivery_notifications
  for update using (
    auth.uid() is not null and (
      recipient_profile_id = auth.uid()::uuid
      or public.delivery_current_user_role() in ('admin','super_admin')
    )
  ) with check (
    auth.uid() is not null and (
      recipient_profile_id = auth.uid()::uuid
      or public.delivery_current_user_role() in ('admin','super_admin')
    )
  );

-- LEADERBOARD
alter table public.delivery_leaderboard_snapshots enable row level security;
create policy leaderboard_select on public.delivery_leaderboard_snapshots
  for select using (
    auth.uid() is not null and (
      public.delivery_current_user_role() in ('admin','super_admin')
      or (public.delivery_current_user_role() = 'shift_manager' and exists (select 1 from public.delivery_riders r where r.branch_id = public.delivery_current_user_branch_id() and r.id = rider_id))
      or exists (select 1 from public.delivery_riders r where r.user_id = auth.uid()::uuid and r.id = rider_id)
    )
  );

-- GRANTS
grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.delivery_login_aliases to authenticated;
grant select, insert, update, delete on public.delivery_branches to authenticated;
grant select, insert, update, delete on public.delivery_locations to authenticated;
grant select, insert, update, delete on public.delivery_riders to authenticated;
grant select, insert, update, delete on public.delivery_customers to authenticated;
grant select, insert, update, delete on public.delivery_attendance to authenticated;
grant select, insert, update, delete on public.delivery_runs to authenticated;
grant select, insert, update, delete on public.delivery_orders to authenticated;
grant select, insert, update, delete on public.delivery_internal_trips to authenticated;
grant select, insert, update, delete on public.delivery_payroll_periods to authenticated;
grant select, insert, update, delete on public.delivery_payroll_runs to authenticated;
grant select, insert, update, delete on public.delivery_payroll_adjustments to authenticated;
grant select, insert, update, delete on public.delivery_settings to authenticated;
grant select, insert, update, delete on public.delivery_audit_log to authenticated;
grant select, insert, update, delete on public.delivery_incidents to authenticated;

grant execute on function public.delivery_resolve_login(text) to anon;
grant execute on function public.delivery_current_user_role() to authenticated;
grant execute on function public.delivery_current_user_branch_id() to authenticated;
grant execute on function public.delivery_current_rider_id() to authenticated;
grant execute on function public.get_current_delivery_period() to authenticated;
grant execute on function public.create_or_get_delivery_period(date) to authenticated;
grant execute on function public.delivery_calculate_payroll(date, date) to authenticated;
grant execute on function public.calculate_delivery_payroll(uuid) to authenticated;
grant execute on function public.get_rider_active_run(uuid) to authenticated;
grant execute on function public.delivery_search_customers(text) to authenticated;
grant execute on function public.delivery_start_attendance(numeric, numeric, numeric, boolean, text) to authenticated;
grant execute on function public.delivery_start_run(numeric, numeric, numeric, boolean, text) to authenticated;
grant execute on function public.delivery_finish_run(uuid, numeric, numeric, numeric, boolean, text, text) to authenticated;
