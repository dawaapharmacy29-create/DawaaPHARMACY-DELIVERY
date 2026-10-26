import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const manager = readFileSync(new URL('../src/pages/admin/DuplicateInvoices.tsx', import.meta.url), 'utf8')
const reviewSql = readFileSync(new URL('../supabase/delivery_duplicate_unified_decision_v1_review.sql', import.meta.url), 'utf8')

test('manager never preselects a rejection explanation', () => {
  assert.match(manager, /useState\(''\)/)
  assert.match(manager, /setDecisionRejectReason\(''\)/)
  assert.match(manager, /اختار سبب الرفض بنفسك/)
  assert.match(manager, /سبب الرفض لم يُحدد/)
})

test('unified decision can be committed atomically through the manager gateway, but never double-credits', () => {
  assert.match(manager, /rpc\('review_duplicate_invoice_pair_v1'/)
  assert.match(manager, /اعتماد القرار النهائي/)
  assert.match(manager, /savingPairDecision/)
  assert.match(manager, /بانتظار تحقق الحسابات/)
  assert.match(reviewSql, /dual_approval_requires_accounting_verification/)
  assert.match(reviewSql, /approved_order_has_other_exclusion/)
})

test('proposed transaction enforces manager access and an audit trail', () => {
  assert.match(reviewSql, /assert_delivery_reconciliation_manager_v1\(p_token\)/)
  assert.match(reviewSql, /order by o\.id for update/)
  assert.match(reviewSql, /duplicate_decision_already_final/)
  assert.match(reviewSql, /rejection_reason_required/)
  assert.match(reviewSql, /delivery_duplicate_decision_audit_v1/)
  assert.match(reviewSql, /revoke all on function public\.review_duplicate_invoice_pair_v1/)
})

test('uncertain network response reconciles both records without retrying a write', () => {
  assert.match(manager, /boundedDecisionRequest\(supabase\.rpc\('review_duplicate_invoice_pair_v1'/)
  assert.match(manager, /isUnifiedDecisionCommitted\(String\(first\.id\), String\(second\.id\), decisionChoice\)/)
  assert.match(manager, /order\?\.duplicate_review_status === \(shouldApprove \? 'approved' : 'rejected'\)/)
  assert.match(manager, /order\.not_countable === !shouldApprove && order\.needs_review === false/)
  assert.match(manager, /setDecisionUncertain\(true\)/)
  assert.match(manager, /decisionUncertain \|\| !decisionGroup/)
  assert.match(manager, /تحقق من القرار/)
  assert.doesNotMatch(manager, /await loadAll\(\)\s*}\s*finally\s*{\s*decidingRef/)
})
