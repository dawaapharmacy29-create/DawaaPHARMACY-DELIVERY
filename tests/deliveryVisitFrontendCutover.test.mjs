import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const form = readFileSync(new URL('../src/components/rider/RiderQuickOrderForm.tsx', import.meta.url), 'utf8')
const delivery = readFileSync(new URL('../src/lib/delivery.ts', import.meta.url), 'utf8')
const dashboard = readFileSync(new URL('../src/pages/rider/RiderDashboard.tsx', import.meta.url), 'utf8')

test('quick order duplicate branch calls visit-event RPC, not the old commercial RPC', () => {
  assert.match(form, /supabase\.rpc\('rider_register_repeated_visit_v1'/)
  assert.match(form, /p_client_request_id: repeatedVisitRequestIdRef\.current/)
  assert.match(form, /repeatedVisitRequestIdRef\.current = null/)
  assert.doesNotMatch(form, /supabase\.rpc\('rider_create_order',/)
})

test('visit gateway is off by default and duplicate save fails closed until rollout', () => {
  assert.match(form, /VITE_DELIVERY_VISIT_GATEWAY_V1_ENABLED === 'true'/)
  assert.match(form, /if \(duplicateRequired && !VISIT_GATEWAY_ENABLED\)/)
  assert.match(form, /لن تُحسب كفاتورة تجارية جديدة/)
})

test('deprecated direct insert helper stops before executing any legacy writes', () => {
  const helper = delivery.slice(delivery.indexOf('export async function createDeliveryOrder'), delivery.indexOf('export async function createInternalTrip'))
  assert.match(helper, /throw new Error\('تسجيل الفواتير من المسار القديم/)
  assert.match(helper, /Legacy implementation retained for review/)
})

test('rider dashboard repeated visit takes a separate early-return path', () => {
  assert.match(dashboard, /if \(isDup && !VISIT_GATEWAY_ENABLED\)/)
  assert.match(dashboard, /if \(isDup\) \{\s*const token = getStoredRiderToken/)
  assert.match(dashboard, /supabase\.rpc\('rider_register_repeated_visit_v1'/)
  assert.match(dashboard, /p_client_request_id: repeatedVisitRequestIdRef\.current/)
  assert.match(dashboard, /\.eq\("branch_id", rider\.branch_id\)/)
})
