import { readFile, writeFile } from 'node:fs/promises'

async function patchPage() {
  const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
  let source = await readFile(file, 'utf8')

  const importLine = "import ReconciliationCycleSummary from '../../components/ReconciliationCycleSummary'"
  if (!source.includes(importLine)) {
    const anchor = "import CycleSelector from '../../components/CycleSelector'"
    if (!source.includes(anchor)) throw new Error('Reconciliation import anchor not found')
    source = source.replace(anchor, `${anchor}\n${importLine}`)
  }

  const summaryLine = '        <ReconciliationCycleSummary />'
  if (!source.includes(summaryLine)) {
    const panelLine = '        <CustomerNameMismatchPanel />'
    const cycleLine = '        <CycleSelector from={selectedFrom} to={selectedTo} onApply={handleCycleApply} />'
    if (source.includes(panelLine)) {
      source = source.replace(panelLine, `${summaryLine}\n\n${panelLine}`)
    } else if (source.includes(cycleLine)) {
      source = source.replace(cycleLine, `${cycleLine}\n\n${summaryLine}`)
    } else {
      throw new Error('Reconciliation summary insertion anchor not found')
    }
  }

  const replacements = [
    ['<h2 className="text-xl font-black text-[#061827]">سجل آخر مطابقة</h2>', '<h2 className="text-xl font-black text-[#061827]">سجل آخر عملية رفع</h2>'],
    ['آخر ملف B-Connect تم رفعه ومراجعته داخل النظام.', 'بيانات آخر ملف فقط. الملخص الموحد بالأعلى هو المعتمد لإجمالي الدورة.'],
    ['<h3 className="mb-3 text-lg font-black text-teal-800">نتيجة آخر مطابقة</h3>', '<h3 className="mb-3 text-lg font-black text-teal-800">نتيجة عملية الرفع الحالية</h3>'],
    ['<Kpi label="فواتير التوصيل في الملف" value={report.bconnectInvoices} />', '<Kpi label="إجمالي فواتير السيستم بعد الدمج" value={report.bconnectInvoices} />'],
    ['<Kpi label="تلاعب/غير موجود" value={report.notFound} tone="red" />', '<Kpi label="غير موجودة بأي ملف مرفوع" value={report.notFound} tone="red" />'],
    ['بعد الرفع سيحدد النظام: الفواتير الصحيحة، الفاشلة، غير الموجودة في ملف السيستم، المكررة، وأوردرات ×1.5 للمراجعة.', 'بعد الرفع سيُدمج الملف مع كل ملفات نفس الدورة، ثم تُعاد المطابقة على إجمالي الدورة. عدم وجود فاتورة في الملفات المرفوعة لا يعني تلاعبًا تلقائيًا.'],
    ['<Kpi label="غير موجودة ببي كونكت" value={notFoundTotal} tone="red" />', '<Kpi label="غير موجودة بأي ملف مرفوع" value={notFoundTotal} tone="red" />'],
    ["  const riskTotal = failedTotal + notFoundTotal + duplicateTotal + deletedTotal", "  const riskTotal = orders.filter(o => Boolean((o as any).deleted_at) || o.status === 'failed' || o.bconnect_match_status === 'invoice_not_found' || duplicateInvoiceSet.has(normalizeOrderInvoice(o)) || o.is_duplicate_invoice).length"],
    ['<Kpi label="مؤشر مخاطر" value={riskTotal} tone="red" />', '<Kpi label="حالات تحتاج مراجعة" value={riskTotal} tone="red" />'],
  ]

  for (const [before, after] of replacements) {
    if (source.includes(after)) continue
    if (!source.includes(before)) throw new Error(`Reconciliation anchor not found: ${before.slice(0, 60)}`)
    source = source.replace(before, after)
  }

  await writeFile(file, source, 'utf8')
}

await patchPage()
console.log('Unified summary is integrated after the cycle selector with unique review counts')
