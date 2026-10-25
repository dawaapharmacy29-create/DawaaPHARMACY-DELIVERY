import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyMissingSystemInvoice,
  hasUnambiguousInvoiceSource,
  isConfirmedAdminExclusion,
  preserveHumanDecision,
} from '../src/lib/reconciliationDecision.ts'

test('a partial file never rejects an absent invoice', () => {
  assert.deepEqual(classifyMissingSystemInvoice(), {
    matchStatus: 'pending',
    finalCountStatus: 'pending_reconciliation',
    countExclusionReason: null,
    needsReview: true,
    isCountable: false,
  })
})

test('only an explicit admin reason counts as confirmed exclusion', () => {
  assert.equal(isConfirmedAdminExclusion({ count_exclusion_reason: 'invoice_not_found_in_bconnect' }), false)
  assert.equal(isConfirmedAdminExclusion({ count_exclusion_reason: 'marked_not_found_by_admin' }), true)
})

test('a later import cannot override human decisions', () => {
  assert.equal(preserveHumanDecision({ bconnect_match_status: 'manually_approved' }), true)
  assert.equal(preserveHumanDecision({ count_exclusion_reason: 'marked_not_found_by_admin' }), true)
  assert.equal(preserveHumanDecision({ bconnect_match_status: 'pending' }), false)
})

test('the same number in two source branches needs review', () => {
  const normalize = value => value.trim().toLowerCase()
  assert.equal(hasUnambiguousInvoiceSource([
    { invoice_number: '74857', branch_name: 'Shokry' },
    { invoice_number: '74857', branch_name: 'Shamy' },
  ], normalize), false)
  assert.equal(hasUnambiguousInvoiceSource([
    { invoice_number: '74857', branch_name: 'Shokry' },
  ], normalize), true)
})
