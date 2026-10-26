import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/lib/duplicateUnifiedDecision.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/delivery_duplicate_unified_decision_v1_review.sql', import.meta.url), 'utf8')

test('RPC sends one atomic request, never two independent row updates', () => {
  assert.match(source, /rpc\('review_duplicate_invoice_pair_v1'/)
  assert.match(source, /p_first_order_id: input.firstOrderId/)
  assert.match(source, /p_second_order_id: input.secondOrderId/)
  assert.doesNotMatch(source, /\.from\('delivery_orders'\)\.update/)
})

test('unsafe requests fail closed before write', () => {
  assert.match(source, /input.firstOrderId === input.secondOrderId/)
  assert.match(source, /input.choice === 'both'/)
  assert.match(source, /!input.rejectionReason.trim\(\)/)
  assert.match(source, /استجابة الحفظ غير مكتملة/)
})

test('SQL identifiers and rejection field match current Production schema', () => {
  assert.match(sql, /order_id text not null/)
  assert.match(sql, /p_first_order_id text/)
  assert.match(sql, /p_second_order_id text/)
  assert.match(sql, /review_reason = case when/)
  assert.doesNotMatch(sql, /duplicate_rejection_reason|order_id uuid/)
  assert.match(sql, /normalize_delivery_reconciliation_invoice/)
  assert.doesNotMatch(sql, /v_first\.delivery_date, v_first\.work_date/)
  assert.doesNotMatch(sql, /o\.delivery_date, o\.work_date/)
})
