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
    const failedOrdersCount = stats.failed.length
    const rejectedOrdersCount = stats.clean.filter((order: any) => {
      const status = String(order.final_count_status || order.reconciliation_status || order.review_status || '').toLowerCase()
      return !isFailed(order) && (order.is_countable === false || ['rejected','excluded','not_countable'].some(value => status.includes(value)))
    }).length
    const orderValueDue = countedOrderUnits * Number(orderUnitRate || 0)
    const tripValueDue = stats.countedTripUnits * Number(tripUnitRate || 0)
    const grossWorkValue = orderValueDue + tripValueDue
    const netAfterReview = grossWorkValue - stats.deductions
    const finalPayable = netAfterReview + stats.rewards
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) { toast.error('المتصفح منع فتح التقرير. اسمح بالنوافذ المنبثقة وحاول مرة أخرى.'); return }
    reportWindow.document.write(\`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>التقرير الشهري الملخص - \${escapeHtml(rider.name || rider.username)}</title><style>
      @page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#102a35;margin:0}.head{text-align:center;border-bottom:3px solid #008E92;padding-bottom:8px}.head h1{margin:0 0 5px;font-size:25px}.head h2{margin:0 0 5px;font-size:18px}.meta{display:flex;justify-content:space-between;margin:9px 0;font-weight:bold;font-size:12px}.section-title{margin:10px 0 6px;padding:6px 10px;border-radius:8px;background:#07313d;color:#fff;font-size:14px}.cards{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}.card{border:1px solid #cbd5e1;border-radius:9px;padding:7px;text-align:center;min-height:58px}.card b{display:block;font-size:18px;color:#007b80}.card span{font-size:9px;font-weight:bold}.money b{color:#0f766e}.warn b{color:#be123c}.pending b{color:#b45309}.calc{margin-top:9px;padding:9px;border:1px solid #67e8f9;background:#ecfeff;font-weight:bold;line-height:1.7;font-size:11px}.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.total{padding:10px;border-radius:10px;text-align:center;background:#f1f5f9}.total b{display:block;font-size:21px}.final{background:#07313d;color:white}.final b{font-size:27px}.foot{margin-top:7px;text-align:center;font-size:9px;color:#64748b}
    </style></head><body>
      <div class="head"><h1>التقرير الشهري الملخص للمندوب</h1><h2>\${escapeHtml(rider.name || rider.username)} — \${escapeHtml(displayBranchName(branch?.name || rider.branch_name))}</h2><div>الدورة: \${escapeHtml(selectedFrom)} إلى \${escapeHtml(selectedTo)} (26 → 25)</div></div>
      <div class="meta"><span>اسم المستخدم: \${escapeHtml(rider.username)}</span><span>تاريخ التصدير: \${escapeHtml(new Date().toLocaleString('ar-EG'))}</span></div>
      <div class="section-title">ملخص الأوردرات</div>
      <div class="cards">
        <div class="card"><b>\${stats.clean.length}</b><span>إجمالي الأوردرات</span></div><div class="card"><b>\${stats.counted.length}</b><span>إجمالي المحتسب</span></div><div class="card"><b>\${countedNormalOrders}</b><span>محتسب ×1</span></div><div class="card"><b>\${countedMultiOrders}</b><span>محتسب ×1.5</span></div><div class="card warn"><b>\${failedOrdersCount}</b><span>الأوردرات الفاشلة</span></div><div class="card warn"><b>\${rejectedOrdersCount}</b><span>الأوردرات المرفوضة</span></div><div class="card"><b>\${countedOrderUnits}</b><span>إجمالي وحدات الأوردرات</span></div><div class="card money"><b>\${escapeHtml(formatMoney(orderUnitRate))}</b><span>سعر وحدة الأوردر</span></div><div class="card money"><b>\${escapeHtml(formatMoney(orderValueDue))}</b><span>قيمة الأوردرات المحتسبة</span></div>
      </div>
      <div class="section-title">ملخص المشاوير</div>
      <div class="cards">
        <div class="card"><b>\${trips.length}</b><span>إجمالي المشاوير</span></div><div class="card"><b>\${stats.countedTrips.length}</b><span>المشاوير المحتسبة</span></div><div class="card warn"><b>\${stats.rejectedTrips.length}</b><span>المشاوير المرفوضة</span></div><div class="card pending"><b>\${stats.pendingTrips.length}</b><span>مشاوير قيد المراجعة</span></div><div class="card"><b>\${stats.countedTripUnits}</b><span>وحدات المشاوير المحتسبة</span></div><div class="card money"><b>\${escapeHtml(formatMoney(tripUnitRate))}</b><span>سعر وحدة المشوار</span></div><div class="card money"><b>\${escapeHtml(formatMoney(tripValueDue))}</b><span>قيمة المشاوير المحتسبة</span></div>
      </div>
      <div class="calc">طريقة الحساب: (\${countedNormalOrders} أوردر ×1 + \${countedMultiOrders} أوردر ×1.5 = \${countedOrderUnits} وحدة أوردر) × \${orderUnitRate} ج = \${escapeHtml(formatMoney(orderValueDue))} ج. والمشاوير: \${stats.countedTripUnits} وحدة محتسبة × \${tripUnitRate} ج = \${escapeHtml(formatMoney(tripValueDue))} ج. الفاشل والمرفوض وقيد المراجعة لا يدخل في القيمة المالية حتى الاعتماد.</div>
      <div class="totals"><div class="total"><span>الإجمالي قبل المراجعة والتسويات</span><b>\${escapeHtml(formatMoney(grossWorkValue))} ج.م</b></div><div class="total"><span>الصافي بعد الخصومات والمراجعة</span><b>\${escapeHtml(formatMoney(netAfterReview))} ج.م</b><small>خصومات: \${escapeHtml(formatMoney(stats.deductions))} ج.م</small></div><div class="total final"><span>الإجمالي النهائي المستحق</span><b>\${escapeHtml(formatMoney(finalPayable))} ج.م</b><small>بعد إضافة مكافآت: \${escapeHtml(formatMoney(stats.rewards))} ج.م</small></div></div>
      <div class="foot">تقرير ملخص فقط — لا يتضمن تفاصيل الأوردرات أو المشاوير الفردية.</div>
    </body></html>\`)
    reportWindow.document.close(); reportWindow.focus(); setTimeout(() => reportWindow.print(), 350)
  }

  function exportMonthlyReport() {
    return exportMonthlySummary()
  }

  function exportMonthlyReportLegacy() {`,
  'summary export insertion',
)

replaceOnce(
  '<button onClick={exportMonthlyReport} className="no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm"><Download size={16}/> حفظ التقرير الشهري PDF</button>',
  '<button onClick={exportMonthlySummary} className="no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm"><Download size={16}/> حفظ التقرير الملخص PDF</button>',
  'summary-only export button',
)

replaceOnce(
  '<p className="mt-3 text-xs font-bold text-cyan-900">بعد الضغط على «حفظ التقرير الشهري PDF» ستفتح نافذة الطباعة؛ اختر الطابعة «Save as PDF / حفظ كملف PDF» ثم احفظ الملف لإرساله للمندوب.</p>',
  '<p className="mt-3 text-xs font-bold text-cyan-900">ملف PDF يحتوي الملخص المالي فقط بدون قائمة الأوردرات أو المشاوير. بعد فتح نافذة الطباعة اختر Adobe PDF أو Save as PDF، ثم اضغط Print وحدد مكان الحفظ.</p>',
  'summary-only help text',
)

await writeFile(file, source, 'utf8')
console.log('All rider PDF export paths now force the financial summary only')
