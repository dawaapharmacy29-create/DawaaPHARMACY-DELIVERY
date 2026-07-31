import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) {
    console.warn(`Exclusion audit patch skipped (anchor unavailable): ${label}`)
    return
  }
  source = source.replace(before, after)
}

replaceOnce(
  `  async function handleMarkNotFound(orderId: string) {
    try {
      await supabase.from('delivery_orders').update({
        bconnect_match_status: 'invoice_not_found',
        is_countable: false,
        final_count_status: 'excluded_invoice_not_found',
        count_exclusion_reason: 'marked_not_found_by_admin',
        updated_at: new Date().toISOString(),
      }).eq('id', orderId)
      toast.success('تم استبعاد الفاتورة من الحساب')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('فشل التحديث')
    }
  }`,
  `  async function handleMarkNotFound(orderId: string) {
    try {
      const order = orders.find(item => item.id === orderId)
      const previousNotes = String((order as any)?.reconciliation_notes || '').trim()
      const excludedAt = new Date().toISOString()
      const exclusionAudit = 'تم الاستبعاد بواسطة د/ معاذ — ' + new Date(excludedAt).toLocaleString('ar-EG')
      const { error } = await supabase.from('delivery_orders').update({
        bconnect_match_status: 'invoice_not_found',
        is_countable: false,
        final_count_status: 'excluded_invoice_not_found',
        count_exclusion_reason: 'marked_not_found_by_admin',
        reconciliation_notes: previousNotes ? previousNotes + '\\n' + exclusionAudit : exclusionAudit,
        updated_at: excludedAt,
      }).eq('id', orderId)
      if (error) throw error
      toast.success('تم استبعاد الفاتورة بواسطة د/ معاذ')
      await loadAll()
    } catch (error: any) {
      console.error(error)
      toast.error('فشل التحديث: ' + (error?.message ?? ''))
    }
  }`,
  'record exclusion actor',
)

replaceOnce(
  `                        {(order as any).deleted_at && <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-black text-slate-700">محذوف محفوظ</span>}`,
  `                        {(order as any).deleted_at && <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-black text-slate-700">محذوف محفوظ</span>}
                        {(order.bconnect_match_status === 'invoice_not_found' || String((order as any).final_count_status || '').startsWith('excluded')) && <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700">تم الاستبعاد بواسطة د/ معاذ</span>}`,
  'show exclusion actor badge',
)

await writeFile(file, source, 'utf8')
console.log('Reconciliation exclusions now record and display the acting administrator')
await import('./patch-reconciliation-filtered-xlsx-export.mjs')
