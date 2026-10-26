import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/delivery_orders_direct_write_cutover_review.sql', import.meta.url), 'utf8')

test('permission cutover refuses missing invoice protection and removes permissive writes', () => {
  assert.match(sql, /REVIEW ONLY/)
  assert.match(sql, /delivery_invoice_cutover_gateways_missing/)
  assert.match(sql, /delivery_invoice_guard_triggers_not_active/)
  assert.match(sql, /drop policy if exists delivery_orders_public_all/)
  assert.match(sql, /for select to anon, authenticated using \(true\)/)
  assert.match(sql, /revoke insert, update, delete on public\.delivery_orders from anon, authenticated/)
  assert.match(sql, /revoke execute on function public\.branch_manager_update_order_invoice/)
  assert.match(sql, /service_role/)
  assert.match(sql, /commit;/)
})
