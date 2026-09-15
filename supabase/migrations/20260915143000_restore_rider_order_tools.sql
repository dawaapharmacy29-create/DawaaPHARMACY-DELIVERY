begin;

create table if not exists public.delivery_order_settlement_batches (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id),
  rider_name text,
  branch_id uuid references public.branches(id),
  branch_name text,
  doctor_name text not null,
  work_date date not null default current_date,
  order_ids uuid[] not null,
  orders_count integer not null,
  total_amount numeric(14,2) not null default 0,
  notes text,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint delivery_order_settlement_batches_status_check
    check (status in ('submitted','confirmed','rejected','cancelled'))
);

alter table public.delivery_orders
  add column if not exists settlement_batch_id uuid references public.delivery_order_settlement_batches(id),
  add column if not exists settlement_status text,
  add column if not exists settlement_doctor_name text,
  add column if not exists settlement_submitted_at timestamptz;

create index if not exists delivery_orders_settlement_batch_idx
  on public.delivery_orders(settlement_batch_id);
create index if not exists settlement_batches_rider_date_idx
  on public.delivery_order_settlement_batches(rider_id, work_date desc, created_at desc);

alter table public.delivery_order_settlement_batches enable row level security;
revoke all on public.delivery_order_settlement_batches from anon, authenticated;

drop function if exists public.rider_create_order_settlement_batch(text, uuid[], text, text);
create or replace function public.rider_create_order_settlement_batch(
  p_token text,
  p_order_ids uuid[],
  p_doctor_name text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dashboard jsonb;
  v_rider_id uuid;
  v_rider_name text;
  v_branch_id uuid;
  v_branch_name text;
  v_batch_id uuid;
  v_count integer;
  v_total numeric(14,2);
  v_work_date date;
begin
  if coalesce(array_length(p_order_ids, 1), 0) = 0 then
    return jsonb_build_object('success', false, 'error', 'no_orders', 'message', 'اختار أوردر واحد على الأقل');
  end if;
  if length(trim(coalesce(p_doctor_name, ''))) < 2 then
    return jsonb_build_object('success', false, 'error', 'doctor_required', 'message', 'اكتب اسم الدكتور المستلم');
  end if;

  v_dashboard := public.rider_get_operating_dashboard_fast(p_token);
  if coalesce((v_dashboard ->> 'success')::boolean, false) is not true then
    return jsonb_build_object('success', false, 'error', coalesce(v_dashboard ->> 'error', 'invalid_session'), 'message', coalesce(v_dashboard ->> 'message', 'جلسة الدليفري غير صالحة'));
  end if;

  v_rider_id := nullif(v_dashboard #>> '{rider,id}', '')::uuid;
  v_rider_name := v_dashboard #>> '{rider,name}';
  v_branch_id := nullif(v_dashboard #>> '{rider,branch_id}', '')::uuid;
  v_branch_name := coalesce(v_dashboard #>> '{branch,name}', v_dashboard #>> '{rider,branch_name}');

  select count(*),
         coalesce(sum(coalesce(invoice_amount, invoice_value, 0)), 0),
         max(coalesce(work_date, delivery_date, current_date))
    into v_count, v_total, v_work_date
  from public.delivery_orders
  where id = any(p_order_ids)
    and rider_id = v_rider_id
    and lower(coalesce(status, '')) in ('delivered', 'تم التسليم')
    and settlement_batch_id is null
    and deleted_at is null;

  if v_count <> array_length(p_order_ids, 1) then
    return jsonb_build_object('success', false, 'error', 'invalid_orders', 'message', 'بعض الأوردرات غير مسلمة أو تمت محاسبتها بالفعل. حدّث الصفحة وحاول مرة أخرى');
  end if;

  insert into public.delivery_order_settlement_batches (
    rider_id, rider_name, branch_id, branch_name, doctor_name,
    work_date, order_ids, orders_count, total_amount, notes
  ) values (
    v_rider_id, v_rider_name, v_branch_id, v_branch_name, trim(p_doctor_name),
    coalesce(v_work_date, current_date), p_order_ids, v_count, v_total, nullif(trim(coalesce(p_notes, '')), '')
  ) returning id into v_batch_id;

  update public.delivery_orders
  set settlement_batch_id = v_batch_id,
      settlement_status = 'submitted',
      settlement_doctor_name = trim(p_doctor_name),
      settlement_submitted_at = now(),
      updated_at = now()
  where id = any(p_order_ids)
    and rider_id = v_rider_id;

  return jsonb_build_object(
    'success', true,
    'message', 'تم تسجيل محاسبة الأوردرات وإرسالها للمراجعة',
    'batch_id', v_batch_id,
    'orders_count', v_count,
    'total_amount', v_total,
    'doctor_name', trim(p_doctor_name)
  );
exception when others then
  return jsonb_build_object('success', false, 'error', sqlstate, 'message', sqlerrm);
end;
$$;

revoke all on function public.rider_create_order_settlement_batch(text, uuid[], text, text) from public;
grant execute on function public.rider_create_order_settlement_batch(text, uuid[], text, text) to anon, authenticated;

commit;
