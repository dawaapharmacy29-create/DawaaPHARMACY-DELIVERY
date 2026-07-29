import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Rider direct PDF patch anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  `  const [saving, setSaving] = useState(false)`,
  `  const [saving, setSaving] = useState(false)
  const [pdfDownloading, setPdfDownloading] = useState(false)`,
  'pdf loading state',
)

replaceOnce(
`  function printPdf() {
    document.title = \`تقرير مستحقات \${rider?.name || rider?.username || 'دليفري'} \${from} - \${to}\`
    window.print()
  }`,
`  async function downloadPdf() {
    if (!rider) return toast.error('اختار المندوب أولًا')
    setPdfDownloading(true)
    try {
      const jspdfUrl = 'https://esm.sh/jspdf@2.5.2'
      const html2canvasUrl = 'https://esm.sh/html2canvas@1.4.1'
      const [{ jsPDF }, canvasModule] = await Promise.all([
        import(/* @vite-ignore */ jspdfUrl),
        import(/* @vite-ignore */ html2canvasUrl),
      ]) as any
      const html2canvas = canvasModule.default || canvasModule

      const improvementCriteria = criteria.filter(item => Number(item.score || 0) < 5)
      const advice = improvementCriteria.length
        ? 'نصيحة للمندوب: ركّز خلال الدورة القادمة على ' + improvementCriteria.map(item => item.label + (item.note ? ' (' + item.note + ')' : '')).join('، ') + '، مع مراجعة مدير الفرع أسبوعيًا لمتابعة التحسن.'
        : 'نصيحة للمندوب: أداؤك ممتاز في جميع بنود التقييم. حافظ على نفس مستوى الالتزام والسرعة وجودة الخدمة خلال الدورة القادمة.'

      const metric = (label: string, value: string | number) => \`<div class="metric"><span>\${label}</span><strong>\${value}</strong></div>\`
      const criteriaRows = criteria.map(item => {
        const points = Number(item.score || 0) * 4
        const stars = '★'.repeat(Math.max(0, Math.min(5, Number(item.score || 0)))) + '☆'.repeat(Math.max(0, 5 - Math.min(5, Number(item.score || 0))))
        return \`<tr><td>\${item.label}</td><td class="stars">\${stars}</td><td>\${points} / 20</td><td>\${item.note || '—'}</td></tr>\`
      }).join('')

      const report = document.createElement('div')
      report.dir = 'rtl'
      report.style.cssText = 'position:fixed;left:-20000px;top:0;width:1123px;height:794px;background:#fff;z-index:-1;'
      report.innerHTML = \`
        <style>
          *{box-sizing:border-box} .page{width:1123px;height:794px;padding:22px 26px;font-family:Arial,"Tahoma",sans-serif;color:#071a28;background:white;overflow:hidden}
          .head{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #008e92;padding-bottom:10px;margin-bottom:10px}
          .brand{font-size:13px;font-weight:900;color:#008e92}.title{font-size:25px;font-weight:900;margin:2px 0}.sub{font-size:12px;font-weight:700;color:#64748b}
          .meta{text-align:left;font-size:11px;font-weight:800;line-height:1.8;color:#334155}
          .metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:9px}.metric{border:1px solid #dbe8ea;background:#f5fafa;border-radius:10px;padding:7px 8px;min-height:48px}.metric span{display:block;font-size:9px;font-weight:800;color:#64748b}.metric strong{display:block;margin-top:4px;font-size:15px;font-weight:900;color:#071a28}
          .section-title{font-size:13px;font-weight:900;color:#006f73;margin:7px 0 5px}.two{display:grid;grid-template-columns:1.08fr .92fr;gap:10px}
          table{width:100%;border-collapse:collapse;font-size:10px}th{background:#071a28;color:white;padding:6px;border:1px solid #071a28}td{padding:5px 6px;border:1px solid #dbe4e8;font-weight:700;vertical-align:middle}.stars{color:#e6a500;font-size:14px;letter-spacing:1px;white-space:nowrap}
          .money{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:7px}.money .metric{background:#f8fafc}.net{background:#071a28!important;color:white}.net span,.net strong{color:white!important}
          .advice{margin-top:8px;border:1px solid #99d8da;background:#edfafa;border-radius:10px;padding:8px 10px;font-size:11px;font-weight:900;line-height:1.7;color:#07585b}
          .footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px;font-size:10px;font-weight:800;color:#64748b}.sign{display:flex;gap:60px;color:#071a28}.sign div{width:155px;border-top:1px solid #071a28;padding-top:5px;text-align:center}
        </style>
        <div class="page">
          <div class="head">
            <div><div class="brand">صيدليات دواء — Dawaa Delivery</div><div class="title">تقرير مستحقات وتقييم الدليفري</div><div class="sub">\${rider.name || rider.username} · \${rider.branch_name || 'بدون فرع'} · من \${from} إلى \${to}</div></div>
            <div class="meta">نوع الحافز: \${bonusType === 'monthly' ? 'شهري' : 'ربع سنوي'}<br>المعتمد: \${approverName}<br>تاريخ الإصدار: \${new Date().toLocaleDateString('ar-EG')}<br>رقم التقرير: \${riderId.slice(0, 8)}-\${from.replaceAll('-', '')}-\${bonusType}</div>
          </div>

          <div class="metrics">
            \${metric('إجمالي الأوردرات', summary.totalOrders)}
            \${metric('أوردرات ×1', summary.normalOrders)}
            \${metric('أوردرات ×1.5', summary.multiplierOrders)}
            \${metric('الأوردرات المحتسبة', summary.countedOrders)}
            \${metric('الفاشلة', summary.failedOrders)}
            \${metric('المكررة', summary.duplicateOrders)}
            \${metric('غير المعتمدة', summary.unapprovedOrders)}
            \${metric('إجمالي المشاوير', summary.totalTrips)}
            \${metric('المشاوير المعتمدة', summary.approvedTrips)}
            \${metric('المشاوير المرفوضة', summary.rejectedTrips)}
            \${metric('المشاوير غير المعتمدة', summary.pendingTrips)}
            \${metric('صافي العمليات المحتسبة', summary.countedOperations)}
          </div>

          <div class="money">
            \${metric('قيمة أوردرات ×1', money(summary.normalOrderValue) + ' ج')}
            \${metric('قيمة أوردرات ×1.5', money(summary.multiplierOrderValue) + ' ج')}
            \${metric('إجمالي قيمة الأوردرات', money(summary.orderValue) + ' ج')}
            \${metric('إجمالي قيمة المشاوير', money(summary.tripValue) + ' ج')}
            \${metric('الحافز المستحق', money(normalizedBonusEarned) + ' ج')}
            \${metric('المكافآت', money(summary.rewards) + ' ج')}
            \${metric('الخصومات', money(summary.penalties) + ' ج')}
            <div class="metric net"><span>الصافي النهائي</span><strong>\${money(summary.net)} ج</strong></div>
          </div>

          <div class="two">
            <div><div class="section-title">تقييم الأداء</div><table><thead><tr><th>البند</th><th>النجوم</th><th>النقاط</th><th>ملاحظة المدير</th></tr></thead><tbody>\${criteriaRows}</tbody></table></div>
            <div><div class="section-title">تفاصيل الاحتساب</div><table><tbody>
              <tr><td>سعر الأوردر</td><td>\${money(Number(orderRate))} ج</td></tr>
              <tr><td>سعر المشوار</td><td>\${money(Number(tripRate))} ج</td></tr>
              <tr><td>قيمة أوردرات ×1</td><td>\${summary.normalOrders} × \${money(Number(orderRate))} = \${money(summary.normalOrderValue)} ج</td></tr>
              <tr><td>قيمة أوردرات ×1.5</td><td>\${summary.multiplierOrders} × \${money(Number(orderRate))} × 1.5 = \${money(summary.multiplierOrderValue)} ج</td></tr>
              <tr><td>قيمة المشاوير</td><td>\${summary.approvedTrips} × \${money(Number(tripRate))} = \${money(summary.tripValue)} ج</td></tr>
              <tr><td>ملاحظات التقييم</td><td>\${assessmentNote || 'لا توجد ملاحظات عامة'}</td></tr>
            </tbody></table></div>
          </div>

          <div class="advice">\${advice}</div>
          <div class="footer"><div>تم إنشاء التقرير إلكترونيًا من نظام صيدليات دواء.</div><div class="sign"><div>توقيع المندوب</div><div>توقيع مدير الفرع</div></div></div>
        </div>
      \`
      document.body.appendChild(report)
      await document.fonts?.ready
      const canvas = await html2canvas(report.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 297, 210, undefined, 'FAST')
      pdf.save(\`تقرير-مستحقات-\${rider.name || rider.username || 'دليفري'}-\${from}-\${to}.pdf\`)
      report.remove()
      toast.success('تم تحميل التقرير PDF في صفحة واحدة')
    } catch (error: any) {
      toast.error('تعذر تحميل ملف PDF: ' + (error?.message || 'خطأ غير معروف'))
    } finally {
      setPdfDownloading(false)
    }
  }`,
  'direct one page PDF function',
)

replaceOnce(
  `<button onClick={printPdf} className="inline-flex items-center gap-2 rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white"><Printer size={18}/> حفظ التقرير PDF</button>`,
  `<button onClick={downloadPdf} disabled={pdfDownloading} className="inline-flex items-center gap-2 rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white disabled:cursor-wait disabled:opacity-60"><Printer size={18}/>{pdfDownloading ? ' جاري تجهيز PDF...' : ' تحميل التقرير PDF'}</button>`,
  'download button',
)

await writeFile(file, source, 'utf8')
console.log('Rider compensation direct one-page PDF download enabled')
