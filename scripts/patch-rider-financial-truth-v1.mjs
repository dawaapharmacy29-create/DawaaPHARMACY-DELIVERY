import { readFile, writeFile } from 'node:fs/promises'

const MARKER = 'delivery_rider_financial_summary_v1'

async function patchFile(relativePath, patcher) {
  const file = new URL('../' + relativePath, import.meta.url)
  const source = await readFile(file, 'utf8')
  if (source.includes(MARKER)) return
  const next = patcher(source)
  if (next === source) throw new Error('Delivery financial truth patch made no changes: ' + relativePath)
  await writeFile(file, next, 'utf8')
}

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (!source.includes(pattern)) throw new Error('Delivery financial truth anchor not found: ' + label)
    return source.replace(pattern, replacement)
  }
  if (!pattern.test(source)) throw new Error('Delivery financial truth anchor not found: ' + label)
  return source.replace(pattern, replacement)
}

const financialLoader = `
  async function loadFinancialTruth() {
    if (!riderId || !from || !to) {
      setFinancialSummary(null)
      return
    }
    const { data, error } = await supabase.rpc('delivery_rider_financial_summary_v1', {
      p_rider_id: riderId,
      p_period_start: from,
      p_period_end: to,
    })
    if (error) {
      setFinancialSummary(null)
      toast.error('تعذر تحميل الحساب المالي الموحد: ' + error.message)
      return
    }
    setFinancialSummary((data || null) as Row | null)
  }
`

await patchFile('src/pages/admin/RiderCompensationCenter.tsx', source => {
  source = replaceRequired(
    source,
    /  const \[assessments, setAssessments\] = useState<Row\[\]>\(\[\]\)/,
    match => match + "\n  const [financialSummary, setFinancialSummary] = useState<Row | null>(null)",
    'compensation financial state',
  )

  const effectMatch = source.match(/  useEffect\(\(\) => \{ void loadReport\(\) \}, \[riderId, from, to(?:, bonusType)?\]\)/)
  if (!effectMatch) throw new Error('Delivery financial truth anchor not found: compensation report effect')
  source = source.replace(effectMatch[0], effectMatch[0] + '\n' + financialLoader + "\n  useEffect(() => { void loadFinancialTruth() }, [riderId, from, to])")

  const summaryPattern = /  const summary = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[orders, trips, adjustments, orderRate, tripRate, normalizedBonusEarned\]\)/
  const summaryReplacement = `  const summary = useMemo(() => {
    const ordersSummary = financialSummary?.orders || {}
    const tripsSummary = financialSummary?.trips || {}
    const attendanceSummary = financialSummary?.attendance || {}
    const bonusSummary = financialSummary?.bonuses || {}
    return {
      totalOrders: Number(ordersSummary.total ?? orders.length),
      countedOrders: Number(ordersSummary.counted ?? 0),
      uncountedOrders: Math.max(0, Number(ordersSummary.total ?? orders.length) - Number(ordersSummary.counted ?? 0)),
      normalOrders: Number(ordersSummary.x1 ?? 0),
      multiplierOrders: Number(ordersSummary.x1_5 ?? 0),
      failedOrders: Number(ordersSummary.failed ?? 0),
      excludedOrders: Number(ordersSummary.excluded ?? 0),
      duplicateOrders: Number(ordersSummary.duplicates ?? 0),
      duplicateApprovedOrders: Number(ordersSummary.duplicate_approved ?? 0),
      duplicatePendingOrders: Number(ordersSummary.duplicate_pending ?? 0),
      duplicateRejectedOrders: Number(ordersSummary.duplicate_rejected ?? 0),
      unapprovedOrders: Number(ordersSummary.pending_review ?? 0),
      totalTrips: Number(tripsSummary.total ?? trips.length),
      approvedTrips: Number(tripsSummary.approved ?? 0),
      rejectedTrips: Number(tripsSummary.rejected ?? 0),
      pendingTrips: Number(tripsSummary.pending ?? 0),
      duplicateTrips: Number(tripsSummary.duplicates ?? 0),
      countedOperations: Number(ordersSummary.counted ?? 0) + Number(tripsSummary.approved ?? 0),
      normalOrderValue: Number(ordersSummary.x1 ?? 0) * Number(financialSummary?.rates?.order_1x_rate ?? orderRate ?? 0),
      multiplierOrderValue: Number(ordersSummary.x1_5 ?? 0) * Number(financialSummary?.rates?.order_1_5x_rate ?? (Number(orderRate || 0) * 1.5)),
      orderValue: Number(ordersSummary.pay ?? 0),
      tripValue: Number(tripsSummary.pay ?? 0),
      workHours: Number(attendanceSummary.work_hours ?? 0),
      hourlyPay: Number(attendanceSummary.hourly_pay ?? 0),
      monthlyBonus: Number(bonusSummary.monthly_earned ?? 0),
      quarterlyBonus: Number(bonusSummary.quarterly_earned ?? 0),
      rewards: Number(bonusSummary.rewards ?? 0),
      penalties: Number(bonusSummary.penalties ?? 0),
      net: Number(financialSummary?.net_pay ?? 0),
      gross: Number(financialSummary?.gross_pay ?? 0),
      readiness: financialSummary?.readiness || null,
    }
  }, [financialSummary, orders.length, trips.length, orderRate])`
  source = replaceRequired(source, summaryPattern, summaryReplacement, 'compensation canonical summary')

  source = source.replace(
    /\['الصافي النهائي', `\$\{money\(summary\.net\)\} ج`\]/,
    "['أجر الساعات', \`\${money(summary.hourlyPay)} ج\`], ['ساعات العمل', summary.workHours], ['الحافز الشهري', \`\${money(summary.monthlyBonus)} ج\`], ['الحافز الربع سنوي', \`\${money(summary.quarterlyBonus)} ج\`], ['الصافي النهائي', \`\${money(summary.net)} ج\`]",
  )

  source = source.replace(
    "['إجمالي المحتسب', summary.countedOrders],",
    "['المعتمد المحتسب', summary.countedOrders], ['غير المحتسب فعليًا', summary.uncountedOrders],",
  )
  source = source.replace(
    "['الأوردرات الفاشلة', summary.failedOrders],",
    "['الأوردرات الفاشلة فعليًا', summary.failedOrders], ['الأوردرات المستبعدة', summary.excludedOrders],",
  )
  source = source.replace(
    "['الأوردرات المكررة', summary.duplicateOrders],",
    "['الأوردرات المكررة', summary.duplicateOrders], ['مكرر معتمد', summary.duplicateApprovedOrders], ['مكرر قيد المراجعة', summary.duplicatePendingOrders], ['مكرر مرفوض', summary.duplicateRejectedOrders],",
  )
  source = source.replace(
    "['غير المعتمدة', summary.unapprovedOrders],",
    "['قيد المراجعة', summary.unapprovedOrders],",
  )

  source = source.replace(
    /<h2 className="mb-4 text-xl font-black text-\[#061827\]">أسعار الاحتساب<\/h2>/,
    '<h2 className="mb-4 text-xl font-black text-[#061827]">أسعار Snapshot الدورة</h2>',
  )

  source = source.replace(
    /value=\{orderRate\} onChange=\{event => setOrderRate\(event\.target\.value\)\}/g,
    'value={String(financialSummary?.rates?.order_1x_rate ?? orderRate)} readOnly',
  )
  source = source.replace(
    /value=\{tripRate\} onChange=\{event => setTripRate\(event\.target\.value\)\}/g,
    'value={String(financialSummary?.rates?.trip_rate ?? tripRate)} readOnly',
  )

  source = source.replace(/await loadReport\(\)/g, 'await Promise.all([loadReport(), loadFinancialTruth()])')

  const sectionAnchor = '<section className="rounded-3xl border bg-white p-5 shadow-sm">'
  const readinessPanel = `{financialSummary?.readiness && (
        <section className={\`rounded-3xl border p-4 shadow-sm \${financialSummary.readiness.ready_for_final ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}\`}>
          <p className="font-black text-[#061827]">جاهزية إقفال مستحقات الدليفري</p>
          <p className="mt-1 text-sm font-bold text-slate-600">
            مراجعات الحضور: {Number(financialSummary.readiness.pending_attendance_reviews || 0)} ·
            شيفتات مفتوحة: {Number(financialSummary.readiness.open_shifts || 0)} ·
            أوردرات معلقة: {Number(financialSummary.readiness.pending_order_reviews || 0)} ·
            مشاوير معلقة: {Number(financialSummary.readiness.pending_trips || 0)}
          </p>
        </section>
      )}

      `
  if (!source.includes('جاهزية إقفال مستحقات الدليفري')) {
    source = replaceRequired(source, sectionAnchor, readinessPanel + sectionAnchor, 'compensation readiness panel')
  }

  return source
})

await patchFile('src/pages/admin/RiderMonthlyReports.tsx', source => {
  source = replaceRequired(
    source,
    /  const \[adjustments, setAdjustments\] = useState<Row\[\]>\(\[\]\)/,
    match => match + "\n  const [financialSummary, setFinancialSummary] = useState<Row | null>(null)",
    'monthly financial state',
  )

  const effectMatch = source.match(/  useEffect\(\(\) => \{ void loadReport\(\) \}, \[riderId, from, to\]\)/)
  if (!effectMatch) throw new Error('Delivery financial truth anchor not found: monthly report effect')
  source = source.replace(effectMatch[0], effectMatch[0] + '\n' + financialLoader + "\n  useEffect(() => { void loadFinancialTruth() }, [riderId, from, to])")

  const summaryPattern = /  const summary = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[orders, trips, adjustments, rider\]\)/
  const summaryReplacement = `  const summary = useMemo(() => {
    const ordersSummary = financialSummary?.orders || {}
    const tripsSummary = financialSummary?.trips || {}
    const attendanceSummary = financialSummary?.attendance || {}
    const bonusSummary = financialSummary?.bonuses || {}
    const rates = financialSummary?.rates || {}
    const normalOrdersCount = Number(ordersSummary.x1 ?? 0)
    const multiplierOrdersCount = Number(ordersSummary.x1_5 ?? 0)
    return {
      normalOrdersCount,
      multiplierOrdersCount,
      failedOrdersCount: Number(ordersSummary.failed ?? 0),
      excludedOrdersCount: Number(ordersSummary.excluded ?? 0),
      duplicateOrdersCount: Number(ordersSummary.duplicates ?? 0),
      duplicateApprovedOrdersCount: Number(ordersSummary.duplicate_approved ?? 0),
      duplicatePendingOrdersCount: Number(ordersSummary.duplicate_pending ?? 0),
      duplicateRejectedOrdersCount: Number(ordersSummary.duplicate_rejected ?? 0),
      pendingOrdersCount: Number(ordersSummary.pending_review ?? 0),
      tripsCount: Number(tripsSummary.total ?? trips.length),
      approvedTripsCount: Number(tripsSummary.approved ?? 0),
      pendingTripsCount: Number(tripsSummary.pending ?? 0),
      normalOrdersValue: normalOrdersCount * Number(rates.order_1x_rate ?? rider?.order_rate ?? 0),
      multiplierOrdersValue: multiplierOrdersCount * Number(rates.order_1_5x_rate ?? (Number(rider?.order_rate || 0) * 1.5)),
      tripsValue: Number(tripsSummary.pay ?? 0),
      workHours: Number(attendanceSummary.work_hours ?? 0),
      hourlyPay: Number(attendanceSummary.hourly_pay ?? 0),
      monthlyIncentive: Number(bonusSummary.monthly_earned ?? 0),
      quarterlyIncentive: Number(bonusSummary.quarterly_earned ?? 0),
      rewardsTotal: Number(bonusSummary.rewards ?? 0),
      penaltiesTotal: Number(bonusSummary.penalties ?? 0),
      gross: Number(financialSummary?.gross_pay ?? 0),
      net: Number(financialSummary?.net_pay ?? 0),
      readiness: financialSummary?.readiness || null,
    }
  }, [financialSummary, trips.length, rider])`
  source = replaceRequired(source, summaryPattern, summaryReplacement, 'monthly canonical summary')

  const firstMetric = '<Metric label="أوردرات ×1"'
  const financialMetrics = `<Metric label="ساعات العمل" value={money(summary.workHours)} sub={\`أجر الساعات \${money(summary.hourlyPay)} ج.م\`} />
          <Metric label="الحافز الشهري" value={money(summary.monthlyIncentive)} sub="حسب Snapshot/التقييم المعتمد" tone="green" />
          <Metric label="الحافز الربع سنوي" value={money(summary.quarterlyIncentive)} sub="عند الاعتماد فقط" />
          `
  if (!source.includes('حسب Snapshot/التقييم المعتمد')) {
    source = replaceRequired(source, firstMetric, financialMetrics + firstMetric, 'monthly financial metrics')
  }

  source = source.replace(/await loadReport\(\)/g, 'await Promise.all([loadReport(), loadFinancialTruth()])')

  return source
})

console.log('Canonical delivery financial truth applied to compensation and monthly reports')
