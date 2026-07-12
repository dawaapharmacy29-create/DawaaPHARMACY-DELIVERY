-- 0077_admin_release_rider_device_lock.sql
-- Safe admin helper to release a rider account from an old/browser device binding.
-- Run from Supabase SQL editor, then call:
--   select public.admin_release_rider_device_lock(p_username := 'USERNAME');
-- or:
--   select public.admin_release_rider_device_lock(p_rider_id := '00000000-0000-0000-0000-000000000000');

create or replace function public.admin_release_rider_device_lock(
  p_username text default null,
  p_rider_id uuid default null,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_account record;
  v_sessions_revoked integer := 0;
  v_account_columns_cleared integer := 0;
  v_device_rows_released integer := 0;
  v_col record;
  v_table text;
  v_set text;
  v_where text;
  v_sql text;
  v_updated integer := 0;
begin
  if p_account_id is null and p_rider_id is null and coalesce(trim(p_username), '') = '' then
    return jsonb_build_object(
      'success', false,
      'error', 'missing_identifier',
      'message', 'اكتب username أو rider_id أو account_id لفك ربط الجهاز'
    );
  end if;

  select * into v_account
  from public.rider_accounts a
  where (p_account_id is not null and a.id = p_account_id)
     or (p_rider_id is not null and a.rider_id = p_rider_id)
     or (coalesce(trim(p_username), '') <> '' and upper(a.username) = upper(trim(p_username)))
  order by a.updated_at desc nulls last, a.created_at desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'account_not_found',
      'message', 'لم يتم العثور على حساب دليفري مطابق'
    );
  end if;

  -- Revoke active sessions so the next login creates a fresh clean session on the new phone.
  if to_regclass('public.rider_sessions') is not null then
    update public.rider_sessions
       set revoked = true,
           revoked_at = now()
     where coalesce(revoked, false) = false
       and (
         (v_account.id is not null and account_id = v_account.id)
         or (v_account.rider_id is not null and rider_id = v_account.rider_id)
       );
    get diagnostics v_sessions_revoked = row_count;
  end if;

  -- Clear common nullable device binding columns if they exist.
  for v_col in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rider_accounts'
      and is_nullable = 'YES'
      and column_name in (
        'device_id', 'bound_device_id', 'allowed_device_id', 'last_device_id',
        'device_fingerprint', 'device_label', 'device_name', 'device_bound_at',
        'last_device_label', 'last_device_user_agent', 'device_locked_at',
        'last_login_device_id', 'last_login_device_label'
      )
  loop
    execute format('update public.rider_accounts set %I = null where id = $1', v_col.column_name)
      using v_account.id;
    v_account_columns_cleared := v_account_columns_cleared + 1;
  end loop;

  -- Unlock common boolean lock columns if present.
  for v_col in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rider_accounts'
      and data_type = 'boolean'
      and column_name in ('device_locked', 'is_device_locked', 'locked_to_device', 'device_binding_locked')
  loop
    execute format('update public.rider_accounts set %I = false where id = $1', v_col.column_name)
      using v_account.id;
    v_account_columns_cleared := v_account_columns_cleared + 1;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rider_accounts' and column_name = 'updated_at'
  ) then
    update public.rider_accounts set updated_at = now() where id = v_account.id;
  end if;

  -- Release rows from known possible device-binding tables if they exist.
  foreach v_table in array array['rider_account_devices', 'rider_devices', 'rider_device_bindings']
  loop
    if to_regclass('public.' || quote_ident(v_table)) is not null then
      v_set := '';
      v_where := '';

      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='is_active') then
        v_set := v_set || 'is_active = false, ';
      end if;
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='active') then
        v_set := v_set || 'active = false, ';
      end if;
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='status') then
        v_set := v_set || 'status = ''released'', ';
      end if;
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='revoked_at') then
        v_set := v_set || 'revoked_at = now(), ';
      end if;
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='released_at') then
        v_set := v_set || 'released_at = now(), ';
      end if;
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='updated_at') then
        v_set := v_set || 'updated_at = now(), ';
      end if;

      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='account_id') then
        v_where := '(account_id = $1)';
      end if;
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='rider_id') then
        v_where := case when v_where <> '' then v_where || ' or (rider_id = $2)' else '(rider_id = $2)' end;
      end if;

      if v_set <> '' and v_where <> '' then
        v_set := regexp_replace(v_set, ',\s*$', '');
        v_sql := format('update public.%I set %s where %s', v_table, v_set, v_where);
        execute v_sql using v_account.id, v_account.rider_id;
        get diagnostics v_updated = row_count;
        v_device_rows_released := v_device_rows_released + coalesce(v_updated, 0);
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'message', 'تم فك ربط الجهاز القديم. اطلب من الدليفري تسجيل الدخول من التليفون الجديد.',
    'account_id', v_account.id,
    'rider_id', v_account.rider_id,
    'username', v_account.username,
    'sessions_revoked', v_sessions_revoked,
    'account_columns_cleared', v_account_columns_cleared,
    'device_rows_released', v_device_rows_released
  );
end;
$$;

revoke all on function public.admin_release_rider_device_lock(text, uuid, uuid) from public;
revoke all on function public.admin_release_rider_device_lock(text, uuid, uuid) from anon;
revoke all on function public.admin_release_rider_device_lock(text, uuid, uuid) from authenticated;
