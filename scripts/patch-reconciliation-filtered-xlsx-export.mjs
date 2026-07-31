import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Filtered reconciliation export anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
`  async function readImportFile(file: File): Promise<Record<string, unknown>[]> {`,
`  function exportFilteredOrdersXlsx() {
    if (!filteredOrders.length) {
      toast.error('لا توجد أوردرات ظاهرة لتصديرها')
      return
    }

    const filterLabels: Record<FilterKey, string> = {
      all: 'الكل',
      counted: 'المحتسبة',
      pending: 'بانتظار الاعتماد',
      not_found: 'غير الموجودة',
      failed: 'الفاشلة',
      duplicate: 'المكررة',
      multiplier: 'مضاعف_1.5',
      deleted: 'المحذوفة',
    }

    const rows = filteredOrders.map(order => {
      const rider = riderMap.get(order.rider_id)
      const finalStatus = String((order as any).final_count_status || '')
      const reviewStatus = String((order as any).review_status || (order as any).duplicate_review_status || '')
      return {
        'رقم الفاتورة': normalizeOrderInvoice(order),
        'تاريخ الأوردر': String((order as any).delivery_date || (order as any).work_date || '').slice(0, 10),
        'وقت التسجيل': (order as any).registered_at ? new Date((order as any).registered_at).toLocaleString('ar-EG') : '',
        'الدليفري': rider?.name || (order as any).rider_name || '',
        'اسم المستخدم': rider?.username || '',
        'الفرع': (order as any).branch_name || rider?.branch_name || '',
        'اسم العميل': order.customer_name_snapshot || (order as any).customer_name || '',
        'كود العميل': (order as any).customer_code_snapshot || (order as any).customer_code || '',
        'رقم الهاتف': order.customer_phone_snapshot || (order as any).customer_phone || '',
        'العنوان': (order as any).delivery_address || (order as any).customer_address || '',
        'قيمة الفاتورة': Number(order.invoice_amount || (order as any).invoice_value || 0),
        'حالة الأوردر': order.status || '',
        'حالة المطابقة': order.bconnect_match_status || '',
        'حالة الاحتساب النهائية': finalStatus,
        'حالة المراجعة': reviewStatus,
        'محتسب': (order as any).is_countable === true ? 'نعم' : 'لا',
        'معامل الأوردر': Number(order.order_multiplier || 1),
        'قيمة احتساب الأوردر': Number((order as any).order_earning || 0),
        'مكرر': duplicateInvoiceSet.has(normalizeOrderInvoice(order)) || order.is_duplicate_invoice ? 'نعم' : 'لا',
        'فاشل': order.status === 'failed' ? 'نعم' : 'لا',
        'غير موجود في B-Connect': order.bconnect_match_status === 'invoice_not_found' ? 'نعم' : 'لا',
        'سبب الاستبعاد': (order as any).count_exclusion_reason || '',
        'ملاحظات المطابقة': (order as any).reconciliation_notes || '',
        'دكتور التحضير': (order as any).preparing_doctor_name || '',
        'محذوف': (order as any).deleted_at ? 'نعم' : 'لا',
        'سبب الحذف': (order as any).deletion_reason || '',
        'معرف الأوردر': order.id,
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 14 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 16 },
      { wch: 25 }, { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 16 },
      { wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
      { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 24 }, { wch: 35 }, { wch: 20 },
      { wch: 12 }, { wch: 24 }, { wch: 38 },
    ]
    worksheet['!autofilter'] = { ref: worksheet['!ref'] || 'A1:A1' }

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'الأوردرات المفلترة')

    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['تقرير المطابقة المفلتر'],
      ['الفترة من', selectedFrom],
      ['الفترة إلى', selectedTo],
      ['الفلتر', filterLabels[filter]],
      ['كلمة البحث', searchTerm || '—'],
      ['عدد الأوردرات', filteredOrders.length],
      ['تاريخ التصدير', new Date().toLocaleString('ar-EG')],
    ])
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 35 }]
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'ملخص التصدير')

    const safeLabel = filterLabels[filter].replace(/\\s+/g, '_')
    const fileName = 'مطابقة_الأوردرات_' + safeLabel + '_' + selectedFrom + '_' + selectedTo + '.xlsx'
    XLSX.writeFile(workbook, fileName)
    toast.success('تم تصدير ' + filteredOrders.length + ' أوردر إلى Excel')
  }

  async function readImportFile(file: File): Promise<Record<string, unknown>[]> {`,
'filtered xlsx export function',
)

replaceOnce(
`          <div className="relative">
            <Search className="absolute right-3 top-3 text-slate-400" size={20} />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث برقم الفاتورة أو العميل أو الدليفري" className="dawaa-input pr-10" />
          </div>`,
`          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportFilteredOrdersXlsx}
              disabled={filteredOrders.length === 0}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="تصدير نفس الأوردرات الظاهرة بعد تطبيق الفلتر والبحث"
            >
              <FileSpreadsheet size={18} /> تصدير الظاهر Excel ({filteredOrders.length})
            </button>
            <div className="relative">
              <Search className="absolute right-3 top-3 text-slate-400" size={20} />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث برقم الفاتورة أو العميل أو الدليفري" className="dawaa-input pr-10" />
            </div>
          </div>`,
'filtered export button',
)

await writeFile(file, source, 'utf8')
console.log('Filtered reconciliation Excel export added')
await import('./patch-reconciliation-exact-invoice-type-review.mjs')
