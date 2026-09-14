create or replace function public.rider_create_order_v3(
  p_token text,
  p_customer_id uuid,
  p_customer_code text,
  p_customer_name text,
  p_invoice_number text,
  p_invoice_amount numeric default 0,
  p_order_multiplier numeric default 1,
  p_notes text default null,
  p_gps_lat double precision default null,
  p_gps_lng double precision default null,
  p_gps_accuracy_m integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_customer public.delivery_customers%rowtype;
  v_code text := trim(coalesce(p_customer_code,''));
  v_name text := trim(coalesce(p_customer_name,''));
  v_invoice text := trim(coalesce(p_invoice_number,''));
  v_multiplier numeric := coalesce(p_order_multiplier,1);
  v_result jsonb;
  v_manual boolean := false;
begin
  if v_invoice = '' then
    return jsonb_build_object('success',false,'error','invoice_required','message','رقم الفاتورة مطلوب');
  end if;
  if v_code = '' then
    return jsonb_build_object('success',false,'error','customer_code_required','message','كود العميل مطلوب');
  end if;
  if v_multiplier not in (1,1.5) then
    return jsonb_build_object('success',false,'error','invalid_multiplier','message','نوع الأوردر يجب أن يكون ×1 أو ×1.5');
  end if;

  if p_customer_id is not null then
    select * into v_customer
    from public.delivery_customers c
    where c.id=p_customer_id
      and coalesce(c.active,true)=true
      and coalesce(nullif(trim(c.customer_code),''),nullif(trim(c.code),''))=v_code
    limit 1;
  else
    select * into v_customer
    from public.delivery_customers c
    where coalesce(c.active,true)=true
      and coalesce(nullif(trim(c.customer_code),''),nullif(trim(c.code),''))=v_code
    order by c.updated_at desc nulls last, c.created_at desc nulls last
    limit 1;
  end if;

  if v_customer.id is not null then
    select public.rider_create_order(
      p_token => p_token,
      p_customer_id => v_customer.id,
      p_customer_code => v_code,
      p_customer_name => coalesce(nullif(trim(v_customer.customer_name),''),nullif(trim(v_customer.name),''),'عميل غير مسجل'),
      p_customer_phone => coalesce(nullif(trim(v_customer.phone),''),nullif(trim(v_customer.phone2),'')),
      p_customer_address => nullif(trim(v_customer.address),''),
      p_invoice_number => v_invoice,
      p_invoice_amount => coalesce(p_invoice_amount,0),
      p_order_multiplier => v_multiplier,
      p_notes => p_notes,
      p_gps_lat => p_gps_lat,
      p_gps_lng => p_gps_lng,
      p_gps_accuracy_m => p_gps_accuracy_m
    ) into v_result;
  else
    if v_name = '' then
      return jsonb_build_object('success',false,'error','manual_customer_name_required','message','العميل غير موجود. اكتب اسم العميل مع الكود قبل حفظ الأوردر');
    end if;
    v_manual := true;

    select public.rider_create_order(
      p_token => p_token,
      p_customer_id => null,
      p_customer_code => v_code,
      p_customer_name => v_name,
      p_customer_phone => null,
      p_customer_address => null,
      p_invoice_number => v_invoice,
      p_invoice_amount => coalesce(p_invoice_amount,0),
      p_order_multiplier => v_multiplier,
      p_notes => concat_ws(E'\n', nullif(trim(coalesce(p_notes,'')),''), 'عميل جديد من BConnect - إدخال يدوي لحين المزامنة'),
      p_gps_lat => p_gps_lat,
      p_gps_lng => p_gps_lng,
      p_gps_accuracy_m => p_gps_accuracy_m
    ) into v_result;
  end if;

  if coalesce((v_result->>'success')::boolean,false) then
    if v_multiplier >= 1.5 then
      update public.delivery_orders
      set needs_review=true,
          review_reason='multiplier_order',
          review_status='pending',
          approval_status='pending',
          security_flags=coalesce(security_flags,'{}'::jsonb) || jsonb_build_object('manual_customer_entry',v_manual,'manual_customer_code',case when v_manual then v_code else null end),
          updated_at=now()
      where id=(v_result->>'order_id');
    elsif v_manual then
      update public.delivery_orders
      set needs_review=true,
          review_reason='manual_customer_pending_sync',
          review_status='pending',
          approval_status='pending',
          security_flags=coalesce(security_flags,'{}'::jsonb) || jsonb_build_object('manual_customer_entry',true,'manual_customer_code',v_code,'manual_customer_name',v_name),
          updated_at=now()
      where id=(v_result->>'order_id');
    end if;

    v_result := v_result || jsonb_build_object(
      'manual_customer_entry',v_manual,
      'customer_source',case when v_manual then 'manual_bconnect' else 'delivery_customers' end,
      'requires_customer_sync',v_manual,
      'requires_admin_approval',(v_multiplier >= 1.5) or v_manual,
      'message',case
        when v_multiplier >= 1.5 and v_manual then 'تم تسجيل العميل الجديد والأوردر ×1.5، والعملية بانتظار مراجعة الإدارة'
        when v_multiplier >= 1.5 then 'تم تسجيل الأوردر ×1.5 وهو بانتظار اعتماد الإدارة'
        when v_manual then 'تم تسجيل الأوردر للعميل الجديد، وسيتم مزامنته مع قاعدة العملاء لاحقًا'
        else coalesce(v_result->>'message','تم تسجيل الأوردر بنجاح')
      end
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.rider_create_order_v3(text,uuid,text,text,text,numeric,numeric,text,double precision,double precision,integer) from public, authenticated;
grant execute on function public.rider_create_order_v3(text,uuid,text,text,text,numeric,numeric,text,double precision,double precision,integer) to anon;
