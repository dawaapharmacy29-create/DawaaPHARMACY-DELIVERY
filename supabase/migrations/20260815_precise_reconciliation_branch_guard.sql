-- Keep the denormalized delivery order branch label aligned with authoritative branch_id.
drop trigger if exists trg_delivery_orders_sync_branch_name_from_id on public.delivery_orders;
create trigger trg_delivery_orders_sync_branch_name_from_id
before insert or update of branch_id, branch_name on public.delivery_orders
for each row execute function public.delivery_orders_sync_branch_name_from_id();

create index if not exists delivery_orders_precise_branch_id_match_idx
  on public.delivery_orders(delivery_date, branch_id, invoice_number);
