-- Approved duplicate orders may be counted once explicitly approved and otherwise countable.
-- Also exposes non-overlapping headline counts plus duplicate review breakdown for rider cards.

CREATE OR REPLACE FUNCTION public.delivery_rider_financial_summary_v1(p_rider_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
with rider as (
  select r.* from public.riders r where r.id=p_rider_id
),
profile as (
  select
    coalesce(p.hourly_rate,r.hourly_rate,0)::numeric hourly_rate,
    coalesce(p.base_salary,case when coalesce(r.salary_type,'hourly')='monthly' then r.monthly_salary else 0 end,0)::numeric base_salary,
    coalesce(p.monthly_bonus,r.monthly_incentive_base,r.monthly_bonus_base,0)::numeric monthly_bonus_base,
    coalesce(p.quarterly_bonus,r.quarterly_incentive_base,0)::numeric quarterly_bonus_base,
    coalesce(p.order_1x_rate,r.order_rate,0)::numeric order_1x_rate,
    coalesce(nullif(p.order_1_5x_rate,0),coalesce(p.order_1x_rate,r.order_rate,0)*1.5,0)::numeric order_1_5x_rate,
    coalesce(p.internal_trip_rate,r.trip_rate,0)::numeric trip_rate,
    case when p.id is null then 'riders_fallback' else 'cycle_snapshot' end rate_source,
    p.id compensation_snapshot_id
  from rider r
  left join lateral (
    select q.*
    from public.rider_compensation_profiles q
    where q.rider_id=r.id
      and q.cycle_start=p_period_start
      and q.cycle_end=p_period_end
    order by q.updated_at desc nulls last,q.created_at desc
    limit 1
  ) p on true
),
attendance as (
  select
    coalesce(sum(
      case
        when a.check_out_time is null then 0
        when coalesce(a.total_minutes,0) between 1 and 1080 then a.total_minutes
        when a.check_in_time is not null
          and extract(epoch from(a.check_out_time-a.check_in_time))/60 between 1 and 1080
          then extract(epoch from(a.check_out_time-a.check_in_time))/60
        else 0
      end
    ),0)::numeric work_minutes,
    count(*) filter(where a.check_out_time is not null)::int closed_shifts,
    count(*) filter(where a.check_out_time is null)::int open_shifts,
    count(*) filter(where coalesce(a.needs_review,false))::int review_shifts
  from public.delivery_attendance a
  where a.rider_id=p_rider_id and a.shift_date between p_period_start and p_period_end
),
orders_scope as (
  select o.*
  from public.delivery_orders o
  where o.rider_id=p_rider_id
    and coalesce(o.work_date,o.delivery_date,(coalesce(o.registered_at,o.created_at,now()) at time zone 'Africa/Cairo')::date)
      between p_period_start and p_period_end
    and o.deleted_at is null
),
orders as (
  select
    count(*)::int total_orders,
    count(*) filter(where
      lower(coalesce(status,'')) not in ('failed','cancelled','canceled','returned')
      and (
        (coalesce(is_duplicate_invoice,false)=false and coalesce(duplicate_warning,false)=false and original_order_id is null)
        or lower(coalesce(duplicate_review_status,'')) in ('approved','not_required')
      )
      and coalesce(excluded_from_incentive,false)=false
      and coalesce(not_countable,false)=false
      and coalesce(needs_review,false)=false
      and (coalesce(is_countable,false)=true or coalesce(final_count_status,'') like 'counted%')
    )::int counted_orders,
    count(*) filter(where
      lower(coalesce(status,'')) not in ('failed','cancelled','canceled','returned')
      and (
        (coalesce(is_duplicate_invoice,false)=false and coalesce(duplicate_warning,false)=false and original_order_id is null)
        or lower(coalesce(duplicate_review_status,'')) in ('approved','not_required')
      )
      and coalesce(excluded_from_incentive,false)=false
      and coalesce(not_countable,false)=false
      and coalesce(needs_review,false)=false
      and (coalesce(is_countable,false)=true or coalesce(final_count_status,'') like 'counted%')
      and coalesce(order_multiplier,1)<1.5
    )::int orders_1x,
    count(*) filter(where
      lower(coalesce(status,'')) not in ('failed','cancelled','canceled','returned')
      and (
        (coalesce(is_duplicate_invoice,false)=false and coalesce(duplicate_warning,false)=false and original_order_id is null)
        or lower(coalesce(duplicate_review_status,'')) in ('approved','not_required')
      )
      and coalesce(excluded_from_incentive,false)=false
      and coalesce(not_countable,false)=false
      and coalesce(needs_review,false)=false
      and (coalesce(is_countable,false)=true or coalesce(final_count_status,'') like 'counted%')
      and coalesce(order_multiplier,1)>=1.5
    )::int orders_1_5x,
    count(*) filter(where coalesce(final_count_status,'') like 'pending%' or lower(coalesce(duplicate_review_status,''))='pending')::int pending_review_orders,
    count(*) filter(where lower(coalesce(status,''))='failed')::int failed_orders,
    count(*) filter(where lower(coalesce(status,'')) in ('failed','cancelled','canceled','returned') or coalesce(final_count_status,'') like 'excluded%')::int excluded_orders,
    count(*) filter(where coalesce(is_duplicate_invoice,false) or coalesce(duplicate_warning,false) or original_order_id is not null)::int duplicate_orders,
    count(*) filter(where (coalesce(is_duplicate_invoice,false) or coalesce(duplicate_warning,false) or original_order_id is not null) and lower(coalesce(duplicate_review_status,''))='approved')::int duplicate_approved_orders,
    count(*) filter(where (coalesce(is_duplicate_invoice,false) or coalesce(duplicate_warning,false) or original_order_id is not null) and lower(coalesce(duplicate_review_status,''))='pending')::int duplicate_pending_orders,
    count(*) filter(where (coalesce(is_duplicate_invoice,false) or coalesce(duplicate_warning,false) or original_order_id is not null) and lower(coalesce(duplicate_review_status,''))='rejected')::int duplicate_rejected_orders
  from orders_scope
),
trips_scope as (
  select t.*
  from public.internal_trips t
  where t.rider_id=p_rider_id
    and coalesce(t.work_date,t.trip_date,(coalesce(t.registered_at,t.created_at,now()) at time zone 'Africa/Cairo')::date)
      between p_period_start and p_period_end
),
trips as (
  select
    count(*)::int total_trips,
    count(*) filter(where
      lower(coalesce(status,review_status,'')) in ('approved','completed','countable')
      and coalesce(is_countable,true)=true
      and duplicate_of is null
    )::int approved_trips,
    coalesce(sum(case when
      lower(coalesce(status,review_status,'')) in ('approved','completed','countable')
      and coalesce(is_countable,true)=true
      and duplicate_of is null
      then coalesce(trip_multiplier,1) else 0 end),0)::numeric weighted_trip_units,
    count(*) filter(where lower(coalesce(status,review_status,'')) like 'pending%')::int pending_trips,
    count(*) filter(where lower(coalesce(status,review_status,'')) in ('rejected','declined','cancelled','canceled') or coalesce(is_countable,true)=false)::int rejected_trips,
    count(*) filter(where duplicate_of is not null)::int duplicate_trips
  from trips_scope
),
adjustments as (
  select
    coalesce(sum(case when status='approved' and adjustment_type='reward' then abs(coalesce(final_amount,amount,0)) else 0 end),0)::numeric rewards,
    coalesce(sum(case when status='approved' and adjustment_type='penalty' then abs(coalesce(final_amount,amount,0)) else 0 end),0)::numeric penalties
  from public.rider_adjustments
  where rider_id=p_rider_id and cycle_start<=p_period_end and cycle_end>=p_period_start
),
bonuses as (
  select
    max(earned_amount) filter(where bonus_type='monthly' and status='approved')::numeric monthly_assessed,
    max(earned_amount) filter(where bonus_type='quarterly' and status='approved')::numeric quarterly_assessed
  from public.rider_bonus_assessments
  where rider_id=p_rider_id and cycle_start=p_period_start and cycle_end=p_period_end
),
calc as (
  select
    r.id rider_id_value,r.name rider_name_value,
    p.hourly_rate,p.base_salary,p.monthly_bonus_base,p.quarterly_bonus_base,p.order_1x_rate,p.order_1_5x_rate,p.trip_rate,p.rate_source,p.compensation_snapshot_id,
    a.work_minutes,a.closed_shifts,a.open_shifts,a.review_shifts,
    o.total_orders,o.counted_orders,o.orders_1x,o.orders_1_5x,o.pending_review_orders,o.failed_orders,o.excluded_orders,o.duplicate_orders,o.duplicate_approved_orders,o.duplicate_pending_orders,o.duplicate_rejected_orders,
    t.total_trips,t.approved_trips,t.weighted_trip_units,t.pending_trips,t.rejected_trips,t.duplicate_trips,
    adj.rewards,adj.penalties,b.monthly_assessed,b.quarterly_assessed,
    round(a.work_minutes/60.0,2) work_hours,
    round((a.work_minutes/60.0)*p.hourly_rate,2) hourly_pay,
    round(o.orders_1x*p.order_1x_rate + o.orders_1_5x*p.order_1_5x_rate,2) order_pay,
    round(t.weighted_trip_units*p.trip_rate,2) trip_pay,
    case
      when b.monthly_assessed is not null then b.monthly_assessed
      when (a.work_minutes>0 or o.counted_orders>0 or t.approved_trips>0) then p.monthly_bonus_base
      else 0
    end::numeric monthly_bonus_earned,
    coalesce(b.quarterly_assessed,0)::numeric quarterly_bonus_earned
  from rider r cross join profile p cross join attendance a cross join orders o cross join trips t cross join adjustments adj cross join bonuses b
)
select jsonb_build_object(
  'schema','delivery_rider_financial_summary_v1',
  'rider_id',rider_id_value,
  'rider_name',rider_name_value,
  'period_start',p_period_start,
  'period_end',p_period_end,
  'rate_source',rate_source,
  'compensation_snapshot_id',compensation_snapshot_id,
  'rates',jsonb_build_object(
    'hourly_rate',hourly_rate,'order_1x_rate',order_1x_rate,'order_1_5x_rate',order_1_5x_rate,
    'trip_rate',trip_rate,'monthly_bonus_base',monthly_bonus_base,'quarterly_bonus_base',quarterly_bonus_base,'base_salary',base_salary
  ),
  'attendance',jsonb_build_object(
    'work_hours',work_hours,'closed_shifts',closed_shifts,'open_shifts',open_shifts,'review_shifts',review_shifts,'hourly_pay',hourly_pay
  ),
  'orders',jsonb_build_object(
    'total',total_orders,'counted',counted_orders,'uncounted',greatest(total_orders-counted_orders,0),'x1',orders_1x,'x1_5',orders_1_5x,
    'pending_review',pending_review_orders,'failed',failed_orders,'excluded',excluded_orders,
    'duplicates',duplicate_orders,'duplicate_approved',duplicate_approved_orders,'duplicate_pending',duplicate_pending_orders,'duplicate_rejected',duplicate_rejected_orders,'pay',order_pay
  ),
  'trips',jsonb_build_object(
    'total',total_trips,'approved',approved_trips,'weighted_units',weighted_trip_units,'pending',pending_trips,
    'rejected',rejected_trips,'duplicates',duplicate_trips,'pay',trip_pay
  ),
  'bonuses',jsonb_build_object(
    'monthly_earned',monthly_bonus_earned,
    'monthly_source',case when monthly_assessed is not null then 'approved_assessment' else 'base_if_active' end,
    'quarterly_earned',quarterly_bonus_earned,
    'quarterly_source',case when quarterly_assessed is not null then 'approved_assessment' else 'none' end,
    'rewards',rewards,'penalties',penalties
  ),
  'gross_pay',round(base_salary+hourly_pay+order_pay+trip_pay+monthly_bonus_earned+quarterly_bonus_earned+rewards,2),
  'net_pay',round(base_salary+hourly_pay+order_pay+trip_pay+monthly_bonus_earned+quarterly_bonus_earned+rewards-penalties,2),
  'readiness',jsonb_build_object(
    'financial_configured',(hourly_rate>0 or order_1x_rate>0 or trip_rate>0 or monthly_bonus_base>0 or base_salary>0),
    'pending_attendance_reviews',review_shifts,
    'open_shifts',open_shifts,
    'pending_order_reviews',pending_review_orders,
    'pending_trips',pending_trips,
    'ready_for_final',(
      (hourly_rate>0 or order_1x_rate>0 or trip_rate>0 or monthly_bonus_base>0 or base_salary>0)
      and review_shifts=0 and open_shifts=0 and pending_review_orders=0 and pending_trips=0
    )
  )
)
from calc;
$function$

