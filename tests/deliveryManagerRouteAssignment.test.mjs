import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/delivery_manager_route_assignment_v1_review.sql', import.meta.url),'utf8')
const ui = readFileSync(new URL('../src/pages/admin/RoutePlanner.tsx', import.meta.url),'utf8')

test('route assignment uses server-validated manager and branch in protected mode', () => {
  assert.match(sql,/REVIEW ONLY/)
  assert.match(sql,/manager_session_required/)
  assert.match(sql,/manager_branch_mismatch/)
  assert.match(sql,/route_order_not_eligible/)
  assert.match(sql,/for update/)
  assert.match(sql,/cardinality\(p_order_ids\) > 100/)
  assert.match(sql,/status not in \('registered','needs_review'\)/)
  assert.match(ui,/VITE_DELIVERY_VISIT_GATEWAY_V1_ENABLED === 'true'/)
  assert.match(ui,/delivery_manager_assign_route_v1/)
  assert.match(ui,/getRiderSession\(\).session_token/)
})
