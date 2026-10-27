import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canReviewDuplicatePair, isDuplicateReviewPending, patchCommittedDuplicateOrders } from '../src/lib/duplicateInvoiceReviewState.ts'

const manager = readFileSync(new URL('../src/pages/admin/DuplicateInvoices.tsx', import.meta.url), 'utf8')

test('finalized pairs leave the action queue but remain available for history', () => {
  const orders = [
    { id: 'a', duplicate_review_status: 'not_required', needs_review: false, not_countable: false },
    { id: 'b', duplicate_review_status: 'pending', needs_review: true, not_countable: false },
  ]
  assert.ok(orders.some(isDuplicateReviewPending))
  assert.equal(canReviewDuplicatePair(orders), true)
  const result = patchCommittedDuplicateOrders(orders, new Map([['a', 'rejected'], ['b', 'approved']]))
  assert.equal(result.some(isDuplicateReviewPending), false)
  assert.equal(canReviewDuplicatePair(result), false)
  assert.deepEqual(result.map(row => row.duplicate_review_status), ['rejected', 'approved'])
  assert.deepEqual(result.map(row => row.not_countable), [true, false])
  assert.deepEqual(result.map(row => row.needs_review), [false, false])
  assert.equal(result.length, 2)
  assert.equal(orders[0].duplicate_review_status, 'not_required')
})

test('partially reviewed group stays actionable', () => {
  const orders = [
    { id: 'a', duplicate_review_status: 'approved', needs_review: false, not_countable: false },
    { id: 'b', duplicate_review_status: 'pending', needs_review: true, not_countable: false },
  ]
  assert.ok(orders.some(isDuplicateReviewPending))
  assert.equal(canReviewDuplicatePair(orders), false, 'already-approved first record cannot use atomic pair gateway')
  const result = patchCommittedDuplicateOrders(orders, new Map([['b', 'rejected']]))
  assert.equal(result.some(isDuplicateReviewPending), false)
  assert.equal(result[0].not_countable, false)
  assert.equal(result[1].not_countable, true)
})

test('manager defaults to pending, hides finalized actions and confirms state faster', () => {
  assert.match(manager, /useState<'all' \| 'pending' \| 'approved' \| 'rejected'>\('pending'\)/)
  assert.match(manager, /group\.entries\.some\(isDuplicateReviewPending\)/)
  assert.match(manager, /entries\.every\(entry => !isDuplicateReviewPending\(entry\)\)/)
  assert.match(manager, /canReviewDuplicatePair\(entries\)/)
  assert.match(manager, /Promise\.race\(\[rpc, observed\.then/)
  assert.match(manager, /applyCommittedPair\(String\(first\.id\), String\(second\.id\)/)
  assert.match(manager, /decisionRevisionRef\.current \+= 1/)
  assert.match(manager, /كل الفواتير والسجل/)
})
