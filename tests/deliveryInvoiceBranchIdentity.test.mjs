import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/admin/DuplicateInvoices.tsx', import.meta.url), 'utf8')

test('manager duplicate queue groups by branch and normalized invoice, never date', () => {
  assert.match(source, /function invoiceIdentityKey\(order: any\)/)
  assert.match(source, /order\.branch_id/)
  assert.match(source, /return invoice && branch \? `\$\{branch\}:\$\{invoice\}` : null/)
  assert.doesNotMatch(source.slice(source.indexOf('function invoiceIdentityKey'),source.indexOf('function orderDate')), /delivery_date|work_date/)
  assert.match(source, /invoiceCounts\.get\(key\)/)
  assert.match(source, /map\.get\(key\)/)
})

test('an unresolved branch is not combined with another branch', () => {
  assert.match(source, /`unresolved:\$\{order\.id\}`/)
  assert.match(source, /!key\.startsWith\('unresolved:'\)/)
  assert.match(source, /group\.key === decisionInvoice/)
})

test('Arabic and Eastern Arabic invoice digits share one frontend identity', () => {
  assert.match(source, /\[٠-٩\]/)
  assert.match(source, /\[۰-۹\]/)
})
