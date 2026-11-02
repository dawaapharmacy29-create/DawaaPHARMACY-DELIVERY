-- Guard pre-existing nonzero earnings against legacy delivery UPDATE triggers. Missing rider identities require review.
create or replace function public.ingest_management_invoice_snapshot_v1(p_key text,p_start date,p_end date,p_revision bigint,p_rows jsonb,p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_key text; v_open date; v_state public.management_invoice_sync_state; v_batch uuid;
 v_signature text; v_result jsonb; o record; v_match record; v_status text; v_reason text;
 v_human boolean; v_failed boolean; v_dup boolean; v_name_mismatch boolean; v_countable boolean; v_final text;
begin
 select decrypted_secret into v_key from vault.decrypted_secrets where name='delivery_invoice_bridge_key';
 if v_key is null or length(coalesce(p_key,''))<64 or p_key is distinct from v_key then raise exception 'not_authorized' using errcode='42501'; end if;
 v_open:=case when extract(day from now() at time zone 'Africa/Cairo')>=26
 then (date_trunc('month',now() at time zone 'Africa/Cairo')+interval '25 days')::date
 else (date_trunc('month',now() at time zone 'Africa/Cairo')-interval '1 month'+interval '25 days')::date end;
 if p_start is distinct from v_open or p_end is distinct from (p_start+interval '1 month'-interval '1 day')::date
 or p_revision is null or p_revision<1 or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>30000 then
 raise exception 'invalid_management_snapshot'; end if;
 perform pg_advisory_xact_lock(hashtext('management_invoice_sync'),p_start-date '2000-01-01');
 select * into v_state from public.management_invoice_sync_state where period_start=p_start for update;
 if v_state.revision>p_revision then return jsonb_build_object('stale',true); end if;
 -- Lock orders before checking human decisions; concurrent manager decisions cannot be overwritten.
 perform 1 from public.delivery_orders where delivery_date between p_start and p_end order by id for update;
 select md5(coalesce(string_agg(to_jsonb(d)::text,'|' order by d.id),'')) into v_signature
 from public.delivery_orders d where delivery_date between p_start and p_end;
 if v_state.revision=p_revision and v_state.orders_signature=v_signature then
 return v_state.last_result||jsonb_build_object('unchanged',true); end if;
 drop table if exists pg_temp.management_invoice_work;
 create temporary table management_invoice_work on commit drop as
 select r.*,public.normalize_delivery_reconciliation_invoice(r.invoice_number) number_key,
 public.normalize_delivery_reconciliation_branch(r.branch_name) branch_key,
 p_start::text||'|'||p_end::text||'|'||public.normalize_delivery_reconciliation_branch(r.branch_name)||'|'||public.normalize_delivery_reconciliation_invoice(r.invoice_number) cycle_key
 from jsonb_to_recordset(p_rows) r(source_id text,invoice_number text,branch_name text,invoice_date date,invoice_type text,
 customer_code text,customer_name text,customer_phone text,net_total numeric,gross_total numeric,delivery_address text,system_user_name text);
 if exists(select 1 from pg_temp.management_invoice_work where source_id is null or number_key='' or branch_key='' or invoice_date is null
 or invoice_date not between p_start and p_end or net_total is null or net_total<=0)
 then raise exception 'invalid_management_invoice'; end if;
 if exists(select 1 from pg_temp.management_invoice_work group by cycle_key having count(*)>1) then raise exception 'ambiguous_management_invoice_identity'; end if;
 -- A changed customer, value or date is a correction proposal, never a silent evidence replacement.
 if exists(select 1 from pg_temp.management_invoice_work r join public.monthly_system_invoices e on e.invoice_cycle_key=r.cycle_key
 where coalesce(btrim(e.customer_code),'') is distinct from coalesce(btrim(r.customer_code),'')
 or coalesce(e.net_total,e.gross_total,0) is distinct from r.net_total
 or public.parse_delivery_system_invoice_date(e.invoice_date_text) is distinct from r.invoice_date)
 then raise exception 'invoice_evidence_conflict_requires_review'; end if;
 if p_dry_run then return jsonb_build_object('dry_run',true,'invoices',jsonb_array_length(p_rows),
 'orders',(select count(*) from public.delivery_orders where delivery_date between p_start and p_end),
 'exact_candidates',(select count(*) from public.delivery_orders d join pg_temp.management_invoice_work r
 on r.number_key=public.normalize_delivery_reconciliation_invoice(coalesce(nullif(d.invoice_number,''),d.invoice_no))
 and r.branch_key=public.normalize_delivery_reconciliation_branch(coalesce(nullif(d.branch_name,''),d.branch)) and r.invoice_date=d.delivery_date)); end if;
 insert into public.monthly_invoice_import_batches(period_start,period_end,file_name,total_rows,delivery_rows,uploaded_by_name,status)
 values(p_start,p_end,'مزامنة تلقائية من الإدارة / مراجعة يومية',jsonb_array_length(p_rows),
 (select count(*) from pg_temp.management_invoice_work where invoice_type ilike '%توصيل%' or invoice_type ilike '%delivery%'),'نظام الإدارة','started') returning id into v_batch;
 insert into public.monthly_system_invoices(batch_id,period_start,period_end,invoice_number,invoice_type,branch_name,normalized_branch_name,
 customer_code,customer_name,customer_phone,delivery_address,invoice_date_text,gross_total,net_total,system_user_name,raw_json,invoice_cycle_key,last_seen_batch_id)
 select v_batch,p_start,p_end,number_key,invoice_type,branch_name,branch_key,customer_code,customer_name,customer_phone,delivery_address,
 invoice_date::text,gross_total,net_total,system_user_name,jsonb_build_object('source','management_daily','source_id',source_id),cycle_key,v_batch
 from pg_temp.management_invoice_work on conflict(invoice_cycle_key) do nothing;
 -- The unique-key wait above may have raced another import. Recheck the committed evidence.
 if exists(select 1 from pg_temp.management_invoice_work r join public.monthly_system_invoices e on e.invoice_cycle_key=r.cycle_key
 where coalesce(btrim(e.customer_code),'') is distinct from coalesce(btrim(r.customer_code),'')
 or coalesce(e.net_total,e.gross_total,0) is distinct from r.net_total
 or public.parse_delivery_system_invoice_date(e.invoice_date_text) is distinct from r.invoice_date)
 then raise exception 'invoice_evidence_conflict_requires_review'; end if;
 for o in select d.*,b.name resolved_branch,
 count(*) over(partition by public.normalize_delivery_reconciliation_invoice(coalesce(nullif(d.invoice_number,''),d.invoice_no)),
 public.normalize_delivery_reconciliation_branch(coalesce(nullif(d.branch_name,''),nullif(d.branch,''),b.name)),d.delivery_date) sibling_count
 from public.delivery_orders d left join public.branches b on b.id=d.branch_id
 where d.delivery_date between p_start and p_end order by d.id
 loop
  select r.*,e.id evidence_id into v_match from pg_temp.management_invoice_work r
  join public.monthly_system_invoices e on e.invoice_cycle_key=r.cycle_key
  where r.number_key=public.normalize_delivery_reconciliation_invoice(coalesce(nullif(o.invoice_number,''),o.invoice_no))
   and r.branch_key=public.normalize_delivery_reconciliation_branch(coalesce(nullif(o.branch_name,''),nullif(o.branch,''),o.resolved_branch))
   and r.invoice_date=o.delivery_date;
  v_human:=coalesce(o.count_exclusion_reason='marked_not_found_by_admin',false) or coalesce(o.bconnect_match_status='manually_approved',false)
   or coalesce(o.duplicate_review_status in ('approved','rejected'),false);
  v_failed:=o.status='failed' or o.deleted_at is not null or coalesce(o.is_deleted,false);
  v_dup:=coalesce(o.is_duplicate_invoice,false) or o.sibling_count>1;
  v_countable:=coalesce(o.is_countable,false); v_final:=o.final_count_status;
  v_status:='pending_source_coverage';v_reason:='بانتظار فاتورة صالحة تطابق الرقم والفرع والتاريخ؛ ليس رفضًا';
  if v_human and not v_failed then
   v_status:='manual_override';v_reason:='قرار إداري محفوظ؛ لا تعدله المزامنة';
  elsif v_failed then
   v_status:=case when v_match.source_id is null then 'app_only_failed' else 'matched_failed_excluded' end;
   v_reason:='أوردر فاشل أو محذوف لا يحتسب';v_countable:=false;v_final:='excluded_failed';
  elsif v_match.source_id is not null then
   if (nullif(trim(coalesce(nullif(o.customer_code_snapshot,''),o.customer_code)), '') is not null and nullif(trim(v_match.customer_code),'') is not null
    and trim(coalesce(nullif(o.customer_code_snapshot,''),o.customer_code))<>trim(v_match.customer_code))
    or (length(regexp_replace(coalesce(nullif(o.customer_phone_snapshot,''),o.customer_phone,''),'[^0-9]','','g'))>=10 and length(regexp_replace(coalesce(v_match.customer_phone,''),'[^0-9]','','g'))>=10 and right(regexp_replace(coalesce(nullif(o.customer_phone_snapshot,''),o.customer_phone,''),'[^0-9]','','g'),10)<>right(regexp_replace(v_match.customer_phone,'[^0-9]','','g'),10))
    or (coalesce(o.invoice_amount,o.invoice_value,o.amount,0)>0 and
    abs(coalesce(o.invoice_amount,o.invoice_value,o.amount,0)-v_match.net_total)>greatest(5,coalesce(o.invoice_amount,o.invoice_value,o.amount,0)*.01)) then
    v_status:='needs_manual_review';v_reason:='تعارض كود العميل أو الهاتف أو قيمة الفاتورة؛ الحقوق الحالية محفوظة';
   elsif v_dup then
    v_status:='duplicate_in_app';v_reason:='الفاتورة موجودة؛ الزيارة المكررة تحتاج قرار الإدارة';v_countable:=false;v_final:='pending_duplicate_review';
   else
    v_name_mismatch:=nullif(trim(coalesce(o.customer_name_snapshot,o.customer_name)), '') is not null and nullif(trim(v_match.customer_name),'') is not null and regexp_replace(lower(coalesce(o.customer_name_snapshot,o.customer_name)),'[[:space:]]+','','g')<>regexp_replace(lower(v_match.customer_name),'[[:space:]]+','','g');
    v_status:=case when v_name_mismatch then 'matched_customer_name_mismatch' else 'matched' end;v_reason:='مطابقة تلقائية: رقم الفاتورة + الفرع + التاريخ مع تحقق العميل والقيمة';v_countable:=true;
    v_final:=case when coalesce(o.order_multiplier,1)>=1.5 then 'counted_multiplier_pending_value_review' when v_name_mismatch then 'counted_customer_name_review' else 'counted' end;
   end if;
  end if;
  if not v_failed and not v_human and (coalesce(o.order_earning,0)<>0 or o.rider_id is null) then
   v_status:='needs_manual_review';v_reason:='تحتاج مراجعة للحفاظ على قيمة مالية محفوظة أو استكمال هوية المندوب';
   v_countable:=coalesce(o.is_countable,false);v_final:=o.final_count_status;
  end if;
  if (not v_human or v_failed) and (v_failed or v_status in ('matched','matched_customer_name_mismatch','duplicate_in_app')) then
   update public.delivery_orders set bconnect_invoice_id=v_match.evidence_id,
   bconnect_match_status=case when v_failed then case when v_match.source_id is null then 'pending' else 'matched' end else 'matched' end,
   matched_at=case when v_match.source_id is not null then now() end,matched_amount=v_match.net_total,
   is_countable=v_countable,final_count_status=v_final,
   count_exclusion_reason=case when v_failed then 'failed_order' when v_dup then 'duplicate_requires_admin_approval' end,
   reconciliation_status=v_status,reconciliation_notes=v_reason,updated_at=now(),
   order_earning=case when v_failed then 0 else order_earning end where id=o.id;
  end if;
  insert into public.monthly_invoice_reconciliation_results(batch_id,period_start,period_end,invoice_number,rider_id,rider_name,app_order_id,
   match_status,difference_reason,app_amount,system_amount,app_customer_code,system_customer_code,app_customer_name,system_customer_name,
   app_branch_name,system_branch_name,is_countable,needs_review,raw_json,system_invoice_id)
  values(v_batch,p_start,p_end,coalesce(nullif(o.invoice_number,''),o.invoice_no),o.rider_id,coalesce(o.rider_name,o.driver_name),
   case when o.id ~* '^[0-9a-f-]{36}$' then o.id::uuid end,v_status,v_reason,coalesce(o.invoice_amount,o.invoice_value,o.amount),v_match.net_total,
   coalesce(nullif(o.customer_code_snapshot,''),o.customer_code),v_match.customer_code,coalesce(o.customer_name_snapshot,o.customer_name),v_match.customer_name,
   coalesce(nullif(o.branch_name,''),o.branch),v_match.branch_name,v_countable,not v_human and v_status not in ('matched','matched_failed_excluded','app_only_failed'),
   jsonb_build_object('source','management_daily','order_id',o.id,'source_id',v_match.source_id),v_match.evidence_id);
 end loop;
 insert into public.monthly_invoice_reconciliation_results(batch_id,period_start,period_end,invoice_number,match_status,difference_reason,
 system_amount,system_customer_code,system_customer_name,system_branch_name,is_countable,needs_review,raw_json,system_invoice_id)
 select v_batch,p_start,p_end,r.number_key,'system_only','فاتورة توصيل موجودة في الإدارة بدون أوردر بنفس الرقم والفرع والتاريخ',r.net_total,
 r.customer_code,r.customer_name,r.branch_name,false,true,jsonb_build_object('source','management_daily','source_id',r.source_id),e.id
 from pg_temp.management_invoice_work r join public.monthly_system_invoices e on e.invoice_cycle_key=r.cycle_key
 where (r.invoice_type ilike '%توصيل%' or r.invoice_type ilike '%delivery%') and not exists(select 1 from public.delivery_orders d
 where d.delivery_date=r.invoice_date and public.normalize_delivery_reconciliation_invoice(coalesce(nullif(d.invoice_number,''),d.invoice_no))=r.number_key
 and public.normalize_delivery_reconciliation_branch(coalesce(nullif(d.branch_name,''),d.branch))=r.branch_key);
 update public.monthly_invoice_import_batches set status='matched',matched_at=now() where id=v_batch;
 select jsonb_build_object('batch_id',v_batch,'invoices',jsonb_array_length(p_rows),'orders',count(*) filter(where app_order_id is not null),
 'matched',count(*) filter(where match_status in ('matched','matched_customer_name_mismatch')),'pending',count(*) filter(where match_status in ('pending_source_coverage','needs_manual_review','duplicate_in_app')),
 'system_only',count(*) filter(where match_status='system_only'),'failed',count(*) filter(where match_status in ('app_only_failed','matched_failed_excluded')),
 'human_decisions_preserved',count(*) filter(where match_status='manual_override')) into v_result
 from public.monthly_invoice_reconciliation_results where batch_id=v_batch;
 insert into public.reconciliation_upload_log(file_name,period_start,period_end,match_date,rows_count,matched_count,unmatched_count,uploaded_by,notes)
 values('مزامنة تلقائية من الإدارة',p_start,p_end,(now() at time zone 'Africa/Cairo')::date,jsonb_array_length(p_rows),
 (v_result->>'matched')::integer,(v_result->>'pending')::integer+(v_result->>'system_only')::integer,'نظام الإدارة',v_result::text);
 select md5(coalesce(string_agg(to_jsonb(d)::text,'|' order by d.id),'')) into v_signature from public.delivery_orders d where delivery_date between p_start and p_end;
 insert into public.management_invoice_sync_state(period_start,revision,orders_signature,last_batch_id,last_result,synced_at)
 values(p_start,p_revision,v_signature,v_batch,v_result,now()) on conflict(period_start) do update set
 revision=excluded.revision,orders_signature=excluded.orders_signature,last_batch_id=excluded.last_batch_id,last_result=excluded.last_result,synced_at=now();
 return v_result;
end; $$;
revoke all on function public.ingest_management_invoice_snapshot_v1(text,date,date,bigint,jsonb,boolean) from public;
grant execute on function public.ingest_management_invoice_snapshot_v1(text,date,date,bigint,jsonb,boolean) to anon,authenticated,service_role;
