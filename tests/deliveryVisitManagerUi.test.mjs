import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/admin/DuplicateInvoices.tsx', import.meta.url), 'utf8')

test('manager visit queue is gated and fetched from the manager-guarded RPC', () => {
  assert.match(page, /VITE_DELIVERY_VISIT_GATEWAY_V1_ENABLED === 'true'/)
  assert.match(page, /list_delivery_visit_reviews_v1/)
  assert.match(page, /getRiderSession\(\)\.session_token/)
  assert.match(page, /p_limit: 200/)
  assert.match(page, /setVisitsError\(/)
})

test('manager visit decision requires evidence, rejection reason, and no automatic financial credit', () => {
  assert.match(page, /review_delivery_visit_v1/)
  assert.match(page, /visitEvidence\.trim\(\)\.length < 10/)
  assert.match(page, /visitRejection\.trim\(\)\.length < 5/)
  assert.match(page, /لن تُضاف فاتورة تجارية جديدة/)
  assert.match(page, /أو يمنح مستحقات مالية تلقائيًا/)
  assert.doesNotMatch(page, /\.from\('delivery_invoice_visit_events_v1'\)\.update/)
})
