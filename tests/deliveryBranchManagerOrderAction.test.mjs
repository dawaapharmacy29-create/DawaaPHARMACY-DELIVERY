import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/delivery_branch_manager_order_action_v1_review.sql', import.meta.url), 'utf8')

test('branch manager actions are session-scoped and cannot change closed or foreign-branch orders', () => {
  assert.match(sql, /REVIEW ONLY/)
  assert.match(sql, /manager_session_required/)
  assert.match(sql, /manager_order_branch_mismatch/)
  assert.match(sql, /closed_order_requires_separate_review/)
  assert.match(sql, /target_rider_branch_mismatch/)
  assert.match(sql, /for update/)
  assert.match(sql, /revoke all on function public\.delivery_branch_manager_order_action_v1/)
})
