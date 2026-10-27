import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { writeReconciliationBatchChunks, finalizeReconciliationBatch } from '../src/lib/reconciliationBatchWrite.ts'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('incremental import retains verified matching, conflict checks and immutable snapshots', () => {
  const page = read('../src/pages/admin/Reconciliation.tsx')
  assert.match(page, /const dedupeKey = systemInvoiceKey\(invoice, branchName\)/)
  assert.match(page, /findInvoiceEvidenceConflicts\(uploadedInvoices, existingInvoices, normalizeBranchName\)/)
  assert.match(page, /const accumulatedRows = await fetchAllRows/)
  assert.match(page, /selectVerifiedSystemInvoice\(\{/)
  assert.match(page, /preserveHumanDecision\(order as any\)/)
  assert.match(page, /writeReconciliationBatchChunks\(supabase\.rpc\.bind\(supabase\) as any, \{/)
  assert.match(page, /kind: 'invoice'/)
  assert.match(page, /kind: 'result'/)
  assert.match(page, /await finalizeReconciliationBatch\(/)
  assert.match(page, /const updateResults = await Promise\.all\(updates\)/)
  assert.ok(page.indexOf('await finalizeReconciliationBatch(') < page.indexOf('const updateResults = await Promise.all(updates)'),
    'order projections can only be written after a finalized import snapshot')
  assert.doesNotMatch(page, /monthly_invoice_reconciliation_results'\)\.delete\(\)/)
  assert.match(page, /matched_customer_name_mismatch/)
})

test('batch chunks are sequential and cannot retry a failed ambiguous write', async () => {
  const observed = []
  const rpc = async (name, args) => {
    observed.push({ name, args })
    if (observed.length === 2) return { error: Error('network timeout') }
    return { error: null }
  }
  await assert.rejects(writeReconciliationBatchChunks(rpc, {
    token: 'test-token', batchId: 'batch-test', kind: 'invoice', rows: Array.from({ length: 60 }, (_, i) => i),
  }), /network timeout/)
  assert.equal(observed.length, 2)
  assert.deepEqual(observed.map(call => call.args.p_rows.length), [25, 25])
  assert.deepEqual(observed.map(call => call.args.p_rows[0]), [0, 25])
  assert.ok(observed.every(call => call.name === 'write_delivery_reconciliation_chunk_v1'))
})

test('finalizing a batch requires server confirmation of the exact result count', async () => {
  const rpc = async (_name, args) => ({ data: args.p_expected_results - 1, error: null })
  await assert.rejects(finalizeReconciliationBatch(rpc, {
    token: 'test-token', batchId: 'batch-test', expectedResults: 3,
  }), /reconciliation_completion_unconfirmed/)
  await finalizeReconciliationBatch(async () => ({ data: 3, error: null }), {
    token: 'test-token', batchId: 'batch-test', expectedResults: 3,
  })
})

test('CI verifies tracked reconciliation source rather than mutating it with historical scripts', () => {
  const workflow = read('../.github/workflows/test-incremental-reconciliation.yml')
  assert.match(workflow, /node --test tests\/incrementalReconciliationContract\.test\.mjs/)
  assert.doesNotMatch(workflow, /\bnode scripts\/patch-/)
  assert.match(workflow, /pnpm exec tsc --noEmit --pretty false/)
  assert.match(workflow, /pnpm exec vite build/)
})
