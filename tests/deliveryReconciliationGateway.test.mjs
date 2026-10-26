import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let PGlite
try { ;({ PGlite } = require(process.env.DAWAA_PGLITE_MODULE || '@electric-sql/pglite')) } catch {}

test('privileged gateway is idempotent and refuses conflicting evidence', { skip: !PGlite && 'PGlite unavailable' }, async () => {
  const db = new PGlite()
  const token = 'm'.repeat(25)
  try {
    await db.exec(`
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create role anon;
      create role authenticated;
      create schema dawaa_private;
      create table public.user_profiles(id uuid, role text, status text);
      create table public.rider_accounts(id uuid primary key, role text, status text);
      create table public.rider_sessions(session_token text, account_id uuid, expires_at timestamptz, revoked_at timestamptz, revoked boolean);
      create table public.monthly_invoice_import_batches(
        id uuid primary key, period_start date, period_end date, file_name text,
        total_rows integer, delivery_rows integer, uploaded_by uuid,
        uploaded_by_name text, status text, created_at timestamptz, matched_at timestamptz
      );
      create table public.monthly_system_invoices(
        id uuid primary key default gen_random_uuid(), batch_id uuid,
        period_start date, period_end date, invoice_number text, invoice_type text,
        branch_name text, normalized_branch_name text, customer_code text,
        customer_name text, customer_phone text, delivery_address text,
        invoice_date_text text, gross_total numeric, net_total numeric,
        system_user_name text, close_time_text text, raw_json jsonb,
        invoice_cycle_key text not null unique
      );
      create table public.monthly_invoice_reconciliation_results(
        id uuid primary key default gen_random_uuid(), batch_id uuid,
        period_start date, period_end date, invoice_number text,
        rider_id uuid, rider_name text, app_order_id uuid, match_status text not null,
        difference_reason text, app_amount numeric, system_amount numeric,
        app_customer_code text, system_customer_code text, app_customer_name text,
        system_customer_name text, app_branch_name text, system_branch_name text,
        is_countable boolean, needs_review boolean, raw_json jsonb
      );
      insert into public.rider_accounts values
        ('11111111-1111-4111-8111-111111111111','general_manager','active'),
        ('22222222-2222-4222-8222-222222222222','rider','active');
      insert into public.rider_sessions values
        ('${token}','11111111-1111-4111-8111-111111111111',now()+interval '1 hour',null,false),
        ('${'r'.repeat(25)}','22222222-2222-4222-8222-222222222222',now()+interval '1 hour',null,false);
      insert into public.monthly_invoice_import_batches values
        ('33333333-3333-4333-8333-333333333333','2026-09-26','2026-10-25','x',10,1,null,null,'started',now(),null),
        ('44444444-4444-4444-8444-444444444444','2026-09-26','2026-10-25','old',10,1,null,null,'matched',now(),now());
      insert into public.monthly_invoice_reconciliation_results
        (batch_id,period_start,period_end,match_status)
        values ('44444444-4444-4444-8444-444444444444','2026-09-26','2026-10-25','manual_override');
      grant usage on schema public to anon;
    `)
    const sql = await readFile(new URL('../supabase/delivery_reconciliation_write_gateway_v1_review.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    const invoice = { invoice_number:'73006', normalized_branch_name:'شكري', branch_name:'شكري', customer_code:'17777',net_total:675,gross_total:675 }
    const call = (t,kind,rows) => `select public.write_delivery_reconciliation_chunk_v1('${t}','33333333-3333-4333-8333-333333333333','${kind}', '${JSON.stringify(rows)}'::jsonb) as n`
    await db.exec('set role anon')
    await assert.rejects(() => db.query(call('r'.repeat(25),'invoice',[invoice])), /not_authorized/)
    let result = await db.query(call(token,'invoice',[invoice]))
    assert.equal(result.rows[0].n,1)
    result = await db.query(call(token,'invoice',[invoice]))
    assert.equal(result.rows[0].n,0)
    await assert.rejects(() => db.query(call(token,'invoice',[{...invoice,net_total:700}])),/invoice_evidence_conflict/)
    const row = { invoice_number:'73006', app_order_id:'55555555-5555-4555-8555-555555555555', match_status:'matched', is_countable:true }
    result = await db.query(call(token,'result',[row]))
    assert.equal(result.rows[0].n,1)
    result = await db.query(call(token,'result',[row]))
    assert.equal(result.rows[0].n,0)
    await assert.rejects(() => db.query(`select public.finish_delivery_reconciliation_batch_v1('${token}','33333333-3333-4333-8333-333333333333',2)`),/incomplete_results_batch/)
    result = await db.query(`select public.finish_delivery_reconciliation_batch_v1('${token}','33333333-3333-4333-8333-333333333333',1) as n`)
    assert.equal(result.rows[0].n,1)
    await assert.rejects(() => db.query(call(token,'result',[row])),/batch_not_open/)
    await db.exec('reset role')
    const counts = await db.query("select count(*)::int as n from public.monthly_invoice_reconciliation_results")
    assert.equal(counts.rows[0].n,2)
  } finally { await db.close() }
})
