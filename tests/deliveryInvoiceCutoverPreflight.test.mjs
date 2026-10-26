import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../supabase/delivery_invoice_cutover_preflight_readonly.sql', import.meta.url), 'utf8')

test('cutover preflight is read-only and tests both invoice fields and private gateway', () => {
  assert.match(source, /READ ONLY/)
  assert.match(source, /rows_missing_identity/)
  assert.match(source, /rows_with_conflicting_invoice_columns/)
  assert.match(source, /historical_duplicate_keys/)
  assert.match(source, /duplicate_keys_involving_legacy_unreadable_digits/)
  assert.match(source, /rider_register_repeated_visit_v1/)
  assert.doesNotMatch(source, /\b(insert|update|delete|truncate|drop|alter)\s+(into\s+|from\s+|table\s+)?(?:public|dawaa_private)\./i)
})
