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
    const approvedAdjustments = riderActions.filter((row: any) => String(row.review_status || row.status || '').toLowerCase() === 'approved')
    const adjustmentRows = approvedAdjustments
      .filter((row: any) => ['deduction','deduction_request','reward','reward_request','penalty'].includes(String(row.final_action_type || row.action_type || row.type || '').toLowerCase()))
      .map((row: any) => {
        const actionType = String(row.final_action_type || row.action_type || row.type || '').toLowerCase()
        const isReward = actionType.includes('reward')
        const amount = Math.abs(Number(row.final_amount ?? row.requested_amount ?? row.amount ?? 0))
        const date = String(row.shift_date || row.action_date || row.reviewed_at || row.created_at || '').slice(0, 10) || '—'
        const reason = String(row.reason || row.request_reason || row.action_reason || row.notes || row.admin_note || 'بدون سبب مسجل')
        return { date, type: isReward ? 'مكافأة' : 'خصم', amount, reason }
      })
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
    const orderValueDue = countedOrderUnits * Number(orderUnitRate || 0)
    const tripValueDue = stats.countedTripUnits * Number(tripUnitRate || 0)
    const grossWorkValue = orderValueDue + tripValueDue
    const netAfterReview = grossWorkValue - stats.deductions
    const finalPayable = netAfterReview + stats.rewards
    const reportFrame = document.createElement('iframe')
    reportFrame.style.position = 'fixed'
    reportFrame.style.left = '-10000px'
    reportFrame.style.top = '0'
    reportFrame.style.width = '1123px'
    reportFrame.style.height = '794px'
    reportFrame.style.border = '0'
    document.body.appendChild(reportFrame)
    const reportDocument = reportFrame.contentDocument
    if (!reportDocument) { reportFrame.remove(); toast.error('تعذر تجهيز ملف PDF'); return }
    const adjustmentsHtml = adjustmentRows.length
      ? adjustmentRows.map((row: any) => \`<tr><td>\${escapeHtml(row.date)}</td><td class=\"\${row.type === 'مكافأة' ? 'reward-text' : 'penalty-text'}\">\${escapeHtml(row.type)}</td><td>\${escapeHtml(formatMoney(row.amount))} ج.م</td><td>\${escapeHtml(row.reason)}</td><td>د/ معاذ</td></tr>\`).join('')
      : '<tr><td colspan="5" class="empty">لا توجد خصومات أو مكافآت معتمدة خلال هذه الدورة</td></tr>'
    const safeFileName = \`تقرير-\${String(rider.name || rider.username || 'دليفري').replace(/[\\/:*?\"<>|]/g, '-')}-\${selectedFrom}-\${selectedTo}.pdf\`
    toast.loading('جاري تجهيز ملف PDF...', { id: 'rider-pdf' })
    const onMessage = (event: MessageEvent) => {
      if (event.source !== reportFrame.contentWindow) return
      if (event.data?.type === 'rider-pdf-ready') {
        window.removeEventListener('message', onMessage)
        toast.success('تم تحميل ملف PDF', { id: 'rider-pdf' })
        setTimeout(() => reportFrame.remove(), 500)
      } else if (event.data?.type === 'rider-pdf-error') {
        window.removeEventListener('message', onMessage)
        toast.error('تعذر إنشاء PDF. تأكد من اتصال الإنترنت وحاول مرة أخرى.', { id: 'rider-pdf' })
        reportFrame.remove()
      }
    }
    window.addEventListener('message', onMessage)
    reportDocument.open()
    reportDocument.write(\`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>التقرير الشهري الملخص - \${escapeHtml(rider.name || rider.username)}</title><style>
      *{box-sizing:border-box}html,body{margin:0;background:#fff}body{font-family:Tahoma,Arial,sans-serif;color:#102a35;padding:18px}#report{width:1080px;background:#fff}.head{text-align:center;border-bottom:3px solid #008E92;padding-bottom:8px}.head h1{margin:0 0 5px;font-size:25px}.head h2{margin:0 0 5px;font-size:18px}.meta{display:flex;justify-content:space-between;margin:9px 0;font-weight:bold;font-size:12px}.section-title{margin:10px 0 6px;padding:6px 10px;border-radius:8px;background:#07313d;color:#fff;font-size:14px}.cards{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}.card{border:1px solid #cbd5e1;border-radius:9px;padding:7px;text-align:center;min-height:58px}.card b{display:block;font-size:18px;color:#007b80}.card span{font-size:9px;font-weight:bold}.money b{color:#0f766e}.warn b{color:#be123c}.pending b{color:#b45309}.calc{margin-top:9px;padding:9px;border:1px solid #67e8f9;background:#ecfeff;font-weight:bold;line-height:1.7;font-size:11px}.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.total{padding:10px;border-radius:10px;text-align:center;background:#f1f5f9}.total b{display:block;font-size:21px}.final{background:#07313d;color:white}.final b{font-size:27px}.adjustments{width:100%;border-collapse:collapse;font-size:11px}.adjustments th,.adjustments td{border:1px solid #cbd5e1;padding:7px;text-align:right;vertical-align:top}.adjustments th{background:#f1f5f9}.reward-text{color:#047857;font-weight:bold}.penalty-text{color:#be123c;font-weight:bold}.empty{text-align:center!important;color:#64748b}.foot{margin-top:7px;text-align:center;font-size:9px;color:#64748b}
    </style></head><body><div id="report">
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
      <div class="section-title">سجل الخصومات والمكافآت خلال الدورة</div>
      <table class="adjustments"><thead><tr><th>التاريخ</th><th>النوع</th><th>القيمة</th><th>السبب</th><th>الاعتماد</th></tr></thead><tbody>\${adjustmentsHtml}</tbody></table>
      <div class="totals"><div class="total"><span>الإجمالي قبل المراجعة والتسويات</span><b>\${escapeHtml(formatMoney(grossWorkValue))} ج.م</b></div><div class="total"><span>الصافي بعد الخصومات والمراجعة</span><b>\${escapeHtml(formatMoney(netAfterReview))} ج.م</b><small>خصومات: \${escapeHtml(formatMoney(stats.deductions))} ج.م</small></div><div class="total final"><span>الإجمالي النهائي المستحق</span><b>\${escapeHtml(formatMoney(finalPayable))} ج.م</b><small>بعد إضافة مكافآت: \${escapeHtml(formatMoney(stats.rewards))} ج.م</small></div></div>
      <div class="foot">تم اعتماد الخصومات والمكافآت بواسطة د/ معاذ — تقرير ملخص بدون تفاصيل الأوردرات أو المشاوير الفردية.</div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\\/script>
    <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"><\\/script>
    <script>
      window.addEventListener('load', async function(){
        try {
          var report = document.getElementById('report');
          var canvas = await window.html2canvas(report, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
          var jsPDF = window.jspdf.jsPDF;
          var pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
          var pageWidth = pdf.internal.pageSize.getWidth();
          var pageHeight = pdf.internal.pageSize.getHeight();
          var margin = 6;
          var imageWidth = pageWidth - margin * 2;
          var imageHeight = canvas.height * imageWidth / canvas.width;
          if (imageHeight <= pageHeight - margin * 2) {
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imageWidth, imageHeight, undefined, 'FAST');
          } else {
            var usableHeightPx = Math.floor(canvas.width * (pageHeight - margin * 2) / imageWidth);
            var offsetY = 0;
            var pageIndex = 0;
            while (offsetY < canvas.height) {
              var sliceHeight = Math.min(usableHeightPx, canvas.height - offsetY);
              var slice = document.createElement('canvas');
              slice.width = canvas.width; slice.height = sliceHeight;
              slice.getContext('2d').drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
              if (pageIndex > 0) pdf.addPage('a4', 'landscape');
              var sliceMmHeight = sliceHeight * imageWidth / canvas.width;
              pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imageWidth, sliceMmHeight, undefined, 'FAST');
              offsetY += sliceHeight; pageIndex += 1;
            }
          }
          pdf.save(\${JSON.stringify(safeFileName)});
          parent.postMessage({ type: 'rider-pdf-ready' }, '*');
        } catch (error) {
          parent.postMessage({ type: 'rider-pdf-error' }, '*');
        }
      });
    <\\/script></body></html>\`)
    reportDocument.close()
  }

  function exportMonthlyReport() {
    return exportMonthlySummary()
  }

  function exportMonthlyReportLegacy() {`,
  'summary export insertion',
)

replaceOnce(
  '<button onClick={exportMonthlyReport} className="no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm"><Download size={16}/> حفظ التقرير الشهري PDF</button>',
  '<button onClick={exportMonthlySummary} className="no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm"><Download size={16}/> تحميل التقرير الملخص PDF</button>',
  'summary-only export button',
)

replaceOnce(
  '<p className="mt-3 text-xs font-bold text-cyan-900">بعد الضغط على «حفظ التقرير الشهري PDF» ستفتح نافذة الطباعة؛ اختر الطابعة «Save as PDF / حفظ كملف PDF» ثم احفظ الملف لإرساله للمندوب.</p>',
  '<p className="mt-3 text-xs font-bold text-cyan-900">اضغط «تحميل التقرير الملخص PDF» وسيتم تنزيل الملف مباشرة، شامل سجل الخصومات والمكافآت وأسبابها واعتماد د/ معاذ.</p>',
  'summary-only help text',
)

await writeFile(file, source, 'utf8')
console.log('Rider summary PDF downloads directly and includes approved adjustments')