import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const summaryPattern = /  const summary = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[orders, trips, adjustments, orderRate, tripRate, normalizedBonusEarned\]\)/
const summaryReplacement = [
  "  const summary = useMemo(() => {",
  "    const failedStatuses = ['failed', 'cancelled', 'canceled', 'returned']",
  "    const rejectedTripStatuses = ['rejected', 'declined', 'cancelled', 'canceled']",
  "    const isFailedOrder = (order: Row) => failedStatuses.includes(status(order))",
  "    const isDuplicateOrder = (order: Row) => Boolean(order.is_duplicate_invoice || order.duplicate_warning || order.original_order_id || order.duplicate_of)",
  "    const isCountedOrder = (order: Row) => !isFailedOrder(order)",
  "      && !isDuplicateOrder(order)",
  "      && order.excluded_from_incentive !== true",
  "      && order.not_countable !== true",
  "      && (order.is_countable === true || String(order.final_count_status || '').startsWith('counted'))",
  "",
  "    const countedOrders = orders.filter(isCountedOrder)",
  "    const normalOrders = countedOrders.filter(order => Number(order.order_multiplier ?? 1) < 1.5)",
  "    const multiplierOrders = countedOrders.filter(order => Number(order.order_multiplier ?? 1) >= 1.5)",
  "    const failedOrders = orders.filter(isFailedOrder)",
  "    const duplicateOrders = orders.filter(order => !isFailedOrder(order) && isDuplicateOrder(order))",
  "    const unapprovedOrders = orders.filter(order => !isFailedOrder(order) && !isDuplicateOrder(order) && !isCountedOrder(order))",
  "",
  "    const validTrips = trips.filter(trip => !trip.duplicate_of && trip.is_countable !== false)",
  "    const approvedTrips = validTrips.filter(trip => ['approved', 'completed'].includes(status(trip)))",
  "    const rejectedTrips = validTrips.filter(trip => rejectedTripStatuses.includes(status(trip)))",
  "    const pendingTrips = validTrips.filter(trip => !['approved', 'completed', ...rejectedTripStatuses].includes(status(trip)))",
  "    const duplicateTrips = trips.filter(trip => Boolean(trip.duplicate_of))",
  "",
  "    const effectiveOrderRate = Math.max(0, Number(orderRate) || 0)",
  "    const effectiveTripRate = Math.max(0, Number(tripRate) || 0)",
  "    const normalOrderValue = normalOrders.length * effectiveOrderRate",
  "    const multiplierOrderValue = multiplierOrders.length * effectiveOrderRate * 1.5",
  "    const orderValue = normalOrderValue + multiplierOrderValue",
  "    const tripValue = approvedTrips.length * effectiveTripRate",
  "    const rewards = adjustments.filter(item => item.adjustment_type === 'reward' && String(item.status || '').toLowerCase() === 'approved').reduce((sum, item) => sum + Math.abs(Number(item.final_amount ?? item.amount ?? 0)), 0)",
  "    const penalties = adjustments.filter(item => item.adjustment_type === 'penalty' && String(item.status || '').toLowerCase() === 'approved').reduce((sum, item) => sum + Math.abs(Number(item.final_amount ?? item.amount ?? 0)), 0)",
  "",
  "    return {",
  "      totalOrders: orders.length,",
  "      countedOrders: countedOrders.length,",
  "      normalOrders: normalOrders.length,",
  "      multiplierOrders: multiplierOrders.length,",
  "      failedOrders: failedOrders.length,",
  "      duplicateOrders: duplicateOrders.length,",
  "      unapprovedOrders: unapprovedOrders.length,",
  "      totalTrips: trips.length,",
  "      approvedTrips: approvedTrips.length,",
  "      rejectedTrips: rejectedTrips.length,",
  "      pendingTrips: pendingTrips.length,",
  "      duplicateTrips: duplicateTrips.length,",
  "      countedOperations: countedOrders.length + approvedTrips.length,",
  "      normalOrderValue,",
  "      multiplierOrderValue,",
  "      orderValue,",
  "      tripValue,",
  "      rewards,",
  "      penalties,",
  "      net: orderValue + tripValue + normalizedBonusEarned + rewards - penalties,",
  "    }",
  "  }, [orders, trips, adjustments, orderRate, tripRate, normalizedBonusEarned])",
].join('\n')

if (!summaryPattern.test(source)) throw new Error('Rider compensation summary block not found')
source = source.replace(summaryPattern, summaryReplacement)

source = source.replace(
  '        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">',
  '        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">',
)

const cardsPattern = /          \{\[\n?[\s\S]*?\n?          \]\.map\(\(\[label, value\]\) => <div key=\{String\(label\)\} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black text-slate-500">\{label\}<\/p><p className="mt-1 text-xl font-black text-\[#061827\]">\{value\}<\/p><\/div>\)\}/
const cardsReplacement = [
  '          {[',
  "            ['إجمالي الأوردرات', summary.totalOrders],",
  "            ['الأوردرات ×1', summary.normalOrders],",
  "            ['الأوردرات ×1.5', summary.multiplierOrders],",
  "            ['إجمالي المحتسب', summary.countedOrders],",
  "            ['الأوردرات الفاشلة', summary.failedOrders],",
  "            ['الأوردرات المكررة', summary.duplicateOrders],",
  "            ['غير المعتمدة', summary.unapprovedOrders],",
  "            ['إجمالي المشاوير', summary.totalTrips],",
  "            ['المشاوير المعتمدة', summary.approvedTrips],",
  "            ['المشاوير المرفوضة', summary.rejectedTrips],",
  "            ['المشاوير غير المعتمدة', summary.pendingTrips],",
  "            ['المشاوير المكررة', summary.duplicateTrips],",
  "            ['صافي العمليات المحتسبة', summary.countedOperations],",
  "            ['قيمة أوردرات ×1', `${money(summary.normalOrderValue)} ج`],",
  "            ['قيمة أوردرات ×1.5', `${money(summary.multiplierOrderValue)} ج`],",
  "            ['إجمالي قيمة الأوردرات', `${money(summary.orderValue)} ج`],",
  "            ['إجمالي قيمة المشاوير', `${money(summary.tripValue)} ج`],",
  "            ['الصافي النهائي', `${money(summary.net)} ج`],",
  '          ].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-[#061827]">{value}</p></div>)}',
].join('\n')

if (!cardsPattern.test(source)) throw new Error('Rider compensation summary cards not found')
source = source.replace(cardsPattern, cardsReplacement)

const ratesAnchor = '<div className="grid grid-cols-2 gap-3"><label className="text-xs font-black text-slate-500">سعر الأوردر<input type="number" value={orderRate} onChange={event => setOrderRate(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3"/></label><label className="text-xs font-black text-slate-500">سعر المشوار<input type="number" value={tripRate} onChange={event => setTripRate(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3"/></label></div>'
const ratesReplacement = ratesAnchor + '<div className="mt-3 rounded-2xl bg-[#EAF8F8] p-3 text-xs font-black leading-6 text-[#006F73]">قيمة الأوردرات = (أوردرات ×1 × سعر الأوردر) + (أوردرات ×1.5 × سعر الأوردر × 1.5). قيمة المشاوير = المشاوير المعتمدة × سعر المشوار.</div>'
if (!source.includes(ratesReplacement)) {
  if (!source.includes(ratesAnchor)) throw new Error('Rider rates section not found')
  source = source.replace(ratesAnchor, ratesReplacement)
}

await writeFile(file, source, 'utf8')
console.log('Rider compensation counts and rate calculations updated')
