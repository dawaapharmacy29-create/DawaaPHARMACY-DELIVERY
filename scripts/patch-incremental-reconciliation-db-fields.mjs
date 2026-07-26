import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Cumulative reconciliation DB anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  "            normalized_branch_name: normalizeBranchName(row.branch_name),\n            customer_code: row.customer_code,",
  "            normalized_branch_name: normalizeBranchName(row.branch_name),\n            invoice_cycle_key: `${selectedFrom}|${selectedTo}|${normalizeBranchName(row.branch_name)}|${row.invoice_number}`,\n            last_seen_batch_id: batchId,\n            last_imported_at: new Date().toISOString(),\n            customer_code: row.customer_code,",
  'invoice cycle key fields',
)
replaceOnce(
  "{ onConflict: 'period_start,period_end,normalized_branch_name,invoice_number' }",
  "{ onConflict: 'invoice_cycle_key' }",
  'upsert conflict key',
)
replaceOnce(
  "          system_customer_name: match?.customer_name ?? null,\n          app_branch_name:",
  "          system_customer_name: match?.customer_name ?? null,\n          customer_name_mismatch: nameMismatch,\n          app_customer_name_normalized: normalizeArabicText((order as any).customer_name || order.customer_name_snapshot),\n          system_customer_name_normalized: normalizeArabicText(match?.customer_name),\n          app_branch_name:",
  'mismatch result metadata',
)
replaceOnce(
  "        system_customer_name: row.customer_name,\n        app_branch_name:",
  "        system_customer_name: row.customer_name,\n        customer_name_mismatch: false,\n        app_customer_name_normalized: null,\n        system_customer_name_normalized: normalizeArabicText(row.customer_name),\n        app_branch_name:",
  'system-only result metadata',
)

await writeFile(file, source, 'utf8')
console.log('Cumulative reconciliation uses a stable cycle invoice key and stores mismatch metadata')
