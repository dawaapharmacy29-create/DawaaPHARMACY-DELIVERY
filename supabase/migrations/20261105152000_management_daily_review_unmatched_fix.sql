-- «من غير فاتورة» counted manually approved and cross-branch matched orders as unmatched (2026-11-05:
-- 443 instead of ~128). Only orders still waiting for an invoice count: pending / invoice_not_found / no status.

do $migration$
declare
  v_def text := pg_get_functiondef('public.management_daily_review_snapshot_v1(text)'::regprocedure);
  v_old text := 'and coalesce(x.match_status, ''pending'') <> ''matched''';
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'patch_not_found';
  end if;
  v_def := replace(v_def, v_old, 'and coalesce(x.match_status, ''pending'') in (''pending'', ''invoice_not_found'')');
  execute v_def;
end;
$migration$;
