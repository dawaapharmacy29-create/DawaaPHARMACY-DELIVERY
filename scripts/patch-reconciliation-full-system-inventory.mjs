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
        if (candidates.length === 1) return candidates[0]
        if (candidates.length === 0) return null

        const orderCode = normalizeArabicText((order as any).customer_code || (order as any).customer_code_snapshot)
        if (orderCode) {
          const byCode = candidates.filter(row => normalizeArabicText(row.customer_code) === orderCode)
          if (byCode.length === 1) return byCode[0]
        }

        const orderPhone = String((order as any).customer_phone || (order as any).customer_phone_snapshot || '').replace(/\\D/g, '').slice(-10)
        if (orderPhone) {
          const byPhone = candidates.filter(row => String(row.phone || '').replace(/\\D/g, '').slice(-10) === orderPhone)
          if (byPhone.length === 1) return byPhone[0]
        }

        const orderName = normalizeArabicText((order as any).customer_name || order.customer_name_snapshot)
        if (orderName) {
          const byName = candidates.filter(row => {
            const systemName = normalizeArabicText(row.customer_name)
            return systemName && (systemName === orderName || systemName.includes(orderName) || orderName.includes(systemName))
          })
          if (byName.length === 1) return byName[0]
        }

        return null
      }`

if (!source.includes(newFind)) {
  if (!source.includes(oldFind)) throw new Error('Smart duplicate invoice matching anchor not found')
  source = source.replace(oldFind, newFind)
}

await writeFile(file, source, 'utf8')
console.log('Reconciliation now loads every system invoice page and resolves duplicate invoice candidates using customer code, phone, and name')
