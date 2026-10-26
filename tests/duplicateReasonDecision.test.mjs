import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('both rider entry points require reason but never require extra note', () => {
  const dashboard = source('../src/pages/rider/RiderDashboard.tsx')
  const quick = source('../src/components/rider/RiderQuickOrderForm.tsx')
  const helper = source('../src/lib/helpers.ts')
  assert.match(dashboard, /if \(isDup && !dupReason\)/)
  assert.match(quick, /if \(duplicateRequired && !duplicateReason\)/)
  assert.doesNotMatch(dashboard, /if \(isDup && effectiveDupNote\.length/)
  assert.doesNotMatch(quick, /if \(duplicateRequired && effectiveDuplicateNote\.length/)
  assert.match(dashboard, /ملاحظة إضافية \(اختيارية\)/)
  assert.match(quick, /ملاحظة إضافية \(اختيارية\)/)
  assert.match(dashboard, /DUPLICATE_REASON_HINTS\[dupReason\]/)
  assert.match(quick, /DUPLICATE_REASON_HINTS\[duplicateReason\]/)
  for (const code of ['customer_added_items', 'preparation_error', 'return', 'second_visit', 'invoice_correction', 'other']) {
    assert.match(helper, new RegExp(`\\b${code}:`))
  }
})

test('decision displays direct duplicate note before technical feed', () => {
  const details = source('../src/components/OrderDetailsModal.tsx')
  const manager = source('../src/pages/admin/DuplicateInvoices.tsx')
  const reconciliation = source('../src/pages/admin/Reconciliation.tsx')
  assert.match(details, /duplicateReasonLabel\(order\.duplicate_reason\)/)
  assert.match(details, /ملاحظة المندوب: \$\{duplicateNote\}/)
  assert.match(details, /showTechnical \? unifiedNotes : businessNotes/)
  assert.match(details, /GPS accuracy:/)
  assert.match(details, /businessNoteText\(note\)/)
  assert.match(manager, /duplicateReasonLabel\(duplicateReason\)/)
  assert.match(manager, /if \(!duplicateReason\)/)
  assert.doesNotMatch(manager, /duplicateNote\.length < 8/)
  assert.match(reconciliation, /duplicateReasonLabel\(\(order as any\)\.duplicate_reason\)/)
  assert.match(reconciliation, /duplicate_review_status !== 'approved'/)
})

test('database cutover only relaxes optional context, preserving required reason', () => {
  const sql = source('../supabase/delivery_duplicate_reason_optional_note_review.sql')
  assert.match(sql, /duplicate_reason_production_contract_changed/)
  assert.match(sql, /v_rpc_note_condition/)
  assert.match(sql, /v_trigger_note_condition/)
  assert.match(sql, /v_trigger_doctor_condition/)
  assert.doesNotMatch(sql, /drop function|drop trigger|delete from/i)
})
