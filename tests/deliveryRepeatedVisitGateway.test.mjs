import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/delivery_repeated_visit_gateway_v1_review.sql', import.meta.url), 'utf8')
const registry = readFileSync(new URL('../supabase/delivery_invoice_identity_registry_v1_review.sql', import.meta.url), 'utf8')

test('duplicate visit uses server-side rider and branch identity, not caller-provided branch', () => {
  assert.match(sql, /from public\.rider_sessions s/)
  assert.match(sql, /a\.status = 'active' and a\.role = 'rider'/)
  assert.match(sql, /v_branch_id :=|into v_branch_id/)
  assert.match(sql, /v_account\.branch_id is not null[\s\S]*v_rider_branch_id is distinct from v_account\.branch_id/)
  assert.match(sql, /rider_branch_assignment_mismatch/)
  assert.match(sql, /delivery_invoice_key_v1\(p_invoice_number\)/)
  assert.doesNotMatch(sql, /p_branch_id|p_rider_id/)
})

test('same invoice on a different day is serialized without inserting another order', () => {
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /v_branch_id::text \|\| ':' \|\| v_invoice_key/)
  assert.doesNotMatch(sql, /v_today - 14|between.*v_today|delivery_date\s*=/i)
  assert.doesNotMatch(sql, /insert into public\.delivery_orders/i)
  assert.match(sql, /insert into dawaa_private\.delivery_invoice_visit_events_v1/)
  assert.match(sql, /'countable',false/)
})

test('retry and historical duplicate ambiguity fail safely', () => {
  assert.match(registry, /unique \(rider_id, client_request_id\)/)
  assert.match(sql, /request_key_reused_for_other_invoice/)
  assert.match(sql, /request_key_reused_with_changed_visit_details/)
  assert.match(sql, /v_existing_reason is distinct from btrim\(p_reason\)/)
  assert.match(sql, /v_existing_note is distinct from btrim\(p_note\)/)
  assert.match(sql, /'replayed',true/)
  assert.match(sql, /case when v_count = 1 then v_order_id else null end/)
  assert.match(sql, /case when v_count = 1 then 'verified' else 'unresolved' end/)
  assert.match(sql, /invoice_not_found_register_original_first/)
})

test('RPC is not activated before the first-order write cutover', () => {
  assert.match(sql, /REVIEW ONLY; NOT APPLIED/)
  assert.match(sql, /No frontend activation until normal-order creation is protected/)
  assert.match(sql, /revoke all on function public\.rider_register_repeated_visit_v1/)
})

test('duplicate visit requires an actual note on server, not an auto-generated audit fallback', () => {
  assert.match(sql, /coalesce\(length\(btrim\(p_note\)\),0\) < 5/)
  const quickForm = readFileSync(new URL('../src/components/rider/RiderQuickOrderForm.tsx', import.meta.url), 'utf8')
  const dashboard = readFileSync(new URL('../src/pages/rider/RiderDashboard.tsx', import.meta.url), 'utf8')
  assert.match(quickForm, /duplicateRequired && effectiveDuplicateNote\.length < 5/)
  assert.match(quickForm, /p_note: effectiveDuplicateNote/)
  assert.match(dashboard, /isDup && effectiveDupNote\.length < 5/)
  assert.match(dashboard, /p_note: effectiveDupNote/)
})
