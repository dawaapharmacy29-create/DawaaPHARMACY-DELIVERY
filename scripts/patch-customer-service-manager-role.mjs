import fs from 'node:fs'

function patchFile(file, replacements) {
  let source = fs.readFileSync(file, 'utf8')
  for (const [before, after] of replacements) {
    if (source.includes(after)) continue
    if (!source.includes(before)) throw new Error(`Missing patch target in ${file}`)
    source = source.replace(before, after)
  }
  fs.writeFileSync(file, source)
}

patchFile('src/lib/permissions.ts', [
  ["  | 'shift_manager'\n  | 'branch_manager'", "  | 'shift_manager'\n  | 'customer_service_manager'\n  | 'branch_manager'"],
  ["    'branch_manager',\n    'shift_manager',", "    'branch_manager',\n    'shift_manager',\n    'customer_service_manager',"],
  ["  if (normalized === 'branch_manager' || normalized === 'shift_manager') {", "  if (['branch_manager', 'shift_manager', 'customer_service_manager'].includes(normalized)) {"],
  ["  if (normalized === 'branch_manager' || normalized === 'shift_manager') {\n    return !!userBranchId", "  if (['branch_manager', 'shift_manager', 'customer_service_manager'].includes(normalized)) {\n    return !!userBranchId"],
  ["  return ['branch_manager', 'shift_manager'].includes(String(role || ''))", "  return ['branch_manager', 'shift_manager', 'customer_service_manager'].includes(String(role || ''))"],
])

patchFile('src/pages/admin/PenaltyIncentiveManagement.tsx', [
  ["'branch_manager', 'shift_manager']", "'branch_manager', 'shift_manager', 'customer_service_manager']"],
])

console.log('Customer service manager role support patched')
