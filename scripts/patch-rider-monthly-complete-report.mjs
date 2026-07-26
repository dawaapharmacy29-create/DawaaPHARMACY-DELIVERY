import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderPerformanceDetail.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Rider monthly report anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  "function isReview(o: any) { const s = String(o?.review_status || o?.status || '').toLowerCase(); return !!o?.needs_review || ['pending','needs_review','registered'].includes(s) }",
  `function isReview(o: any) { const s = String(o?.review_status || o?.status || '').toLowerCase(); return !!o?.needs_review || ['pending','needs_review','registered'].includes(s) }
function tripStatus(t: any) { return String(t?.review_status || t?.status || '').trim().toLowerCase() }
function isCountedTrip(t: any) { const s = tripStatus(t); return t?.is_countable === true || ['approved','completed','countable','تم الاعتماد','محتسب'].includes(s) }
function isRejectedTrip(t: any) { const s = tripStatus(t); return t?.is_countable === false || ['rejected','declined','cancelled','excluded','مرفوض','ملغي'].includes(s) }
function isPendingTrip(t: any) { return !isCountedTrip(t) && !isRejectedTrip(t) }
function tripUnits(t: any) { return isCountedTrip(t) ? Number(t?.trip_multiplier || t?.multiplier || t?.count_units || 1) || 1 : 0 }
function tripAmount(t: any) { return n(t?.trip_earning || t?.trip_rate || t?.amount || t?.approved_amount) }
function escapeHtml(value: any) { return String(value ?? '—').replace(/[&<>\"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[ch] || ch)) }
function dateText(value: any) { const raw = String(value || ''); return raw ? raw.slice(0, 10) : '—' }`,
  'trip classification helpers',
)

replaceOnce(
  "    const revenue = clean.reduce((sum, o: any) => sum + n(o.invoice_amount || o.invoice_value || o.amount), 0)\n    const net = revenue - deductions + rewards",
  `    const revenue = clean.reduce((sum, o: any) => sum + n(o.invoice_amount || o.invoice_value || o.amount), 0)
    const countedTrips = trips.filter(isCountedTrip)
    const rejectedTrips = trips.filter(isRejectedTrip)
    const pendingTrips = trips.filter(isPendingTrip)
    const countedTripUnits = countedTrips.reduce((sum, trip) => sum + tripUnits(trip), 0)
    const countedTripAmount = countedTrips.reduce((sum, trip) => sum + tripAmount(trip), 0)
    const net = revenue - deductions + rewards`,
  'trip statistics',
)

replaceOnce(
  "      trips: trips.filter((t:any) => ['approved','countable','تم الاعتماد'].includes(String(t.status || t.review_status || '').toLowerCase())),",
  `      trips: countedTrips,
      countedTrips,
      rejectedTrips,
      pendingTrips,
      countedTripUnits,
      countedTripAmount,`,
  'return trip statistics',
)

const exportFunction = `
  function exportMonthlyReport() {
    if (!rider) return
    const countedOrderUnits = stats.counted.reduce((sum: number, order: any) => sum + (isMulti(order) ? 1.5 : 1), 0)
    const approvedDeductions = riderActions.filter((row: any) => row.review_status === 'approved' && ['deduction','deduction_request'].includes(String(row.final_action_type || row.action_type || '').toLowerCase()))
    const approvedRewards = riderActions.filter((row: any) => row.review_status === 'approved' && ['reward','reward_request'].includes(String(row.final_action_type || row.action_type || '').toLowerCase()))
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) { toast.error('المتصفح منع فتح تقرير PDF'); return }

    const orderRows = stats.clean.map((order: any) => \`<tr>
      <td>\${escapeHtml(dateText(order.delivery_date || order.work_date || order.registered_at || order.created_at))}</td>
      <td><b>\${escapeHtml(order.invoice_number || order.invoice_no)}</b></td>
      <td>\${escapeHtml(order.customer_name || order.customer_name_snapshot)}</td>
      <td>\${escapeHtml(order.status)}</td>
      <td>\${isMulti(order) ? '1.5' : '1'}</td>
      <td>\${escapeHtml(formatMoney(n(order.invoice_amount || order.invoice_value || order.amount)))}</td>
      <td>\${order.is_countable === true || String(order.final_count_status || '').startsWith('counted') ? 'محتسب' : 'غير محتسب'}</td>
      <td>\${escapeHtml(order.bconnect_match_status || order.reconciliation_status || order.review_status)}</td>
      <td>\${escapeHtml(order.failed_reason || order.count_exclusion_reason || order.reconciliation_notes || order.notes)}</td>
    </tr>\`).join('')

    const tripRows = trips.map((trip: any) => \`<tr>
      <td>\${escapeHtml(dateText(trip.trip_date || trip.work_date || trip.created_at))}</td>
      <td>\${escapeHtml(trip.from_label || trip.from_location || trip.start_label)}</td>
      <td>\${escapeHtml(trip.to_label || trip.to_location || trip.end_label)}</td>
      <td>\${escapeHtml(trip.reason || trip.notes || trip.trip_type)}</td>
      <td>\${isCountedTrip(trip) ? 'محتسب' : isRejectedTrip(trip) ? 'مرفوض' : 'قيد المراجعة'}</td>
      <td>\${tripUnits(trip)}</td>
      <td>\${escapeHtml(formatMoney(tripAmount(trip)))}</td>
      <td>\${escapeHtml(trip.review_reason || trip.rejection_reason || trip.proof_exception_reason || trip.manager_note)}</td>
    </tr>\`).join('')

    const adjustmentRows = [...approvedDeductions, ...approvedRewards].map((row: any) => \`<tr>
      <td>\${escapeHtml(dateText(row.shift_date || row.incident_at || row.created_at))}</td>
      <td>\${['reward','reward_request'].includes(String(row.final_action_type || row.action_type || '').toLowerCase()) ? 'مكافأة' : 'خصم'}</td>
      <td>\${escapeHtml(formatMoney(n(row.final_amount ?? row.requested_amount)))}</td>
      <td>\${escapeHtml(row.summary || row.reason || row.general_manager_note)}</td>
    </tr>\`).join('')

    reportWindow.document.write(\`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>تقرير \${escapeHtml(rider.name || rider.username)}</title><style>
      @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#102a35;margin:0}h1,h2{margin:8px 0}.head{text-align:center;border-bottom:3px solid #008E92;padding-bottom:12px}.meta{display:flex;justify-content:space-between;gap:10px;margin:12px 0;font-weight:bold}.cards{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin:12px 0}.card{border:1px solid #cbd5e1;border-radius:10px;padding:8px;text-align:center}.card b{display:block;font-size:20px;color:#007b80}.card span{font-size:10px}.section{break-inside:avoid;margin-top:15px}table{width:100%;border-collapse:collapse;margin-top:7px;font-size:9px}th,td{border:1px solid #cbd5e1;padding:5px;text-align:center;vertical-align:top}th{background:#07313d;color:white}.note{padding:9px;background:#ecfeff;border:1px solid #67e8f9;margin-top:12px;font-weight:bold}.empty{text-align:center;padding:12px;color:#64748b}
    </style></head><body>
      <div class="head"><h1>التقرير الشهري التفصيلي للمندوب</h1><h2>\${escapeHtml(rider.name || rider.username)} — \${escapeHtml(displayBranchName(branch?.name || rider.branch_name))}</h2><div>الدورة: \${escapeHtml(selectedFrom)} إلى \${escapeHtml(selectedTo)} (26 → 25)</div></div>
      <div class="meta"><span>اسم المستخدم: \${escapeHtml(rider.username)}</span><span>تاريخ التصدير: \${escapeHtml(new Date().toLocaleString('ar-EG'))}</span></div>
      <div class="cards">
        <div class="card"><b>\${stats.clean.length}</b><span>إجمالي الأوردرات</span></div><div class="card"><b>\${stats.counted.length}</b><span>أوردرات محتسبة</span></div><div class="card"><b>\${countedOrderUnits}</b><span>وحدات الأوردرات</span></div>
        <div class="card"><b>\${stats.failed.length}</b><span>أوردرات فاشلة</span></div><div class="card"><b>\${stats.duplicate.length}</b><span>فواتير مكررة</span></div><div class="card"><b>\${stats.notFound.length}</b><span>غير موجودة بالسيستم</span></div>
        <div class="card"><b>\${stats.countedTrips.length}</b><span>مشاوير محتسبة</span></div><div class="card"><b>\${stats.countedTripUnits}</b><span>وحدات المشاوير</span></div><div class="card"><b>\${stats.rejectedTrips.length}</b><span>مشاوير مرفوضة</span></div>
        <div class="card"><b>\${stats.pendingTrips.length}</b><span>مشاوير قيد المراجعة</span></div><div class="card"><b>\${stats.attendanceDays}</b><span>أيام الحضور</span></div><div class="card"><b>\${stats.attendanceHours}</b><span>ساعات الحضور</span></div>
        <div class="card"><b>\${escapeHtml(formatMoney(stats.deductions))}</b><span>خصومات معتمدة</span></div><div class="card"><b>\${escapeHtml(formatMoney(stats.rewards))}</b><span>مكافآت معتمدة</span></div><div class="card"><b>\${escapeHtml(formatMoney(stats.countedTripAmount))}</b><span>قيمة المشاوير المحتسبة</span></div>
      </div>
      <div class="note">الإجمالي المحتسب للمندوب: \${countedOrderUnits} وحدة أوردرات + \${stats.countedTripUnits} وحدة مشاوير. المشاوير المرفوضة وقيد المراجعة لا تدخل في الحساب حتى اعتمادها.</div>
      <div class="section"><h2>تفاصيل كل الأوردرات (\${stats.clean.length})</h2><table><thead><tr><th>التاريخ</th><th>الفاتورة</th><th>العميل</th><th>الحالة</th><th>المعامل</th><th>القيمة</th><th>الاحتساب</th><th>المطابقة</th><th>السبب/الملاحظة</th></tr></thead><tbody>\${orderRows || '<tr><td colspan="9" class="empty">لا توجد أوردرات</td></tr>'}</tbody></table></div>
      <div class="section"><h2>تفاصيل كل المشاوير (\${trips.length})</h2><table><thead><tr><th>التاريخ</th><th>من</th><th>إلى</th><th>السبب</th><th>قرار الاحتساب</th><th>الوحدات</th><th>القيمة</th><th>سبب الرفض/المراجعة</th></tr></thead><tbody>\${tripRows || '<tr><td colspan="8" class="empty">لا توجد مشاوير</td></tr>'}</tbody></table></div>
      <div class="section"><h2>الخصومات والمكافآت المعتمدة</h2><table><thead><tr><th>التاريخ</th><th>النوع</th><th>القيمة</th><th>السبب</th></tr></thead><tbody>\${adjustmentRows || '<tr><td colspan="4" class="empty">لا توجد خصومات أو مكافآت معتمدة</td></tr>'}</tbody></table></div>
    </body></html>\`)
    reportWindow.document.close(); reportWindow.focus(); setTimeout(() => reportWindow.print(), 250)
  }
`

replaceOnce(
  "  return <div className=\"min-h-screen bg-[#F3F7F8] print:bg-white\" dir=\"rtl\">",
  `${exportFunction}\n  return <div className="min-h-screen bg-[#F3F7F8] print:bg-white" dir="rtl">`,
  'export function insertion',
)

replaceOnce(
  "<button onClick={() => window.print()} className=\"no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm\"><Download size={16}/> PDF</button>",
  "<button onClick={exportMonthlyReport} className=\"no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm\"><Download size={16}/> تصدير التقرير الشهري الكامل PDF</button>",
  'PDF button',
)

replaceOnce(
  "          <Card label=\"المشاوير\" value={stats.trips.length} tone=\"purple\" onClick={() => openFilter('trips')} />",
  `          <Card label="المشاوير المحتسبة" value={stats.countedTrips.length} tone="purple" onClick={() => openFilter('trips')} />
          <Card label="المشاوير المرفوضة" value={stats.rejectedTrips.length} tone="red" onClick={() => openFilter('trips')} />
          <Card label="مشاوير قيد المراجعة" value={stats.pendingTrips.length} tone="orange" onClick={() => openFilter('trips')} />`,
  'trip cards',
)

replaceOnce(
  "<td className=\"p-3\">{t.status || t.review_status || '—'}</td><td className=\"p-3\">{formatMoney(n(t.trip_earning || t.trip_rate))}</td>",
  "<td className=\"p-3 font-black\">{isCountedTrip(t) ? 'محتسب' : isRejectedTrip(t) ? 'مرفوض' : 'قيد المراجعة'}</td><td className=\"p-3\">{tripUnits(t)}</td><td className=\"p-3\">{formatMoney(tripAmount(t))}</td>",
  'trip row status and units',
)
replaceOnce(
  "<th className=\"p-3\">الحالة</th><th className=\"p-3\">القيمة</th>",
  "<th className=\"p-3\">قرار الاحتساب</th><th className=\"p-3\">الوحدات</th><th className=\"p-3\">القيمة</th>",
  'trip table headers',
)

await writeFile(file, source, 'utf8')
console.log('Rider monthly PDF now includes complete order, trip, attendance, and adjustment details')
