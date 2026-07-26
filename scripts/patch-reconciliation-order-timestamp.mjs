import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const helpers = `function orderTimestampValue(order: DeliveryOrder): string | null {
  const row = order as any
  return row.rider_registered_at || row.order_received_at || order.registered_at || row.created_at || row.updated_at || null
}

function formatOrderTimestamp(order: DeliveryOrder): string {
  const raw = orderTimestampValue(order)
  if (!raw) {
    const dateOnly = String((order as any).delivery_date || '').trim()
    return dateOnly || 'التوقيت غير مسجل'
  }
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(raw)
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

`

if (!source.includes('function orderTimestampValue(order: DeliveryOrder)')) {
  const smartAnchor = 'function customerNamesDiffer(appName: unknown, systemName: unknown): boolean {'
  const basicAnchor = /function normalizeOrderInvoice\(order: DeliveryOrder\): string \{\s+return normalizeInvoice\(\(order as any\)\.invoice_number \|\| \(order as any\)\.invoice_no\)\s+\}\s+/
  if (source.includes(smartAnchor)) {
    source = source.replace(smartAnchor, `${helpers}${smartAnchor}`)
  } else if (basicAnchor.test(source)) {
    source = source.replace(basicAnchor, match => `${match}${helpers}`)
  } else {
    throw new Error('Order timestamp helper anchor not found')
  }
}

if (!source.includes('تاريخ وتوقيت الأوردر: {formatOrderTimestamp(order)}')) {
  const invoiceHeading = /<span className="text-lg font-black">فاتورة \{inv\}<\/span>\s+<StatusPill/
  if (!invoiceHeading.test(source)) throw new Error('Order timestamp invoice heading anchor not found')
  source = source.replace(invoiceHeading, `<div className="min-w-[190px]">
                           <span className="block text-lg font-black">فاتورة {inv}</span>
                           <span className="mt-1 block text-xs font-black text-slate-500">تاريخ وتوقيت الأوردر: {formatOrderTimestamp(order)}</span>
                         </div>
                         <StatusPill`)
}

await writeFile(file, source, 'utf8')
console.log('Reconciliation cards now show the recorded order date and time')
