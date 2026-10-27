import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { confirmedTripDecisions } from '../src/lib/confirmedTripDecisions.ts'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('only requested trips whose DB status and review status agree can leave the queue', () => {
  const rows = [
    { id: 'a', status: 'approved', review_status: 'approved' },
    { id: 'b', status: 'pending_approval', review_status: 'pending' },
    { id: 'c', status: 'approved', review_status: 'pending' },
    { id: 'outside', status: 'approved', review_status: 'approved' },
    { id: 'a', status: 'approved', review_status: 'approved' },
  ]
  assert.deepEqual(confirmedTripDecisions(rows, ['a', 'b', 'c'], 'approved').map(row => row.id), ['a'])
  assert.deepEqual(confirmedTripDecisions([], ['a'], 'approved'), [])
  assert.deepEqual(confirmedTripDecisions(null, ['a'], 'approved'), [])
})

test('approval flows require returned DB rows and never retry an ambiguous write', () => {
  const trips = read('../src/pages/admin/TripsFast.tsx')
  const riderActions = read('../src/pages/admin/RiderActions.tsx')
  const reconciliation = read('../src/pages/admin/ReconciliationSafe.tsx')
  assert.match(trips, /\.eq\('status',previousStatus\)/)
  assert.match(trips, /confirmedTripDecisions\(data,ids,status\)/)
  assert.match(trips, /const committed=await confirmedTripRows\(ids,status\)/)
  assert.match(trips, /if\(confirmed.length!==1\)throw/)
  assert.match(riderActions, /\.eq\('review_status', 'pending_general_manager'\)/)
  assert.match(riderActions, /\.maybeSingle\(\)/)
  assert.doesNotMatch(riderActions, /await loadItems\(\)\s*\n\s*} catch/)
  assert.match(reconciliation, /const result: any = await originalRpc\(functionName, args, options\)/)
  assert.doesNotMatch(reconciliation, /withRetry/)
  assert.doesNotMatch(reconciliation, /cloneNode\(true\)|window\.setTimeout\(cleanup, 3200\)/)
  assert.match(reconciliation, /RECONCILIATION_ARCHIVE_REQUIRES_VERIFIED_COVERAGE/)
})

test('review center counts duplicates from their canonical review status and separates BConnect waits', () => {
  const page = read('../src/pages/admin/OperationsReviewCenter.tsx')
  assert.match(page, /\.eq\('duplicate_review_status','pending'\)/)
  assert.match(page, /\.select\('id', \{ count: 'exact', head: true \}\)/)
  assert.match(page, /counts\.duplicatePending/)
  assert.match(page, /\/admin\/duplicate-invoices\?status=pending/)
  assert.doesNotMatch(page, /counts\.awaitingReconciliation\s*:\s*0\)\s*\+/)
})

test('invoice approval actions update one confirmed record without refreshing the cycle', () => {
  const page = read('../src/pages/admin/Reconciliation.tsx')
  assert.match(page, /async function updateOrderWithConfirmation\(/)
  assert.match(page, /if \(!saved\) throw new Error/)
  assert.match(page, /decisionRevisionRef\.current \+= 1/)
  assert.match(page, /await updateOrderWithConfirmation\(orderId, patch\)/)
  assert.match(page, /await updateOrderWithConfirmation\(order\.id, \{/)
  assert.doesNotMatch(page, /toast\.success\('تم حذف الأوردر من الحساب مع حفظ البيان'\)\s*await loadAll\(\)/)
  assert.doesNotMatch(page, /toast\.success\('تم تحويل الأوردر للمندوب الجديد'\)\s*await loadAll\(\)/)
})
