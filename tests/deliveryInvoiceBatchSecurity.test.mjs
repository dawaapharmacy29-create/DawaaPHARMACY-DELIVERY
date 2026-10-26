import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let PGlite
try {
  ;({ PGlite } = require(process.env.DAWAA_PGLITE_MODULE || '@electric-sql/pglite'))
} catch {
  // Standalone fixture requires the optional PGlite dev dependency.
}

const schema = `
create schema auth;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('app.mock_uid', true), '')::uuid $$;
create role anon;
create role authenticated;
create schema dawaa_private;
create table public.user_profiles (id uuid primary key, role text, status text);
create table public.rider_accounts (id uuid primary key, role text, status text);
create table public.rider_sessions (
  session_token text, account_id uuid, expires_at timestamptz,
  revoked_at timestamptz, revoked boolean
);
create table public.monthly_invoice_import_batches (
  id uuid primary key default gen_random_uuid(),
  period_start date not null, period_end date not null,
  file_name text, total_rows integer, delivery_rows integer,
  uploaded_by uuid, uploaded_by_name text, status text,
  created_at timestamptz, matched_at timestamptz
);
create table public.monthly_system_invoices (
  id uuid primary key default gen_random_uuid(), batch_id uuid references public.monthly_invoice_import_batches(id)
);
grant usage on schema public to anon,authenticated;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
`

test('manager-only batch creation never removes old evidence', { skip: !PGlite && 'PGlite dev dependency unavailable' }, async () => {
  const db = new PGlite()
  try {
    await db.exec(schema)
    await db.exec(await readFile(new URL('../supabase/delivery_invoice_batch_v2_review.sql', import.meta.url), 'utf8'))
    await db.exec(`
      insert into public.rider_accounts values
        ('11111111-1111-4111-8111-111111111111','general_manager','active'),
        ('22222222-2222-4222-8222-222222222222','rider','active');
      insert into public.rider_sessions values
        (repeat('m',24),'11111111-1111-4111-8111-111111111111',now()+interval '1 hour',null,false),
        (repeat('r',24),'22222222-2222-4222-8222-222222222222',now()+interval '1 hour',null,false);
      insert into public.monthly_invoice_import_batches
        (id,period_start,period_end,file_name,status)
      values ('33333333-3333-4333-8333-333333333333','2026-09-26','2026-10-25','same.xlsx','failed');
      insert into public.monthly_system_invoices
        (id,batch_id) values ('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333');
    `)
    const call = token => `select public.save_monthly_invoice_import_batch_v2('${token}','2026-09-26','2026-10-25','same.xlsx',2,1)`
    await assert.rejects(() => db.query(call('r'.repeat(24))), /not_authorized/)
    await assert.rejects(() => db.query(call('x'.repeat(24))), /not_authorized/)
    await assert.rejects(() => db.query(`select public.save_monthly_invoice_import_batch_v2('${'m'.repeat(24)}','2026-09-25','2026-10-25','same.xlsx',2,1)`), /invalid_cycle/)
    await db.query(call('m'.repeat(24)))
    const count = await db.query('select count(*)::int as n from public.monthly_invoice_import_batches')
    assert.equal(count.rows[0].n, 2)
    const evidence = await db.query('select count(*)::int as n from public.monthly_system_invoices')
    assert.equal(evidence.rows[0].n, 1)
    const grants = await db.query(`select has_function_privilege('anon','dawaa_private.save_monthly_invoice_import_batch_internal_v2(text,date,date,text,integer,integer)','EXECUTE') as private_access, has_function_privilege('anon','public.save_monthly_invoice_import_batch_v2(text,date,date,text,integer,integer)','EXECUTE') as public_access`)
    assert.deepEqual(grants.rows[0], { private_access: false, public_access: true })
    await db.exec('set role anon')
    try {
      await assert.rejects(() => db.query(call('r'.repeat(24))), /not_authorized/)
      await db.query(call('m'.repeat(24)))
      await assert.rejects(() => db.query(`select dawaa_private.save_monthly_invoice_import_batch_internal_v2('${'m'.repeat(24)}','2026-09-26','2026-10-25','x.xlsx',1,1)`), /permission denied/)
    } finally {
      await db.exec('reset role')
    }
    const final = await db.query('select count(*)::int as n from public.monthly_invoice_import_batches')
    assert.equal(final.rows[0].n, 3)
  } finally {
    await db.close()
  }
})
