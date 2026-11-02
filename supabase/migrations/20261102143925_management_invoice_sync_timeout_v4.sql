-- Scoped background RPC budget; public role/database timeouts remain unchanged.
alter function public.ingest_management_invoice_snapshot_v1(text,date,date,bigint,jsonb,boolean) set statement_timeout='90s';
notify pgrst,'reload schema';
notify pgrst,'reload config';
