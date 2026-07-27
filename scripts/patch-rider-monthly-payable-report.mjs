import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderPerformanceDetail.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Rider payable report anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  "  const [draft, setDraft] = useState<any | null>(null)",
  `  const [draft, setDraft] = useState<any | null>(null)
  const [orderUnitRate, setOrderUnitRate] = useState(10)
  const [tripUnitRate, setTripUnitRate] = useState(4)`,
  'rate state',
)

replaceOnce(
  "  useEffect(() => { void load() }, [riderId, selectedFrom, selectedTo])",
  `  useEffect(() => { void load() }, [riderId, selectedFrom, selectedTo])
  useEffect(() => {
    if (!riderId) return
    const saved = localStorage.getItem(\`rider-payment-rates:\${riderId}\`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Number.isFinite(Number(parsed.orderUnitRate))) setOrderUnitRate(Number(parsed.orderUnitRate))
        if (Number.isFinite(Number(parsed.tripUnitRate))) setTripUnitRate(Number(parsed.tripUnitRate))
      } catch { /* ignore invalid legacy value */ }
    }
  }, [riderId])`,
  'load saved rates',
)

replaceOnce(
  "  function exportMonthlyReport() {\n    if (!rider) return\n    const countedOrderUnits = stats.counted.reduce((sum: number, order: any) => sum + (isMulti(order) ? 1.5 : 1), 0)",
  `  function savePaymentRates() {
    if (!riderId) return
    localStorage.setItem(\`rider-payment-rates:\${riderId}\`, JSON.stringify({ orderUnitRate, tripUnitRate }))
    toast.success('تم حفظ سعر الأوردر والمشوار لهذا المندوب على هذا الجهاز')
  }

  function exportMonthlyReport() {
    if (!rider) return
    const countedNormalOrders = stats.counted.filter((order: any) => !isMulti(order)).length
    const countedMultiOrders = stats.counted.filter((order: any) => isMulti(order)).length
    const countedOrderUnits = countedNormalOrders + countedMultiOrders * 1.5
    const rejectedOrders = stats.clean.filter((order: any) => {
      const status = String(order.final_count_status || order.reconciliation_status || order.review_status || '').toLowerCase()
      return !isFailed(order) && (order.is_countable === false || ['rejected','excluded','not_countable'].some(value => status.includes(value)))
    })
    const orderValueDue = countedOrderUnits * Number(orderUnitRate || 0)
    const tripValueDue = stats.countedTripUnits * Number(tripUnitRate || 0)
    const grossWorkValue = orderValueDue + tripValueDue
    const netPayable = grossWorkValue - stats.deductions + stats.rewards`,
  'payable calculations',
)

replaceOnce(
  "<div class=\"card\"><b>${stats.clean.length}</b><span>إجمالي الأوردرات</span></div><div class=\"card\"><b>${stats.counted.length}</b><span>أوردرات محتسبة</span></div><div class=\"card\"><b>${countedOrderUnits}</b><span>وحدات الأوردرات</span></div>",
  "<div class=\"card\"><b>${stats.clean.length}</b><span>إجمالي الأوردرات</span></div><div class=\"card\"><b>${stats.counted.length}</b><span>الأوردرات المحتسبة</span></div><div class=\"card\"><b>${countedNormalOrders}</b><span>أوردرات محتسبة ×1</span></div><div class=\"card\"><b>${countedMultiOrders}</b><span>أوردرات محتسبة ×1.5</span></div><div class=\"card\"><b>${countedOrderUnits}</b><span>إجمالي وحدات الأوردرات</span></div><div class=\"card\"><b>${escapeHtml(formatMoney(orderUnitRate))}</b><span>سعر وحدة الأوردر</span></div><div class=\"card\"><b>${escapeHtml(formatMoney(orderValueDue))}</b><span>قيمة الأوردرات المحتسبة</span></div>",
  'order summary cards',
)

replaceOnce(
  "<div class=\"card\"><b>${stats.failed.length}</b><span>أوردرات فاشلة</span></div><div class=\"card\"><b>${stats.duplicate.length}</b><span>فواتير مكررة</span></div><div class=\"card\"><b>${stats.notFound.length}</b><span>غير موجودة بالسيستم</span></div>",
  "<div class=\"card\"><b>${stats.failed.length}</b><span>الأوردرات الفاشلة</span></div><div class=\"card\"><b>${rejectedOrders.length}</b><span>الأوردرات المرفوضة</span></div><div class=\"card\"><b>${stats.duplicate.length}</b><span>الأوردرات المكررة</span></div><div class=\"card\"><b>${stats.notFound.length}</b><span>غير موجودة بالسيستم</span></div>",
  'rejected order card',
)

replaceOnce(
  "<div class=\"card\"><b>${stats.countedTrips.length}</b><span>مشاوير محتسبة</span></div><div class=\"card\"><b>${stats.countedTripUnits}</b><span>وحدات المشاوير</span></div><div class=\"card\"><b>${stats.rejectedTrips.length}</b><span>مشاوير مرفوضة</span></div>",
  "<div class=\"card\"><b>${trips.length}</b><span>إجمالي المشاوير</span></div><div class=\"card\"><b>${stats.countedTrips.length}</b><span>المشاوير المحتسبة</span></div><div class=\"card\"><b>${stats.countedTripUnits}</b><span>وحدات المشاوير المحتسبة</span></div><div class=\"card\"><b>${stats.rejectedTrips.length}</b><span>المشاوير المرفوضة</span></div><div class=\"card\"><b>${escapeHtml(formatMoney(tripUnitRate))}</b><span>سعر وحدة المشوار</span></div><div class=\"card\"><b>${escapeHtml(formatMoney(tripValueDue))}</b><span>قيمة المشاوير المحتسبة</span></div>",
  'trip summary cards',
)

replaceOnce(
  "<div class=\"card\"><b>${escapeHtml(formatMoney(stats.deductions))}</b><span>خصومات معتمدة</span></div><div class=\"card\"><b>${escapeHtml(formatMoney(stats.rewards))}</b><span>مكافآت معتمدة</span></div><div class=\"card\"><b>${escapeHtml(formatMoney(stats.countedTripAmount))}</b><span>قيمة المشاوير المحتسبة</span></div>",
  "<div class=\"card\"><b>${escapeHtml(formatMoney(stats.deductions))}</b><span>الخصم المعتمد</span></div><div class=\"card\"><b>${escapeHtml(formatMoney(stats.rewards))}</b><span>المكافأة المعتمدة</span></div><div class=\"card\"><b>${escapeHtml(formatMoney(grossWorkValue))}</b><span>إجمالي قيمة الأوردرات والمشاوير</span></div><div class=\"card\"><b>${escapeHtml(formatMoney(netPayable))}</b><span>الصافي المستحق بعد الخصم والمكافأة</span></div>",
  'payable cards',
)

replaceOnce(
  "<div class=\"note\">الإجمالي المحتسب للمندوب: ${countedOrderUnits} وحدة أوردرات + ${stats.countedTripUnits} وحدة مشاوير. المشاوير المرفوضة وقيد المراجعة لا تدخل في الحساب حتى اعتمادها.</div>",
  "<div class=\"note\">طريقة الحساب: (${countedNormalOrders} أوردر ×1 + ${countedMultiOrders} أوردر ×1.5 = ${countedOrderUnits} وحدة) × ${orderUnitRate} ج = ${escapeHtml(formatMoney(orderValueDue))}. والمشاوير: ${stats.countedTripUnits} وحدة محتسبة × ${tripUnitRate} ج = ${escapeHtml(formatMoney(tripValueDue))}. الإجمالي قبل التسويات ${escapeHtml(formatMoney(grossWorkValue))}، والصافي بعد خصم ${escapeHtml(formatMoney(stats.deductions))} وإضافة مكافأة ${escapeHtml(formatMoney(stats.rewards))} = ${escapeHtml(formatMoney(netPayable))}.</div>",
  'calculation note',
)

replaceOnce(
  "<button onClick={exportMonthlyReport} className=\"no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm\"><Download size={16}/> تصدير التقرير الشهري الكامل PDF</button>",
  "<button onClick={exportMonthlyReport} className=\"no-print flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white shadow-sm\"><Download size={16}/> حفظ التقرير الشهري PDF</button>",
  'save PDF button label',
)

replaceOnce(
  "        <CycleSelector from={selectedFrom} to={selectedTo} onApply={handleCycleApply} />",
  `        <CycleSelector from={selectedFrom} to={selectedTo} onApply={handleCycleApply} />

        <section className="no-print rounded-3xl border border-cyan-200 bg-cyan-50 p-4 shadow-sm">
          <div className="mb-3"><h2 className="font-black text-[#061827]">إعداد قيمة الأوردر والمشوار لهذا المندوب</h2><p className="mt-1 text-xs font-bold text-slate-500">مثال: سعر الأوردر 10 جنيه وسعر المشوار 4 جنيه. التقرير يحسب المحتسب فقط، ثم يخصم الخصومات ويضيف المكافآت.</p></div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="rounded-2xl bg-white p-3"><span className="block text-xs font-black text-slate-500">سعر وحدة الأوردر بالجنيه</span><input type="number" min="0" step="0.5" value={orderUnitRate} onChange={event => setOrderUnitRate(Number(event.target.value || 0))} className="mt-2 w-full rounded-xl border px-3 py-2 text-lg font-black" /></label>
            <label className="rounded-2xl bg-white p-3"><span className="block text-xs font-black text-slate-500">سعر وحدة المشوار بالجنيه</span><input type="number" min="0" step="0.5" value={tripUnitRate} onChange={event => setTripUnitRate(Number(event.target.value || 0))} className="mt-2 w-full rounded-xl border px-3 py-2 text-lg font-black" /></label>
            <button type="button" onClick={savePaymentRates} className="rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white">حفظ الأسعار</button>
          </div>
          <p className="mt-3 text-xs font-bold text-cyan-900">بعد الضغط على «حفظ التقرير الشهري PDF» ستفتح نافذة الطباعة؛ اختر الطابعة «Save as PDF / حفظ كملف PDF» ثم احفظ الملف لإرساله للمندوب.</p>
        </section>`,
  'rate settings panel',
)

await writeFile(file, source, 'utf8')
console.log('Rider monthly PDF calculates weighted order units, trip units, rates, deductions, rewards, and net payable')
