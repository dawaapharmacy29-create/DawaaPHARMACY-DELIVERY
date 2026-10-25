import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const oldBlock = `      const { data: accumulatedRows, error: accumulatedError } = await supabase
        .from('monthly_system_invoices')
        .select('*')
        .eq('period_start', selectedFrom)
        .eq('period_end', selectedTo)
      if (accumulatedError) throw accumulatedError

      const bconnect: BConnectRow[] = (accumulatedRows || []).map((row: any) => ({`

const newBlock = `      const accumulatedRows: any[] = []
      const systemPageSize = 1000
      for (let offset = 0; ; offset += systemPageSize) {
        const { data: pageRows, error: accumulatedError } = await supabase
          .from('monthly_system_invoices')
          .select('*')
          .eq('period_start', selectedFrom)
          .eq('period_end', selectedTo)
          .order('invoice_number', { ascending: true })
          .range(offset, offset + systemPageSize - 1)
        if (accumulatedError) throw accumulatedError
        accumulatedRows.push(...(pageRows || []))
        if (!pageRows || pageRows.length < systemPageSize) break
      }

      const bconnect: BConnectRow[] = accumulatedRows.map((row: any) => ({`

if (!source.includes(newBlock)) {
  if (!source.includes(oldBlock)) throw new Error('Full system inventory anchor not found')
  source = source.replace(oldBlock, newBlock)
}

const oldFind = `      const findSystemMatch = (order: DeliveryOrder) => {
        const invoice = normalizeOrderInvoice(order)
        if (!invoice) return null
        const branch = (order as any).branch_name || ''
        const exact = exactSystemMap.get(systemInvoiceKey(invoice, branch))
        if (exact) return exact
        const candidates = candidatesByInvoice.get(invoice) || []
        return candidates.length === 1 ? candidates[0] : null
      }`

const newFind = `      const findSystemMatch = (order: DeliveryOrder) => {
        const invoice = normalizeOrderInvoice(order)
        if (!invoice) return null
        const branch = (order as any).branch_name || ''
        const exact = exactSystemMap.get(systemInvoiceKey(invoice, branch))
        if (exact) return exact

        const candidates = candidatesByInvoice.get(invoice) || []
        // More than one invoice source requires independent corroboration and
        // administrative review. Name/code alone must not approve a payment.
        return candidates.length === 1 ? candidates[0] : null
      }`

if (!source.includes(newFind)) {
  if (!source.includes(oldFind)) throw new Error('Smart duplicate invoice matching anchor not found')
  source = source.replace(oldFind, newFind)
}

await writeFile(file, source, 'utf8')
console.log('Reconciliation now loads every system invoice page and resolves duplicate invoice candidates using customer code, phone, and name')
