import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderPerformanceDetail.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Rider report export UX anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  '  function exportMonthlyReport() {',
  `  function exportMonthlySummary() {
    if (!rider) return
    const countedNormalOrders = stats.counted.filter((order: any) => !isMulti(order)).length
    const countedMultiOrders = stats.counted.filter((order: any) => isMulti(order)).length
    const countedOrderUnits = countedNormalOrders + countedMultiOrders * 1.5
    const orderValueDue = countedOrderUnits * Number(orderUnitRate || 0)
    const tripValueDue = stats.countedTripUnits * Number(tripUnitRate || 0)
    const grossWorkValue = orderValueDue + tripValueDue
    const netPayable = grossWorkValue - stats.deductions + stats.rewards
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) { toast.error('المتصفح منع فتح التقرير. اسمح بالنوافذ المنبثقة وحاول مرة أخرى.'); return }
    reportWindow.document.write(\`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>ملخص \${escapeHtml(rider.name || rider.username)}</title><style>
      @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#102a35;margin:0}.head{text-align:center;border-bottom:3px solid #008E92;padding-bottom:10px}.meta{display:flex;justify-content:space-between;margin:10px 0;font-weight:bold}.cards{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}.card{border:1px solid #cbd5e1;border-radius:10px;padding:8px;text-align:center;min-height:62px}.card b{display:block;font-size:19px;color:#007b80}.card span{font-size:10px}.note{margin-top:12px;padding:10px;border:1px solid #67e8f9;background:#ecfeff;font-weight:bold;line-height:1.8}.final{margin-top:12px;padding:14px;border-radius:12px;background:#07313d;color:white;text-align:center}.final b{font-size:30px;display:block}
    </style></head><body>
      <div class="head"><h1>الملخص الشهري للمندوب</h1><h2>\${escapeHtml(rider.name || rider.username)} — \${escapeHtml(displayBranchName(branch?.name || rider.branch_name))}</h2><div>الدورة: \${escapeHtml(selectedFrom)} إلى \${escapeHtml(selectedTo)} (26 → 25)</div></div>
      <div class="meta"><span>اسم المستخدم: \${escapeHtml(rider.username)}</span><span>تاريخ التصدير: \${escapeHtml(new Date().toLocaleString('ar-EG'))}</span></div>
      <div class="cards">
        <div class="card"><b>\${stats.clean.length}</b><span>إجمالي الأوردرات</span></div><div class="card"><b>\${stats.counted.length}</b><span>الأوردرات المحتسبة</span></div><div class="card"><b>\${countedNormalOrders}</b><span>محتسبة ×1</span></div><div class="card"><b>\${countedMultiOrders}</b><span>محتسبة ×1.5</span></div><div class="card"><b>\${countedOrderUnits}</b><span>وحدات الأوردرات</span></div><div class="card"><b>\${escapeHtml(formatMoney(orderValueDue))}</b><span>قيمة الأوردرات</span></div>
        <div class="card"><b>\${trips.length}</b><span>إجمالي المشاوير</span></div><div class="card"><b>\${stats.countedTrips.length}</b><span>المشاوير المحتسبة</span></div><div class="card"><b>\${stats.countedTripUnits}</b><span>وحدات المشاوير</span></div><div class="card"><b>\${escapeHtml(formatMoney(tripValueDue))}</b><span>قيمة المشاوير</span></div><div class="card"><b>\${escapeHtml(formatMoney(stats.deductions))}</b><span>الخصومات</span></div><div class="card"><b>\${escapeHtml(formatMoney(stats.rewards))}</b><span>المكافآت</span></div>
      </div>
      <div class="note">طريقة الحساب: (\${countedNormalOrders} أوردر ×1 + \${countedMultiOrders} أوردر ×1.5 = \${countedOrderUnits} وحدة) × \${orderUnitRate} ج = \${escapeHtml(formatMoney(orderValueDue))}. والمشاوير: \${stats.countedTripUnits} وحدة × \${tripUnitRate} ج = \${escapeHtml(formatMoney(tripValueDue))}. الإجمالي قبل التسويات \${escapeHtml(formatMoney(grossWorkValue))} ج، ثم خصم \${escapeHtml(formatMoney(stats.deductions))} ج وإضافة مكافأة \${escapeHtml(formatMoney(stats.rewards))} ج.</div>
      <div class="final"><span>الصافي المستحق</span><b>\${escapeHtml(formatMoney(netPayable))} ج.م</b></div>
    </body></html>\`)
    reportWindow.document.close(); reportWindow.focus(); setTimeout(() => reportWindow.print(), 350)
  }

  function exportMonthlyReport() {`,
  'summary export insertion',
)

replaceOnce(
  '<button onClick={exportMonthlyReport} className="no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm"><Download size={16}/> حفظ التقرير الشهري PDF</button>',
  `<div className="no-print flex flex-wrap items-center justify-end gap-2">
          <button onClick={exportMonthlySummary} className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm"><Download size={16}/> ملخص PDF صفحة واحدة</button>
          <button onClick={exportMonthlyReport} className="flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm"><Download size={16}/> التفاصيل الكاملة PDF</button>
        </div>`,
  'export buttons',
)

replaceOnce(
  '<p className="mt-3 text-xs font-bold text-cyan-900">بعد الضغط على «حفظ التقرير الشهري PDF» ستفتح نافذة الطباعة؛ اختر الطابعة «Save as PDF / حفظ كملف PDF» ثم احفظ الملف لإرساله للمندوب.</p>',
  '<p className="mt-3 text-xs font-bold text-cyan-900">لإرسال التقرير بسرعة استخدم «ملخص PDF صفحة واحدة». التقرير الكامل يحتوي تفاصيل كل الأوردرات والمشاوير ولذلك قد يظهر 10–20 صفحة. في نافذة الطباعة اختر Adobe PDF أو Save as PDF ثم اضغط Print؛ بعدها ستظهر نافذة اختيار اسم ومكان حفظ الملف.</p>',
  'download help text',
)

replaceOnce(
  'table{width:100%;border-collapse:collapse;margin-top:7px;font-size:9px}th,td{border:1px solid #cbd5e1;padding:5px;text-align:center;vertical-align:top}th{background:#07313d;color:white}',
  'table{width:100%;border-collapse:collapse;margin-top:7px;font-size:9px}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #cbd5e1;padding:5px;text-align:center;vertical-align:top}th{background:#07313d;color:white}',
  'print table pagination',
)

await writeFile(file, source, 'utf8')
console.log('Rider report export now offers a one-page summary and clearer full-report PDF flow')
