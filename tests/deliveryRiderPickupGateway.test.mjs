import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/delivery_rider_pickup_gateway_v1_review.sql', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../src/pages/rider/RiderDashboard.tsx', import.meta.url), 'utf8')

test('rider pickup uses a session-bound ownership gateway after cutover', () => {
  assert.match(sql, /REVIEW ONLY/)
  assert.match(sql, /active_rider_session_required/)
  assert.match(sql, /order_not_owned_by_rider/)
  assert.match(sql, /for update/)
  assert.match(sql, /picked_up_at is not null/)
  assert.match(sql, /order_not_open_for_pickup/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /revoke all on function public\.rider_mark_order_picked_up_v1/)
  assert.match(ui, /if \(!VISIT_GATEWAY_ENABLED\)/)
  assert.match(ui, /supabase\.rpc\("rider_mark_order_picked_up_v1"/)
  assert.match(ui, /p_token: token/)
})
