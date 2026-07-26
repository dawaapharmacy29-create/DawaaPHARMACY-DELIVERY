import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Rider summary anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  `      const countedUnits = normal + (multiplier * 1.5)
      const riskScore = failed + notFound + duplicates + deleted + pendingTrips + wrongAfterReview
      return {
        rider, normal, multiplier, countedUnits, failed, wrongAfterReview, notFound, duplicates, pending, deleted,
        approvedTrips, pendingTrips, allTrips, riskScore, totalOrders: riderOrders.length,`,
  `      const countedUnits = normal + (multiplier * 1.5)
      const deletedOrders = orders.filter(o => o.rider_id === rider.id && Boolean((o as any).deleted_at))
      const reviewOrderIds = new Set([
        ...riderOrders.filter(o =>
          o.status === 'failed' ||
          o.bconnect_match_status === 'invoice_not_found' ||
          String((o as any).final_count_status || '').includes('not_found') ||
          duplicateInvoiceSet.has(normalizeOrderInvoice(o)) ||
          Boolean(o.is_duplicate_invoice) ||
          ['rejected','excluded','excluded_failed','excluded_duplicate','excluded_legacy_unassigned'].includes(String((o as any).final_count_status || '')) ||
          (!((o as any).is_countable === true) && !String((o as any).final_count_status || '').startsWith('excluded'))
        ).map(o => o.id),
        ...deletedOrders.map(o => o.id),
      ])
      const reviewOrders = reviewOrderIds.size
      const totalNeedsReview = reviewOrders + pendingTrips
      const approvalRate = riderOrders.length ? Math.round(((normal + multiplier) / riderOrders.length) * 100) : 0
      return {
        rider, normal, multiplier, countedUnits, failed, wrongAfterReview, notFound, duplicates, pending, deleted,
        approvedTrips, pendingTrips, allTrips, riskScore: totalNeedsReview, reviewOrders, totalNeedsReview, approvalRate, totalOrders: riderOrders.length,`,
  'review totals calculation',
)

replaceOnce(
  `<div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xl font-black text-[#061827]">ملخص المندوبين للدورة الحالية</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 text-right">المندوب</th>
                  <th className="p-2">1</th>
                  <th className="p-2">×1.5</th>
                  <th className="p-2">وحدات</th>
                  <th className="p-2">فاشل</th>
                  <th className="p-2">غير موجود</th>
                  <th className="p-2">مكرر</th>
                  <th className="p-2">مشاوير معلقة</th>
                  <th className="p-2">مخاطر</th>
                  <th className="p-2">ملف الأداء</th>
                </tr>
              </thead>
              <tbody>
                {riderSummaryRows.map(row => (
                  <tr key={row.rider.id} className="border-t">
                    <td className="p-2 font-black">{row.rider.name}</td>
                    <td className="p-2 text-center">{row.normal}</td>
                    <td className="p-2 text-center">{row.multiplier}</td>
                    <td className="p-2 text-center font-black text-emerald-700">{row.countedUnits}</td>
                    <td className="p-2 text-center text-rose-700">{row.failed}</td>
                    <td className="p-2 text-center text-rose-700">{row.notFound}</td>
                    <td className="p-2 text-center text-amber-700">{row.duplicates}</td>
                    <td className="p-2 text-center text-blue-700">{row.pendingTrips}</td>
                    <td className={\`p-2 text-center font-black \${row.riskScore > 5 ? 'text-rose-700' : row.riskScore > 0 ? 'text-amber-700' : 'text-emerald-700'}\`}>{row.riskScore}</td>
                    <td className="p-2 text-center">
                      <button type="button" onClick={() => navigate(\`/admin/riders/\${row.rider.id}/performance?from=\${encodeURIComponent(selectedFrom)}&to=\${encodeURIComponent(selectedTo)}\`)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                        ملف الأداء
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>`,
  `<div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-[#061827]">ملخص واضح لكل مندوب</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">المحتسب هو اللي يدخل في حساب المندوب. أما «تحتاج مراجعة» فهي أوردرات أو مشاوير لم تُحسم بعد، وليست خصمًا تلقائيًا.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded-full bg-emerald-50 px-3 py-2 text-emerald-700">محتسب = أوردر صحيح</span>
              <span className="rounded-full bg-rose-50 px-3 py-2 text-rose-700">فاشل/غير موجود = لا يحتسب حاليًا</span>
              <span className="rounded-full bg-amber-50 px-3 py-2 text-amber-700">مكرر/قيد المطابقة = قرار مطلوب</span>
              <span className="rounded-full bg-blue-50 px-3 py-2 text-blue-700">مشوار معلق = يحتاج إغلاق أو اعتماد</span>
            </div>
          </div>
          <div className="overflow-auto rounded-2xl border border-slate-100">
            <table className="min-w-[1050px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="p-3 text-right">المندوب</th>
                  <th className="p-3">الأوردرات المحتسبة</th>
                  <th className="p-3">نسبة الاعتماد</th>
                  <th className="p-3">فاشلة</th>
                  <th className="p-3">غير موجودة بالسيستم</th>
                  <th className="p-3">مكررة</th>
                  <th className="p-3">قيد المطابقة</th>
                  <th className="p-3">مشاوير معلقة</th>
                  <th className="p-3">إجمالي يحتاج مراجعة</th>
                  <th className="p-3">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {riderSummaryRows.map(row => (
                  <tr key={row.rider.id} className="border-t align-middle hover:bg-slate-50/70">
                    <td className="p-3">
                      <p className="font-black text-slate-900">{row.rider.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">إجمالي مسجل: {row.totalOrders} أوردر</p>
                    </td>
                    <td className="p-3 text-center">
                      <p className="text-xl font-black text-emerald-700">{row.normal + row.multiplier}</p>
                      <p className="text-xs font-bold text-slate-500">عادي {row.normal} · ×1.5 عدد {row.multiplier}</p>
                      <p className="mt-1 text-xs font-black text-emerald-600">الوحدات: {row.countedUnits}</p>
                    </td>
                    <td className="p-3 text-center">
                      <span className={\`inline-flex rounded-full px-3 py-1 font-black \${row.approvalRate >= 90 ? 'bg-emerald-100 text-emerald-700' : row.approvalRate >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}\`}>{row.approvalRate}%</span>
                    </td>
                    <td className="p-3 text-center font-black text-rose-700">{row.failed}</td>
                    <td className="p-3 text-center font-black text-rose-700">{row.notFound}</td>
                    <td className="p-3 text-center font-black text-amber-700">{row.duplicates}</td>
                    <td className="p-3 text-center font-black text-amber-700">{row.pending}</td>
                    <td className="p-3 text-center font-black text-blue-700">{row.pendingTrips}</td>
                    <td className="p-3 text-center">
                      <p className={\`text-xl font-black \${row.totalNeedsReview > 20 ? 'text-rose-700' : row.totalNeedsReview > 0 ? 'text-amber-700' : 'text-emerald-700'}\`}>{row.totalNeedsReview}</p>
                      <p className="text-[11px] font-bold text-slate-400">{row.reviewOrders} أوردر + {row.pendingTrips} مشوار</p>
                    </td>
                    <td className="p-3 text-center">
                      <button type="button" onClick={() => navigate(\`/admin/riders/\${row.rider.id}/performance?from=\${encodeURIComponent(selectedFrom)}&to=\${encodeURIComponent(selectedTo)}\`)} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800">فتح ملف الأداء</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-6 text-slate-600">
            مثال: «304 محتسب» يعني 304 أوردر صحيح يدخل في الحساب. «25 غير موجود» يعني رقم الفاتورة لم يظهر في ملفات السيستم المرفوعة للدورة. «190 مشوار معلق» لا يخص الفواتير؛ هو عدد المشاوير التي لم تُغلق أو تُعتمد بعد.
          </div>
        </div>`,
  'summary table layout',
)

await writeFile(file, source, 'utf8')
console.log('Rider reconciliation summary is now simplified and self-explanatory')
