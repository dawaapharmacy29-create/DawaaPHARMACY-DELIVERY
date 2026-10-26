import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/delivery_visit_manager_review_v1_review.sql', import.meta.url), 'utf8')

test('manager decision requires verified authorization, evidence and an audit', () => {
  assert.match(sql, /assert_delivery_reconciliation_manager_v1\(p_token\)/)
  assert.match(sql, /coalesce\(length\(btrim\(p_evidence_note\)\),0\) < 10/)
  assert.match(sql, /visit_review_already_final/)
  assert.match(sql, /for update/)
  assert.match(sql, /insert into dawaa_private\.delivery_visit_review_audit_v1/)
  assert.match(sql, /reviewed_by = v_actor/)
})

test('manager approval does not create a second invoice or value credit', () => {
  assert.doesNotMatch(sql, /insert into public\.delivery_orders/)
  assert.doesNotMatch(sql, /update public\.delivery_orders/)
  assert.match(sql, /'commercial_invoice_created',false/)
  assert.match(sql, /'commercial_amount_credited',false/)
  assert.match(sql, /REVIEW ONLY; NOT APPLIED/)
})

test('manager pending queue is guarded and bounded', () => {
  assert.match(sql, /list_delivery_visit_reviews_v1/)
  assert.match(sql, /p_limit > 200/)
  assert.match(sql, /where e\.visit_credit_status = 'pending'/)
  assert.match(sql, /revoke all on dawaa_private\.delivery_visit_review_audit_v1/)
})

test('rider visit credit report is manager guarded and does not authorize payout', () => {
  assert.match(sql, /list_delivery_rider_visit_credit_v1/)
  assert.match(sql, /invalid_visit_credit_period/)
  assert.match(sql, /Africa\/Cairo/)
  assert.match(sql, /where e\.rider_id = p_rider_id/)
  assert.doesNotMatch(sql, /insert into public\.rider_adjustments/)
  assert.doesNotMatch(sql, /update public\.rider_adjustments/)
})
