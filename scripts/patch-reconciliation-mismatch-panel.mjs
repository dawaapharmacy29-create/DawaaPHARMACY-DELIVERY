import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/ReconciliationSafe.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const importLine = "import CustomerNameMismatchPanel from '../../components/CustomerNameMismatchPanel'"
if (!source.includes(importLine)) {
  const anchor = "import { supabase } from '../../lib/supabase'"
  if (!source.includes(anchor)) throw new Error('ReconciliationSafe import anchor not found')
  source = source.replace(anchor, `${anchor}\n${importLine}`)
}

const oldRender = `  return (
    <div ref={rootRef}>
      <Reconciliation />
    </div>
  )`
const newRender = `  return (
    <div ref={rootRef}>
      <CustomerNameMismatchPanel />
      <Reconciliation />
    </div>
  )`
if (!source.includes(newRender)) {
  if (!source.includes(oldRender)) throw new Error('ReconciliationSafe render anchor not found')
  source = source.replace(oldRender, newRender)
}

await writeFile(file, source, 'utf8')
console.log('Customer-name mismatch review panel is enabled')
