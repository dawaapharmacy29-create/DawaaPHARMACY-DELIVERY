create table if not exists public.rider_adjustments (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  rider_name text,
  branch_name text,
  cycle_start date not null,
  cycle_end date not null,
  adjustment_type text not null check (adjustment_type in ('reward', 'penalty')),
  amount numeric not null default 0,
  multiplier numeric not null default 1,
  final_amount numeric generated always as (
    case
      when adjustment_type = 'penalty' then -abs(amount) * coalesce(multiplier, 1)
      else abs(amount) * coalesce(multiplier, 1)
    end
  ) stored,
  reason text not null,
  source_person_name text,
  source_person_role text check (source_person_role in ('customer', 'doctor', 'admin', 'other') or source_person_role is null),
  admin_note text,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz default now(),
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_rider_adjustments_rider_cycle on public.rider_adjustments (rider_id, cycle_start, cycle_end);
create index if not exists idx_rider_adjustments_created_at on public.rider_adjustments (created_at desc);

create or replace function public.touch_rider_adjustments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_rider_adjustments_updated_at on public.rider_adjustments;
create trigger trg_touch_rider_adjustments_updated_at
before update on public.rider_adjustments
for each row execute function public.touch_rider_adjustments_updated_at();

create or replace function public.notify_rider_adjustment_change()
returns trigger
language plpgsql
as $$
declare
  v_title text;
  v_body text;
begin
  if to_regclass('public.rider_notifications') is null then
    return new;
  end if;

  v_title := case when new.adjustment_type = 'reward' then 'تم تسجيل مكافأة' else 'تم تسجيل خصم' end;
  v_body := concat(
    case when new.adjustment_type = 'reward' then 'مكافأة' else 'خصم' end,
    ' بقيمة ', abs(new.final_amount)::text,
    ' جنيه. السبب: ', coalesce(new.reason, 'بدون سبب'),
    case when coalesce(new.source_person_name, '') <> '' then concat(' — المصدر: ', new.source_person_name) else '' end,
    '. سيتم مراجعة واعتماد التفاصيل من الإدارة.'
  );

  begin
    execute 'insert into public.rider_notifications (rider_id, title, message, body, created_at) values ($1, $2, $3, $3, now())'
      using new.rider_id, v_title, v_body;
  exception when undefined_column then
    begin
      execute 'insert into public.rider_notifications (rider_id, title, message, created_at) values ($1, $2, $3, now())'
        using new.rider_id, v_title, v_body;
    exception when undefined_column then
      begin
        execute 'insert into public.rider_notifications (rider_id, message, created_at) values ($1, $2, now())'
          using new.rider_id, v_body;
      exception when others then
        null;
      end;
    end;
  when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_rider_adjustment_change on public.rider_adjustments;
create trigger trg_notify_rider_adjustment_change
after insert on public.rider_adjustments
for each row execute function public.notify_rider_adjustment_change();

create or replace view public.rider_adjustments_cycle_summary as
select
  rider_id,
  cycle_start,
  cycle_end,
  count(*) filter (where adjustment_type = 'reward' and status <> 'rejected') as rewards_count,
  coalesce(sum(final_amount) filter (where adjustment_type = 'reward' and status <> 'rejected'), 0) as rewards_total,
  count(*) filter (where adjustment_type = 'penalty' and status <> 'rejected') as penalties_count,
  coalesce(abs(sum(final_amount) filter (where adjustment_type = 'penalty' and status <> 'rejected')), 0) as penalties_total,
  coalesce(sum(final_amount) filter (where status <> 'rejected'), 0) as net_adjustments
from public.rider_adjustments
group by rider_id, cycle_start, cycle_end;
