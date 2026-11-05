-- «مراجعتي اليومية» → المناديب (read by the management app every 10 minutes).
-- Adds per branch: today's and the cycle's (26 → 25) delivered orders and errands, and the delivered orders
-- still waiting for their sales invoice match. Existing keys (yesterday, stuck, pending errands) are unchanged.

create or replace function public.management_daily_review_snapshot_v1(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_key text;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_cycle date;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'delivery_invoice_bridge_key';
  if v_key is null or length(coalesce(p_key, '')) < 64 or p_key is distinct from v_key then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_cycle := case when extract(day from v_today) >= 26
    then make_date(extract(year from v_today)::int, extract(month from v_today)::int, 26)
    else (date_trunc('month', v_today) - interval '1 month')::date + 25 end;

  return jsonb_build_object(
    'day', v_today,
    'cycle_start', v_cycle,
    'generated_at', now(),
    'branches', (
      select jsonb_agg(jsonb_build_object(
               'branch', b.name,
               'delivered', o.delivered, 'failed', o.failed, 'stuck', o.stuck,
               'today_delivered', o.today_delivered, 'cycle_delivered', o.cycle_delivered,
               'unmatched', o.unmatched,
               'errands', t.errands, 'pending_errands', t.pending, 'oldest_pending', t.oldest,
               'today_errands', t.today_errands, 'cycle_errands', t.cycle_errands)
             order by b.ord)
      from (values (1, 'فرع شكري'), (2, 'فرع الشامي')) b(ord, name)
      cross join lateral (
        select count(*) filter (where x.on_day = v_today - 1 and x.status = 'delivered') delivered,
               count(*) filter (where x.on_day = v_today - 1 and x.status = 'failed') failed,
               count(*) filter (where x.on_day < v_today and x.status = 'registered') stuck,
               count(*) filter (where x.on_day = v_today and x.status = 'delivered') today_delivered,
               count(*) filter (where x.on_day >= v_cycle and x.status = 'delivered') cycle_delivered,
               count(*) filter (where x.on_day >= v_cycle and x.on_day < v_today and x.status = 'delivered'
                                  and coalesce(x.match_status, 'pending') <> 'matched'
                                  and coalesce(x.reconciliation_status, '') <> 'manual_override') unmatched
        from (select o.status, o.bconnect_match_status match_status, o.reconciliation_status,
                     (o.created_at at time zone 'Africa/Cairo')::date on_day
              from public.delivery_orders o
              where coalesce(o.branch_name, o.branch) = b.name
                and o.created_at >= ((least(v_cycle, v_today - 7))::timestamp at time zone 'Africa/Cairo')
                and coalesce(o.is_deleted, false) = false and o.deleted_at is null) x
      ) o
      cross join lateral (
        select count(*) filter (where it.trip_date = v_today - 1 and it.status <> 'rejected') errands,
               count(*) filter (where it.status = 'pending_approval' and it.trip_date < v_today) pending,
               min(it.trip_date) filter (where it.status = 'pending_approval' and it.trip_date < v_today) oldest,
               count(*) filter (where it.trip_date = v_today and it.status <> 'rejected') today_errands,
               count(*) filter (where it.trip_date >= v_cycle and it.status <> 'rejected') cycle_errands
        from public.internal_trips it
        where it.branch_name = b.name and it.trip_date >= least(v_cycle, v_today - 30)
      ) t
    )
  );
end;
$function$;
