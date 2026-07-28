import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Rider criteria patch anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
`type Criterion = {
  key: string
  label: string
  description: string
  weight: number
  score: number
}`,
`type Criterion = {
  key: string
  label: string
  description: string
  weight: number
  score: number
  note: string
}`,
'criterion type',
)

source = source.replace(
/const DEFAULT_CRITERIA: Criterion\[\] = \[[\s\S]*?\n\]/,
`const DEFAULT_CRITERIA: Criterion[] = [
  { key: 'attendance_permissions', label: 'المواعيد والأذونات', description: 'الالتزام بالحضور والانصراف، وعدم التأخير أو مغادرة الشيفت إلا بعد اعتماد الإذن.', weight: 20, score: 5, note: '' },
  { key: 'registration_settlement', label: 'التسجيل والتسوية المالية', description: 'تسجيل جميع الأوردرات والمشاوير بدقة، وتسليم قيمة الأوردرات كاملة دون نقص أو فروقات.', weight: 20, score: 5, note: '' },
  { key: 'delivery_execution_speed', label: 'سرعة التوصيل والتنفيذ', description: 'سرعة استلام وتنفيذ وتوصيل الأوردرات والمشاوير دون تأخير غير مبرر مع الحفاظ على سلامة الطلب.', weight: 20, score: 5, note: '' },
  { key: 'team_cooperation', label: 'التعاون مع فريق العمل', description: 'حسن التعامل مع الدكاترة والمناديب، واحترام مسؤول الشيفت والتعاون وقت ضغط العمل.', weight: 20, score: 5, note: '' },
  { key: 'customer_service_quality', label: 'جودة خدمة العملاء', description: 'حسن التعامل مع العميل، وضوح التواصل، توافر الفكة ورد الباقي كاملًا وعدم تركه بالصيدلية دون ضرورة موثقة.', weight: 20, score: 5, note: '' },
]`,
)

replaceOnce(
`      if (existing?.criteria) setCriteria(existing.criteria as Criterion[])`,
`      if (existing?.criteria) {
        const saved = existing.criteria as Partial<Criterion>[]
        setCriteria(DEFAULT_CRITERIA.map(item => {
          const matched = saved.find(savedItem => savedItem.key === item.key)
          return { ...item, score: Number(matched?.score ?? item.score), note: String(matched?.note ?? '') }
        }))
      } else {
        setCriteria(DEFAULT_CRITERIA.map(item => ({ ...item })))
      }`,
'load normalized criteria',
)

replaceOnce(
`  function updateCriterion(index: number, field: 'score' | 'weight', value: string) {
    setCriteria(currentRows => currentRows.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: Number(value) || 0 } : item))
  }`,
`  function updateCriterionScore(index: number, score: number) {
    setCriteria(currentRows => currentRows.map((item, itemIndex) => itemIndex === index ? { ...item, score } : item))
  }

  function updateCriterionNote(index: number, note: string) {
    setCriteria(currentRows => currentRows.map((item, itemIndex) => itemIndex === index ? { ...item, note } : item))
  }`,
'criterion updates',
)

replaceOnce(
`    if (!rider) return toast.error('اختار المندوب أولًا')
    setSaving(true)`,
`    if (!rider) return toast.error('اختار المندوب أولًا')
    const missingNote = criteria.find(item => item.score < 5 && item.note.trim().length < 3)
    if (missingNote) return toast.error('اكتب سبب واضح لتقييم بند: ' + missingNote.label)
    setSaving(true)`,
'assessment validation',
)

const tablePattern = /        <div className="overflow-x-auto"><table[\s\S]*?<\/table><\/div>/
if (!tablePattern.test(source)) throw new Error('Rider criteria patch anchor not found: criteria table')
source = source.replace(tablePattern, `        <div className="grid gap-4 lg:grid-cols-2">
          {criteria.map((item, index) => {
            const points = item.score * 4
            const earned = (bonusBase * points) / 100
            return (
              <article key={item.key} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 print:break-inside-avoid">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-black text-[#061827]">{item.label}</h3>
                    <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{item.description}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-2 text-center shadow-sm">
                    <p className="text-xs font-black text-slate-400">النقاط</p>
                    <p className="text-xl font-black text-[#008E92]">{points} / 20</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-1" aria-label={item.label + ' من 5 نجوم'}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} type="button" onClick={() => updateCriterionScore(index, star)} className={'text-3xl leading-none transition hover:scale-110 print:pointer-events-none ' + (star <= item.score ? 'text-amber-400' : 'text-slate-300')} aria-label={star + ' نجوم'}>★</button>
                    ))}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black text-slate-400">المستحق من الحافز</p>
                    <p className="text-lg font-black text-[#008E92]">{money(earned)} ج</p>
                  </div>
                </div>
                <label className="mt-3 block text-xs font-black text-slate-500 print:hidden">
                  الملاحظة {item.score < 5 ? '(إلزامية)' : '(اختيارية)'}
                  <textarea value={item.note} onChange={event => updateCriterionNote(index, event.target.value)} rows={2} placeholder={item.score < 5 ? 'اكتب سبب التقييم الأقل من 5 نجوم' : 'ملاحظة اختيارية'} className="mt-1 w-full resize-none rounded-2xl border bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#008E92]" />
                </label>
                {item.note && <p className="mt-3 hidden rounded-2xl bg-white p-3 text-sm font-bold text-slate-600 print:block">ملاحظة المدير: {item.note}</p>}
              </article>
            )
          })}
        </div>`)

replaceOnce(
`<div><h2 className="text-xl font-black text-[#061827]">تقييم الحافز</h2><p className="text-sm font-bold text-slate-500">كل بند درجته من 5، وقيمة البند تُحتسب بنسبة الدرجة.</p></div>`,
`<div><h2 className="text-xl font-black text-[#061827]">تقييم الحافز بالنجوم</h2><p className="text-sm font-bold text-slate-500">5 بنود متساوية؛ كل بند 20 نقطة، وكل نجمة تساوي 4 نقاط.</p></div>`,
'criteria heading',
)

await writeFile(file, source, 'utf8')
console.log('Rider compensation criteria updated to five equal star-rated categories')
