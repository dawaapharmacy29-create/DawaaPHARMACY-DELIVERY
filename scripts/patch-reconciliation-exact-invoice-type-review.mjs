import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Exact invoice reconciliation patch anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  `function normalizeOrderInvoice(order: DeliveryOrder): string {`,
  `function parseAllInvoiceRows(rows: Record<string, unknown>[]): BConnectRow[] {
  const out: BConnectRow[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const invoice = normalizeInvoice(first(row, INVOICE_KEYS))
    if (!invoice || seen.has(invoice)) continue
    seen.add(invoice)

    const gross = toNumber(first(row, GROSS_AMOUNT_KEYS))
    const net = toNumber(first(row, NET_AMOUNT_KEYS)) || gross
    out.push({
      invoice_number: invoice,
      invoice_type: first(row, TYPE_KEYS),
      branch_name: first(row, BRANCH_KEYS),
      customer_code: first(row, CODE_KEYS),
      customer_name: first(row, NAME_KEYS),
      phone: first(row, PHONE_KEYS),
      address: first(row, ADDRESS_KEYS),
      invoice_date: first(row, DATE_KEYS),
      invoice_amount: net || gross,
      gross_total: gross,
      net_total: net,
      system_user: first(row, SYSTEM_USER_KEYS),
      close_time: first(row, CLOSE_TIME_KEYS),
      raw: row,
    })
  }

  return out
}

function normalizeOrderInvoice(order: DeliveryOrder): string {`,
  'all invoice parser',
)

replaceOnce(
  `      const bconnect = parseBConnectRows(rows)`,
  `      const allInvoices = parseAllInvoiceRows(rows)
      const bconnect = allInvoices.filter(row => isDeliveryInvoiceType(row.invoice_type))`,
  'parse all invoice types',
)

replaceOnce(
  `          bconnect.map(row => ({`,
  `          allInvoices.map(row => ({`,
  'store all invoice types',
)

replaceOnce(
  `      const bconnectMap = new Map(bconnect.map(row => [row.invoice_number, row])) // رقم الفاتورة هو العلامة المميزة الأساسية`,
  `      const bconnectMap = new Map(bconnect.map(row => [row.invoice_number, row])) // رقم الفاتورة هو العلامة المميزة الأساسية
      const allInvoiceMap = new Map(allInvoices.map(row => [row.invoice_number, row]))`,
  'all invoice exact map',
)

replaceOnce(
  `        const match = inv ? bconnectMap.get(inv) : null`,
  `        const match = inv ? bconnectMap.get(inv) : null
        const exactInvoiceAnyType = inv ? allInvoiceMap.get(inv) : null`,
  'exact invoice any type lookup',
)

replaceOnce(
  `        } else if (!match) {
          reconciliationStatus = 'app_only'
          differenceReason = 'مسجل في التطبيق وغير موجود في ملف السيستم'
          notFound++`,
  `        } else if (!match && exactInvoiceAnyType) {
          reconciliationStatus = 'exact_invoice_non_delivery_type'
          differenceReason = 'رقم الفاتورة موجود في ملف السيستم لكن النوع ' + (exactInvoiceAnyType.invoice_type || 'غير محدد') + ' ويحتاج مراجعة'
          patch = {
            ...patch,
            bconnect_match_status: 'invoice_found_non_delivery_type',
            matched_at: new Date().toISOString(),
            matched_amount: exactInvoiceAnyType.invoice_amount,
            is_countable: false,
            final_count_status: 'pending_invoice_type_review',
            count_exclusion_reason: null,
            reconciliation_notes: 'رقم الفاتورة موجود حرفيًا في ملف السيستم، لكن نوعها ' + (exactInvoiceAnyType.invoice_type || 'غير محدد') + '. لا تُصنف كغير موجودة ولا تُحتسب قبل مراجعة الإدارة.',
          }
        } else if (!match) {
          reconciliationStatus = 'app_only'
          differenceReason = 'رقم الفاتورة غير موجود إطلاقًا في ملف السيستم'
          notFound++`,
  'separate exact cash invoice review',
)

replaceOnce(
  `                        {(order as any).deleted_at && <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-black text-slate-700">محذوف محفوظ</span>}`,
  `                        {(order as any).deleted_at && <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-black text-slate-700">محذوف محفوظ</span>}
                        {order.bconnect_match_status === 'invoice_found_non_delivery_type' && <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">رقم موجود — نوع الفاتورة يحتاج مراجعة</span>}`,
  'invoice type review badge',
)

await writeFile(file, source, 'utf8')
console.log('Reconciliation now uses exact invoice number only and separates non-delivery invoice type review')
