import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const importLine = "import CustomerNameMismatchPanel from '../../components/CustomerNameMismatchPanel'"
if (!source.includes(importLine)) {
  const anchor = "import CycleSelector from '../../components/CycleSelector'"
  if (!source.includes(anchor)) throw new Error('Reconciliation import anchor not found')
  source = source.replace(anchor, `${anchor}\n${importLine}`)
}

const panelLine = '        <CustomerNameMismatchPanel />'
if (!source.includes(panelLine)) {
  const anchor = '        <CycleSelector from={selectedFrom} to={selectedTo} onApply={handleCycleApply} />'
  if (!source.includes(anchor)) throw new Error('Cycle selector anchor not found')
  source = source.replace(anchor, `${anchor}\n\n${panelLine}`)
}

await writeFile(file, source, 'utf8')
console.log('Customer-name mismatch review panel is placed inside the reconciliation page')
