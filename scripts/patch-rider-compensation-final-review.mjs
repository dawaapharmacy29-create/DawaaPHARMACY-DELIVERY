import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Rider final-review patch anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
`  const [assessmentNote, setAssessmentNote] = useState('')`,
`  const [assessmentNote, setAssessmentNote] = useState('')
  const [approverId, setApproverId] = useState('')
  const [approverName, setApproverName] = useState('مدير النظام')`,
'approver state',
)

replaceOnce(
`  async function loadRiders() {
    const { data, error } = await supabase.from('riders').select('*').order('name', { ascending: true })`,
`  async function loadApprover() {
    const { data } = await supabase.auth.getUser()
    const user = data.user
    if (!user) return
    setApproverId(user.id)
    const metadata = user.user_metadata || {}
    setApproverName(String(metadata.display_name || metadata.full_name || metadata.name || user.email || 'مدير النظام'))
  }

  async function loadRiders() {
    const { data, error } = await supabase.from('riders').select('*').eq('active', true).eq('status', 'active').order('name', { ascending: true })`,
'active riders and approver loader',
)

replaceOnce(
`  useEffect(() => { void loadRiders() }, [])
  useEffect(() => { void loadReport() }, [riderId, from, to])`,
`  useEffect(() => { void loadApprover(); void loadRiders() }, [])
  useEffect(() => { void loadReport() }, [riderId, from, to, bonusType])`,
'reload by bonus type',
)

replaceOnce(
`      setOrderRate(String(rider?.order_rate ?? 0))
      setTripRate(String(rider?.trip_rate ?? 0))
      const existing = assessmentRows.find(row => row.cycle_start === from && row.cycle_end === to && row.bonus_type === bonusType)`,
`      setOrderRate(String(rider?.order_rate ?? 0))
      setTripRate(String(rider?.trip_rate ?? 0))
      const existing = assessmentRows.find(row => row.cycle_start === from && row.cycle_end === to && row.bonus_type === bonusType)
      if (!existing) {
        setMonthlyBonusBase(String(rider?.monthly_bonus_base ?? rider?.monthly_incentive_base ?? 0))
        setQuarterlyBonusBase(String(rider?.quarterly_incentive_base ?? 0))
        setAssessmentNote('')
      }`,
'default incentive values',
)

replaceOnce(
`      if (existing?.base_amount) bonusType === 'monthly' ? setMonthlyBonusBase(String(existing.base_amount)) : setQuarterlyBonusBase(String(existing.base_amount))`,
`      if (existing?.base_amount) bonusType === 'monthly' ? setMonthlyBonusBase(String(existing.base_amount)) : setQuarterlyBonusBase(String(existing.base_amount))
      if (existing) setAssessmentNote(String(existing.notes || ''))`,
'load assessment note',
)

replaceOnce(
`  const lastQuarterly = assessments.find(row => row.bonus_type === 'quarterly' && row.status === 'approved')`,
`  const lastQuarterly = assessments.find(row => row.bonus_type === 'quarterly' && row.status === 'approved')
  const currentQuarterly = assessments.find(row => row.bonus_type === 'quarterly' && row.cycle_start === from && row.cycle_end === to)
  const quarterlyNextEligibleDate = lastQuarterly?.cycle_start
    ? iso(new Date(new Date(lastQuarterly.cycle_start).getFullYear(), new Date(lastQuarterly.cycle_start).getMonth() + 3, new Date(lastQuarterly.cycle_start).getDate()))
    : null
  const quarterlyEligible = bonusType !== 'quarterly' || Boolean(currentQuarterly) || !quarterlyNextEligibleDate || from >= quarterlyNextEligibleDate`,
'quarterly eligibility',
)

replaceOnce(
`    if (!rider) return toast.error('اختار المندوب أولًا')
    const missingNote = criteria.find(item => item.score < 5 && item.note.trim().length < 3)`,
`    if (!rider) return toast.error('اختار المندوب أولًا')
    if (!from || !to || from > to) return toast.error('راجع تاريخ بداية ونهاية الدورة')
    if (bonusBase <= 0) return toast.error('قيمة الحافز الأساسية يجب أن تكون أكبر من صفر')
    if (!quarterlyEligible) return toast.error('لا يمكن اعتماد الحافز الربع سنوي قبل ' + quarterlyNextEligibleDate)
    const missingNote = criteria.find(item => item.score < 5 && item.note.trim().length < 3)`,
'assessment validation',
)

replaceOnce(
`        approved_by_name: 'د/ معاذ',`,
`        approved_by: approverId || null,
        approved_by_name: approverName,`,
'dynamic assessment approver',
)

replaceOnce(
`        reviewed_at: new Date().toISOString(),
        reviewed_by_name: 'د/ معاذ',`,
`        reviewed_at: new Date().toISOString(),
        reviewed_by: approverId || null,
        reviewed_by_name: approverName,`,
'dynamic adjustment reviewer',
)

replaceOnce(
`      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-2xl font-black text-[#061827]">{rider?.name || rider?.username || 'اختر مندوبًا'}</h2><p className="text-sm font-bold text-slate-500">{rider?.branch_name || 'بدون فرع'} · الفترة {from} إلى {to}</p></div>`,
`      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-2xl font-black text-[#061827]">{rider?.name || rider?.username || 'اختر مندوبًا'}</h2><p className="text-sm font-bold text-slate-500">{rider?.branch_name || 'بدون فرع'} · الفترة {from} إلى {to}</p><p className="mt-1 text-xs font-black text-slate-400">اعتماد: {approverName}</p></div>`,
'approver in report header',
)

replaceOnce(
`            ['الأوردرات المحتسبة', summary.countedOrders], ['المشاوير المعتمدة', summary.approvedTrips], ['قيمة الأوردرات', \`${money(summary.orderValue)} ج\`], ['قيمة المشاوير', \`${money(summary.tripValue)} ج\`], ['الصافي النهائي', \`${money(summary.net)} ج\`],`,
`            ['الأوردرات المحتسبة', summary.countedOrders], ['العادية / ×1.5', \`${summary.normalOrders} / ${summary.multiplierOrders}\`], ['المشاوير المعتمدة', summary.approvedTrips], ['قيمة الأوردرات', \`${money(summary.orderValue)} ج\`], ['قيمة المشاوير', \`${money(summary.tripValue)} ج\`], ['الصافي النهائي', \`${money(summary.net)} ج\`],`,
'expanded summary cards',
)

replaceOnce(
`        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#EAF8F8] p-4"><div><p className="text-sm font-black text-slate-500">الحافز المستحق</p><p className="text-3xl font-black text-[#008E92]">{money(normalizedBonusEarned)} ج.م</p></div><button onClick={saveAssessment} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white print:hidden"><Save size={17}/> حفظ واعتماد التقييم</button></div>`,
`        {bonusType === 'quarterly' && !quarterlyEligible && <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-800">الحافز الربع سنوي غير مستحق حاليًا. أقرب تاريخ اعتماد: {quarterlyNextEligibleDate}</div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#EAF8F8] p-4"><div><p className="text-sm font-black text-slate-500">الحافز المستحق</p><p className="text-3xl font-black text-[#008E92]">{money(normalizedBonusEarned)} ج.م</p></div><button onClick={saveAssessment} disabled={saving || !quarterlyEligible} className="inline-flex items-center gap-2 rounded-2xl bg-[#008E92] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50 print:hidden"><Save size={17}/> حفظ واعتماد التقييم</button></div>`,
'quarterly warning and disabled save',
)

replaceOnce(
`        <div className="mt-4 space-y-2">{adjustments.length === 0 ? <p className="text-sm font-bold text-slate-400">لا توجد حركات مسجلة في هذه الدورة.</p> : adjustments.map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-2xl border p-3 text-sm"><span className="font-black">{item.adjustment_type === 'penalty' ? 'خصم' : 'مكافأة'} — {item.reason}</span><span className={item.adjustment_type === 'penalty' ? 'font-black text-rose-700' : 'font-black text-emerald-700'}>{money(Math.abs(Number(item.final_amount ?? item.amount ?? 0)))} ج</span><span className="text-slate-400">{item.cycle_start} → {item.cycle_end}</span></div>)}</div>`,
`        <div className="mt-4 space-y-2">{adjustments.length === 0 ? <p className="text-sm font-bold text-slate-400">لا توجد حركات مسجلة في هذه الدورة.</p> : adjustments.map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-2xl border p-3 text-sm"><span className="font-black">{item.adjustment_type === 'penalty' ? 'خصم' : 'مكافأة'} — {item.reason}</span><span className={item.adjustment_type === 'penalty' ? 'font-black text-rose-700' : 'font-black text-emerald-700'}>{money(Math.abs(Number(item.final_amount ?? item.amount ?? 0)))} ج</span><span className="text-slate-400">{item.cycle_start} → {item.cycle_end}</span></div>)}</div>
        <div className="mt-8 hidden grid-cols-2 gap-8 text-center print:grid"><div className="border-t pt-3 font-black">توقيع المندوب</div><div className="border-t pt-3 font-black">توقيع مدير الفرع / المعتمد</div></div>
        <p className="mt-4 hidden text-center text-xs font-black text-slate-400 print:block">رقم التقرير: {riderId.slice(0, 8)}-{from.replaceAll('-', '')}-{bonusType}</p>`,
'print signatures and report id',
)

await writeFile(file, source, 'utf8')
console.log('Rider compensation final review patch applied')