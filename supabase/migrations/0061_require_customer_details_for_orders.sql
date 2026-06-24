-- 0061_require_customer_details_for_orders.sql
-- Guard delivery orders against empty customer data.

create or replace function public.delivery_orders_require_customer_details()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.customer_id::text, '') = ''
     and coalesce(trim(new.customer_code), trim(new.customer_code_snapshot), '') = ''
     and (
       coalesce(trim(new.customer_name), trim(new.customer_name_snapshot), '') = ''
       or coalesce(trim(new.customer_phone), trim(new.customer_phone_snapshot), '') = ''
       or coalesce(trim(new.customer_address), trim(new.customer_address_snapshot), '') = ''
       or coalesce(trim(new.customer_name), trim(new.customer_name_snapshot), '') in ('عميل غير مسجل', 'عميل غير محدد')
     ) then
    raise exception 'لا يمكن حفظ الأوردر بدون كود عميل أو بيانات عميل كاملة: الاسم والتليفون والعنوان';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_orders_require_customer_details on public.delivery_orders;

create trigger trg_delivery_orders_require_customer_details
before insert or update on public.delivery_orders
for each row
execute function public.delivery_orders_require_customer_details();
