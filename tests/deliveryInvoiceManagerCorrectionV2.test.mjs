import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/delivery_invoice_manager_correction_v2_review.sql', import.meta.url), 'utf8')
const guard = readFileSync(new URL('../supabase/delivery_invoice_single_write_guard_v1_review.sql', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/admin/BranchManagerDashboard.tsx', import.meta.url), 'utf8')

test('invoice correction requires a live server-verified management identity and branch', () => {
  assert.match(sql, /session_token=p_token and s\.expires_at > now\(\)/)
  assert.match(sql, /a\.role in \('general_manager','branch_manager'\)/)
  assert.match(sql, /auth\.uid\(\)/)
  assert.match(sql, /manager_session_required/)
  assert.match(sql, /v_manager_branch is distinct from v_order\.branch_id/)
})

test('invoice correction serializes keys, rejects collision, and audits atomically', () => {
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /invoice_already_registered_use_review/)
  assert.match(sql, /insert into public\.delivery_order_invoice_edit_history/)
  assert.match(sql, /invoice_no=btrim\(p_new_invoice_number\)/)
  assert.match(sql, /is_countable=false/)
  assert.match(guard, /current_setting\('dawaa\.invoice_correction_identity_v1', true\)/)
})

test('protected manager UI uses new token-bound RPC, legacy remains gated off', () => {
  assert.match(page, /VITE_DELIVERY_VISIT_GATEWAY_V1_ENABLED === 'true'/)
  assert.match(page, /getRiderSession\(\)\.session_token/)
  assert.match(page, /branch_manager_update_order_invoice_v2/)
  assert.match(sql, /REVIEW ONLY; NOT APPLIED/)
})
