import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const files = [
  'src/pages/admin/Reconciliation.tsx',
  'src/pages/admin/RiderPerformanceDetailFast.tsx',
  'src/pages/rider/RiderDashboardV3.tsx',
  'src/pages/admin/RiderPerformanceDetail.tsx',
  'src/pages/admin/InvoiceNotebook.tsx',
]

test('legacy invoice editors are disabled when protected visit gateway is enabled', () => {
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.match(text, /VITE_DELIVERY_VISIT_GATEWAY_V1_ENABLED === 'true'/, file)
    assert.match(text, /متوقف/, file)
  }
})

test('branch manager protected actions no longer use the direct-write path', () => {
  const text = readFileSync(new URL('../src/pages/admin/BranchManagerDashboard.tsx', import.meta.url), 'utf8')
  assert.match(text, /VITE_DELIVERY_VISIT_GATEWAY_V1_ENABLED === 'true'/)
  assert.match(text, /delivery_branch_manager_order_action_v1/)
  assert.match(text, /!protectedAction && modal\.type === 'reassign'/)
  assert.match(text, /!protectedAction && modal\.type === 'delete'/)
  assert.match(text, /!protectedAction && modal\.type === 'order_to_trip'/)
})
