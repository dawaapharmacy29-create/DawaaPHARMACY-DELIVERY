import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/delivery_invoice_identity_registry_v1_review.sql', import.meta.url), 'utf8')

test('invoice identity is unique by branch and number without date or rider', () => {
  const identities = sql.slice(sql.indexOf('create table if not exists dawaa_private.delivery_invoice_identities_v1'), sql.indexOf('create table if not exists dawaa_private.delivery_invoice_visit_events_v1'))
  assert.match(identities, /unique \(branch_id, invoice_key\)/)
  assert.match(identities, /invoice_key text not null/)
  assert.doesNotMatch(identities, /unique \([^)]*(work_date|delivery_date|rider_id)/)
})

test('Arabic and Persian digits are converted before database normalization', () => {
  assert.match(sql, /pg_catalog\.translate\(\$1, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'\)/)
  assert.match(sql, /create or replace function dawaa_private\.delivery_invoice_key_v1/)
})

test('repeated visits are stored without a second financial invoice', () => {
  assert.match(sql, /delivery_invoice_visit_events_v1/)
  assert.match(sql, /invoice_identity_id bigint not null/)
  assert.match(sql, /visit_credit_status text not null default 'pending'/)
  assert.doesNotMatch(sql, /invoice_amount|invoice_value|order_earning/)
})

test('historical ambiguity stays unresolved and tables are not public write APIs', () => {
  assert.match(sql, /review_state text not null default 'unresolved'/)
  assert.match(sql, /canonical_order_id text null/)
  assert.match(sql, /revoke all on dawaa_private\.delivery_invoice_identities_v1 from public, anon, authenticated/)
  assert.match(sql, /revoke all on dawaa_private\.delivery_invoice_visit_events_v1 from public, anon, authenticated/)
  assert.match(sql, /REVIEW ONLY: DO NOT APPLY TO PRODUCTION/)
})
