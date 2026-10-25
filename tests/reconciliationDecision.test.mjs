import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  classifyMissingSystemInvoice,
  findInvoiceEvidenceConflicts,
  hasUnambiguousInvoiceSource,
  isConfirmedAdminExclusion,
  preserveHumanDecision,
  selectVerifiedSystemInvoice,
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

test('a rider working at another branch can match unique verified invoice', () => {
  const invoice = { branch_name: 'Shokry', customer_code: '17777', invoice_amount: 675 }
  assert.equal(selectVerifiedSystemInvoice(
    { branch_name: 'Shamy', customer_code: '17777', invoice_amount: 675 },
    [invoice], value => value.toLowerCase(),
  ), invoice)
})

test('different customer or amount cannot be auto-matched across branches', () => {
  const invoice = { branch_name: 'Shokry', customer_code: '17777', invoice_amount: 675 }
  const norm = value => value.toLowerCase()
  assert.equal(selectVerifiedSystemInvoice(
    { branch_name: 'Shamy', customer_code: '99999', invoice_amount: 675 }, [invoice], norm,
  ), null)
  assert.equal(selectVerifiedSystemInvoice(
    { branch_name: 'Shamy', customer_code: '17777', invoice_amount: 700 }, [invoice], norm,
  ), null)
})

test('two branches with the same invoice number require independent customer and amount evidence', () => {
  const a = { branch_name: 'Shokry', customer_code: '17777', invoice_amount: 675 }
  const b = { branch_name: 'Shamy', customer_code: '34567', invoice_amount: 675 }
  const norm = value => value.toLowerCase()
  assert.equal(selectVerifiedSystemInvoice(
    { branch_name: 'Other', customer_code: '17777', invoice_amount: 675 }, [a, b], norm,
  ), a)
  assert.equal(selectVerifiedSystemInvoice(
    { branch_name: 'Other', invoice_amount: 675 }, [a, b], norm,
  ), null)
})

test('partial file import cannot trigger legacy precise reconciliation through monthly archive', () => {
  const page = readFileSync(new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url), 'utf8')
  const safeWrapper = readFileSync(new URL('../src/pages/admin/ReconciliationSafe.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /supabase\.rpc\(['"]archive_monthly_rider_performance['"]/) 
  assert.doesNotMatch(safeWrapper, /originalRpc\(['"]reconcile_delivery_orders_precise['"]/) 
  assert.match(safeWrapper, /functionName === 'reconcile_delivery_orders_precise'/)
  assert.match(safeWrapper, /RECONCILIATION_ARCHIVE_REQUIRES_VERIFIED_COVERAGE/)
})

test('missing system invoice is a report observation and never writes an order patch', () => {
  const page = readFileSync(new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url), 'utf8')
  const missingBranch = page.split('} else if (!match) {')[1]?.split('} else if (isDuplicate) {')[0]
  assert.ok(missingBranch, 'the missing-invoice branch must exist')
  assert.match(missingBranch, /reconciliationStatus = 'pending_source_coverage'/)
  assert.match(missingBranch, /patch = \{\}/)
  assert.doesNotMatch(missingBranch, /final_count_status:|is_countable:|count_exclusion_reason:|order_earning:/)
})

test('re-uploading invoices cannot overwrite existing source evidence', () => {
  const safeWrapper = readFileSync(new URL('../src/pages/admin/ReconciliationSafe.tsx', import.meta.url), 'utf8')
  const systemInvoices = safeWrapper.split("if (tableName === 'monthly_system_invoices') {")[1]?.split('return Promise.resolve(mode ===')[0]
  assert.ok(systemInvoices, 'system invoice write path must exist')
  assert.match(systemInvoices, /onConflict: 'invoice_cycle_key'/)
  assert.match(systemInvoices, /ignoreDuplicates: true/)
})

test('conflicting re-uploaded invoice is blocked before the batch is saved', () => {
  const normalize = value => value.trim().toLowerCase()
  const existing = [
    { invoice_number: '73006', branch_name: 'Shokry', customer_code: '17777', net_total: 675 },
    { invoice_number: '73006', branch_name: 'Shamy', customer_code: '99999', net_total: 675 },
  ]
  assert.deepEqual(findInvoiceEvidenceConflicts([
    { invoice_number: '73006', branch_name: 'Shokry', customer_code: '17777', invoice_amount: 675 },
    { invoice_number: '73006', branch_name: 'Shamy', customer_code: '12345', invoice_amount: 700 },
    { invoice_number: '74000', branch_name: 'Shamy', customer_code: '17777', invoice_amount: 100 },
  ], existing, normalize), [{
    invoiceNumber: '73006', branch: 'shamy',
    reasons: ['كود العميل مختلف', 'قيمة الفاتورة مختلفة'],
    previousAmount: 675, incomingAmount: 700,
  }])

  const page = readFileSync(new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url), 'utf8')
  assert.ok(page.indexOf('findInvoiceEvidenceConflicts(uploadedInvoices, existingInvoices') < page.indexOf("supabase.rpc('save_monthly_invoice_import_batch'"))
})

test('duplicate invoices inside a single source file cannot silently discard a conflict', () => {
  const page = readFileSync(new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url), 'utf8')
  const parser = page.split('function parseBConnectRows(')[1]?.split('function normalizeOrderInvoice(')[0]
  assert.ok(parser)
  assert.match(parser, /const seen = new Map<string, BConnectRow>\(\)/)
  assert.match(parser, /findInvoiceEvidenceConflicts\(\[parsed\], \[previous\], normalizeBranchName\)/)
  assert.match(parser, /throw new Error\(`الملف يحتوي فاتورة مكررة ببيانات متعارضة/)
  assert.doesNotMatch(parser, /if \(!invoice \|\| seen\.has\(dedupeKey\)\) continue/)
})
