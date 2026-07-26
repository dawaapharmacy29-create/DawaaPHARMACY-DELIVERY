import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Order timestamp anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  "function normalizeOrderInvoice(order: DeliveryOrder): string {\n  return normalizeInvoice((order as any).invoice_number || (order as any).invoice_no)\n}",
  `function normalizeOrderInvoice(order: DeliveryOrder): string {
  return normalizeInvoice((order as any).invoice_number || (order as any).invoice_no)
}

function orderTimestampValue(order: DeliveryOrder): string | null {
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
}`,
  'timestamp helpers',
)

replaceOnce(
  `<span className="text-lg font-black">فاتورة {inv}</span>
                         <StatusPill`,
  `<div className="min-w-[190px]">
                           <span className="block text-lg font-black">فاتورة {inv}</span>
                           <span className="mt-1 block text-xs font-black text-slate-500">تاريخ وتوقيت الأوردر: {formatOrderTimestamp(order)}</span>
                         </div>
                         <StatusPill`,
  'invoice heading timestamp',
)

await writeFile(file, source, 'utf8')
console.log('Reconciliation cards now show the recorded order date and time')
