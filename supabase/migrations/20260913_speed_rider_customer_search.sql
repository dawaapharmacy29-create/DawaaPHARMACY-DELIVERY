create index if not exists idx_delivery_customers_effective_code_active_pattern
on public.delivery_customers
using btree ((coalesce(nullif(trim(customer_code),''), nullif(trim(code),''))) text_pattern_ops)
where coalesce(active,true)=true;

drop policy if exists "Allow all for anon" on public.delivery_customers;
drop policy if exists allow_all on public.delivery_customers;
drop policy if exists allow_insert_delivery_customers on public.delivery_customers;
drop policy if exists allow_read_delivery_customers on public.delivery_customers;
drop policy if exists allow_update_delivery_customers on public.delivery_customers;
drop policy if exists delivery_authenticated_all_delivery_customers on public.delivery_customers;

create policy delivery_customers_anon_all
on public.delivery_customers
for all
to anon
using (true)
with check (true);

create policy delivery_customers_authenticated_all
on public.delivery_customers
for all
to authenticated
using (true)
with check (true);
