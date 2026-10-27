import assert from 'node:assert/strict'
import test from 'node:test'
import { isRiderOrderCountable, riderOrderEarning, uniqueDeliveryInvoiceValue } from '../src/lib/duplicateVisitAccounting.ts'

const first = { id: 'first', invoice_number: '٨٩٠١', branch_id: 'branch-a', status: 'delivered',
  duplicate_review_status: 'approved', is_countable: true, not_countable: false, invoice_amount: 325,
  order_earning: 0, order_rate: 0, order_multiplier: 1 }
const second = { ...first, id: 'second', invoice_number: '8901', is_duplicate_invoice: true,
  order_multiplier: 1.5, duplicate_reason: 'missing_item', duplicate_note: 'رجع تاني لصنف ناقص' }

test('two verified visits earn independent ×1 and ×1.5 credits, with one invoice amount', () => {
  assert.equal(isRiderOrderCountable(first), true)
  assert.equal(isRiderOrderCountable(second), true)
  assert.equal(riderOrderEarning(first, 12), 12)
  assert.equal(riderOrderEarning(second, 12), 18)
  assert.equal(uniqueDeliveryInvoiceValue([first, second]), 325)
})

test('changing the rider does not duplicate invoice sales, but changes credit ownership', () => {
  assert.equal(uniqueDeliveryInvoiceValue([first, { ...second, rider_id: 'rider-two' }]), 325)
  assert.equal(uniqueDeliveryInvoiceValue([first, { ...second, branch_id: 'branch-b' }]), 650)
})

test('rejected, pending, failed and excluded visits never earn a payout', () => {
  for (const patch of [{ duplicate_review_status: 'pending' }, { not_countable: true },
    { status: 'failed' }, { excluded_from_incentive: true }, { is_countable: false, final_count_status: 'pending_reconciliation' }]) {
    assert.equal(riderOrderEarning({ ...first, ...patch }, 12), 0)
  }
})

test('manager-verified return visit can earn credit but an ordinary return cannot', () => {
  assert.equal(riderOrderEarning({ ...second, status: 'returned', duplicate_reason: 'return' }, 12), 18)
  assert.equal(riderOrderEarning({ ...second, status: 'returned', duplicate_reason: 'return', duplicate_review_status: 'pending' }, 12), 0)
  assert.equal(riderOrderEarning({ ...second, status: 'returned', duplicate_reason: 'invoice_correction' }, 12), 0)
})

test('explicit positive earnings remain authoritative, but zero-default rows use rider rate', () => {
  assert.equal(riderOrderEarning({ ...second, order_earning: 22 }, 12), 22)
  assert.equal(riderOrderEarning({ ...second, order_earning: 0, order_rate: 15 }, 12), 22.5)
})
