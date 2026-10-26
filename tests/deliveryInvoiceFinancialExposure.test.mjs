import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/delivery_invoice_financial_exposure_readonly.sql', import.meta.url), 'utf8')
const pay = readFileSync(new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url), 'utf8')

test('financial exposure audit groups invoices by branch and normalized identity, regardless of date', () => {
  assert.match(sql, /group by branch_id, invoice_key/)
  assert.match(sql, /'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'/)
  assert.match(sql, /potentially_paid_registrations/)
  assert.match(sql, /pending_legacy_reviews/)
  assert.match(sql, /registrations > 1/)
  assert.match(sql, /date '2026-09-26'/)
  assert.match(sql, /o\.registered_at at time zone 'Africa\/Cairo'/)
  assert.doesNotMatch(sql, /\b(insert|update|delete|truncate|drop|alter|create)\s+(into|from|table|function|trigger|view)\b/i)
})

test('compensation still depends on historical order flags; requires reconciliation before financial cutover', () => {
  assert.match(pay, /order\.is_countable === true/)
  assert.match(pay, /final_count_status/)
  assert.match(pay, /list_delivery_rider_visit_credit_v1/)
  assert.match(pay, /VISIT_GATEWAY_ENABLED/)
  assert.match(pay, /لا تُضاف لقيمة الفاتورة أو صافي الأجر تلقائيًا/)
  assert.doesNotMatch(pay, /from\('delivery_invoice_visit_events_v1'\)/)
})
