import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const form = readFileSync(new URL('../src/components/rider/RiderQuickOrderForm.tsx', import.meta.url), 'utf8')
const delivery = readFileSync(new URL('../src/lib/delivery.ts', import.meta.url), 'utf8')
const dashboard = readFileSync(new URL('../src/pages/rider/RiderDashboard.tsx', import.meta.url), 'utf8')

test('quick order uses the visit gateway after rollout and secure review RPC before rollout', () => {
  assert.match(form, /supabase\.rpc\('rider_register_repeated_visit_v1'/)
  assert.match(form, /p_client_request_id: repeatedVisitRequestIdRef\.current/)
  assert.match(form, /repeatedVisitRequestIdRef\.current = null/)
  assert.match(form, /duplicateRequired && VISIT_GATEWAY_ENABLED/)
})

test('duplicate metadata stays required on the production review RPC', () => {
  assert.match(form, /VITE_DELIVERY_VISIT_GATEWAY_V1_ENABLED === 'true'/)
  assert.match(form, /supabase\.rpc\('rider_create_order',/ )
  assert.match(form, /p_is_duplicate_invoice: true/)
  assert.match(form, /p_duplicate_reason: duplicateReason/)
  assert.match(form, /p_duplicate_note: effectiveDuplicateNote/)
  assert.match(form, /p_preparing_doctor_name: duplicateDoctorName\.trim\(\)/)
  assert.doesNotMatch(form, /تسجيل الزيارة المكررة متوقف/)
  assert.match(form, /لن تُحسب كفاتورة تجارية جديدة/)
})

test('deprecated direct insert helper stops before executing any legacy writes', () => {
  const helper = delivery.slice(delivery.indexOf('export async function createDeliveryOrder'), delivery.indexOf('export async function createInternalTrip'))
  assert.match(helper, /throw new Error\('تسجيل الفواتير من المسار القديم/)
  assert.match(helper, /Legacy implementation retained for review/)
})

test('rider dashboard repeated visit takes a separate early-return path', () => {
  assert.doesNotMatch(dashboard, /if \(isDup && !VISIT_GATEWAY_ENABLED\)/)
  assert.match(dashboard, /if \(isDup && VISIT_GATEWAY_ENABLED\) \{\s*const token = getStoredRiderToken/)
  assert.match(dashboard, /supabase\.rpc\('rider_register_repeated_visit_v1'/)
  assert.match(dashboard, /p_client_request_id: repeatedVisitRequestIdRef\.current/)
  assert.match(dashboard, /\.eq\("branch_id", rider\.branch_id\)/)
})
