import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/delivery_invoice_single_write_guard_v1_review.sql', import.meta.url), 'utf8')
const reconciliationPage = readFileSync(new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url), 'utf8')

test('all first-time INSERTs lock exactly the branch and normalized invoice key', () => {
  assert.match(sql, /before insert on public\.delivery_orders/i)
  assert.match(sql, /dawaa_private\.delivery_invoice_key_v1/)
  assert.match(sql, /new\.branch_id::text \|\| ':' \|\| v_key/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.doesNotMatch(sql, /delivery_date\s*=|v_today\s*-|p_rider_id\s*\|\|/i)
})

test('existing invoice rejected even with duplicate reason; visit is a separate event', () => {
  assert.match(sql, /delivery_invoice_identities_v1 i/)
  assert.match(sql, /public\.delivery_orders old/)
  assert.match(sql, /invoice_already_registered_use_repeated_visit_gateway/)
  assert.doesNotMatch(sql, /p_duplicate_reason|new\.duplicate_reason/)
  assert.match(sql, /values \(new\.branch_id, v_key, new\.id, 'verified'\)/)
})

test('rollout remains gated, including immutable-key updates', () => {
  assert.match(sql, /REVIEW ONLY; DO NOT APPLY TO PRODUCTION/)
  assert.match(sql, /^-- create trigger trg_delivery_invoice_guard_before_insert_v1/m)
  assert.match(sql, /^-- create trigger trg_delivery_invoice_identity_after_insert_v1/m)
  assert.match(sql, /^-- create trigger trg_delivery_invoice_guard_before_update_v1/m)
  assert.match(sql, /old\.branch_id is distinct from new\.branch_id/)
  assert.match(sql, /v_old_key is distinct from v_new_key/)
  assert.match(sql, /invoice_identity_change_requires_manager_review/)
  assert.match(sql, /invoice_number_columns_disagree/)
  assert.match(sql, /delivery_invoice_key_v1\(old\.invoice_no\)/)
  assert.match(sql, /delivery_invoice_key_v1\(new\.invoice_no\)/)
})

test('reconciliation invoice corrections keep both legacy invoice fields aligned', () => {
  assert.match(reconciliationPage, /\.from\('delivery_orders'\)\.update\(\{\s*invoice_number: invoiceNumber,\s*(?:\/\/[^\n]*\n\s*)*invoice_no: invoiceNumber,/)
})
