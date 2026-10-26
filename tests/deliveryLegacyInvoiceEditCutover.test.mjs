import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const files = [
  'src/pages/admin/Reconciliation.tsx',
  'src/pages/admin/RiderPerformanceDetailFast.tsx',
  'src/pages/rider/RiderDashboardV3.tsx',
  'src/pages/admin/RiderPerformanceDetail.tsx',
  'src/pages/admin/InvoiceNotebook.tsx',
  'src/pages/admin/BranchManagerDashboard.tsx',
]

test('legacy invoice editors are disabled when protected visit gateway is enabled', () => {
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.match(text, /VITE_DELIVERY_VISIT_GATEWAY_V1_ENABLED === 'true'/, file)
    assert.match(text, /متوقف/, file)
  }
})
