import { readFile } from 'node:fs/promises'

let failed = false

const files = [
  'src/pages/admin/Reconciliation.tsx',
  'src/pages/admin/RiderCompensationCenter.tsx',
  'src/pages/admin/RiderMonthlyReports.tsx',
  'src/pages/admin/RiderPerformanceDetail.tsx',
]

for (const path of files) {
  const source = await readFile(path, 'utf8')
  const names = [...source.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm)].map(match => match[1])
  const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))]
  const replaceAllCount = (source.match(/\.replaceAll\(/g) || []).length
  console.log(JSON.stringify({
    path,
    functionCount: names.length,
    duplicateFunctions: duplicates,
    replaceAllCount,
  }))
  if (duplicates.length > 0 || replaceAllCount > 0) failed = true
}

if (failed) {
  throw new Error('Patched admin source QA failed')
}
