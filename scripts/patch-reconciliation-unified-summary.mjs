import { readFile, writeFile } from 'node:fs/promises'

async function patchSafe() {
  const file = new URL('../src/pages/admin/ReconciliationSafe.tsx', import.meta.url)
  let source = await readFile(file, 'utf8')
  const importLine = "import ReconciliationCycleSummary from '../../components/ReconciliationCycleSummary'"
  if (!source.includes(importLine)) {
    const anchor = "import { supabase } from '../../lib/supabase'"
    if (!source.includes(anchor)) throw new Error('ReconciliationSafe import anchor not found')
    source = source.replace(anchor, `${anchor}\n${importLine}`)
  }

  const summaryLine = '      <div className="mx-auto max-w-7xl px-4 pt-4"><ReconciliationCycleSummary /></div>'
  if (!source.includes(summaryLine)) {
    const withMismatch = '<div ref={rootRef}>\n      <CustomerNameMismatchPanel />\n      <Reconciliation />'
    const withoutMismatch = '<div ref={rootRef}>\n      <Reconciliation />'
    if (source.includes(withMismatch)) {
      source = source.replace(withMismatch, `<div ref={rootRef}>\n${summaryLine}\n      <CustomerNameMismatchPanel />\n      <Reconciliation />`)
    } else if (source.includes(withoutMismatch)) {
      source = source.replace(withoutMismatch, `<div ref={rootRef}>\n${summaryLine}\n      <Reconciliation />`)
    } else {
      throw new Error('ReconciliationSafe render anchor not found')
    }
  }
  await writeFile(file, source, 'utf8')
}

async function patchLabels() {
  const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
  let source = await readFile(file, 'utf8')
  const replacements = [
    ['<h2 className="text-xl font-black text-[#061827]">سجل آخر مطابقة</h2>', '<h2 className="text-xl font-black text-[#061827]">سجل آخر عملية رفع</h2>'],
    ['آخر ملف B-Connect تم رفعه ومراجعته داخل النظام.', 'بيانات آخر ملف فقط. الملخص الموحد بالأعلى هو المعتمد لإجمالي الدورة.'],
    ['<h3 className="mb-3 text-lg font-black text-teal-800">نتيجة آخر مطابقة</h3>', '<h3 className="mb-3 text-lg font-black text-teal-800">نتيجة عملية الرفع الحالية</h3>'],
    ['<Kpi label="فواتير التوصيل في الملف" value={report.bconnectInvoices} />', '<Kpi label="إجمالي فواتير السيستم بعد الدمج" value={report.bconnectInvoices} />'],
    ['<Kpi label="تلاعب/غير موجود" value={report.notFound} tone="red" />', '<Kpi label="غير موجودة بأي ملف مرفوع" value={report.notFound} tone="red" />'],
    ['بعد الرفع سيحدد النظام: الفواتير الصحيحة، الفاشلة، غير الموجودة في ملف السيستم، المكررة، وأوردرات ×1.5 للمراجعة.', 'بعد الرفع سيُدمج الملف مع كل ملفات نفس الدورة، ثم تُعاد المطابقة على إجمالي الدورة. عدم وجود فاتورة في الملفات المرفوعة لا يعني تلاعبًا تلقائيًا.'],
    ['<Kpi label="غير موجودة ببي كونكت" value={notFoundTotal} tone="red" />', '<Kpi label="غير موجودة بأي ملف مرفوع" value={notFoundTotal} tone="red" />'],
  ]
  for (const [before, after] of replacements) {
    if (source.includes(after)) continue
    if (!source.includes(before)) throw new Error(`Reconciliation label anchor not found: ${before.slice(0, 50)}`)
    source = source.replace(before, after)
  }
  await writeFile(file, source, 'utf8')
}

await patchSafe()
await patchLabels()
console.log('Unified cumulative reconciliation summary and accurate labels enabled')
