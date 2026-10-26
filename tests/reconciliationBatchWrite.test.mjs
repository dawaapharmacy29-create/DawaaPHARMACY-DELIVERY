import test from 'node:test'
import assert from 'node:assert/strict'
import { writeReconciliationBatchChunks, finalizeReconciliationBatch } from '../src/lib/reconciliationBatchWrite.ts'

test('writes bounded chunks with manager session and preserves order', async () => {
  const calls = []
  const rpc = async (name, args) => { calls.push({ name, args }); return { error: null } }
  await writeReconciliationBatchChunks(rpc, {
    token: 'manager-session', batchId: 'batch-1', kind: 'invoice',
    rows: Array.from({ length: 61 }, (_, id) => ({ id })),
  })
  assert.deepEqual(calls.map(call => call.args.p_rows.length), [25, 25, 11])
  assert.deepEqual(calls.flatMap(call => call.args.p_rows.map(r => r.id)), Array.from({ length: 61 }, (_, id) => id))
  assert.ok(calls.every(call => call.name === 'write_delivery_reconciliation_chunk_v1' && call.args.p_token === 'manager-session'))
})

test('a failed chunk does not proceed or finalize', async () => {
  let attempts = 0
  const rpc = async () => ({ error: ++attempts === 2 ? new Error('database_rejected') : null })
  await assert.rejects(() => writeReconciliationBatchChunks(rpc, {
    token: null, batchId: 'batch-1', kind: 'result', rows: Array.from({ length: 76 }, () => ({})),
  }), /database_rejected/)
  assert.equal(attempts, 2)
})

test('completion requires the exact expected result count', async () => {
  const rpc = async (_, args) => ({ data: args.p_expected_results, error: null })
  await finalizeReconciliationBatch(rpc, { token: null, batchId: 'batch-1', expectedResults: 17 })
  await assert.rejects(() => finalizeReconciliationBatch(async () => ({ data: 16, error: null }), {
    token: null, batchId: 'batch-1', expectedResults: 17,
  }), /reconciliation_completion_unconfirmed/)
})
