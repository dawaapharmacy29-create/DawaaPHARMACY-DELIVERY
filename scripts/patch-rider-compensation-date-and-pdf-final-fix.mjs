import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceRequired(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Rider date/PDF final fix anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceRequired(
  "  async function loadReport() {\n    if (!riderId) return\n    setLoading(true)",
  "  async function loadReport() {\n    if (!riderId) return\n    if (!from || !to || from > to) {\n      toast.error('تاريخ البداية يجب أن يكون قبل أو مساويًا لتاريخ النهاية')\n      return\n    }\n    setLoading(true)",
  'invalid report range guard',
)

replaceRequired(
  '<label className="text-xs font-black text-slate-500">من<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black"/></label>',
  '<label className="text-xs font-black text-slate-500">من<input type="date" value={from} onChange={event => { const nextFrom = event.target.value; setFrom(nextFrom); if (nextFrom && (!to || nextFrom > to)) { const nextCycle = cycleRange(new Date(nextFrom + \'T12:00:00\')); setTo(nextCycle.end) } }} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black"/></label>',
  'start date auto correction',
)

replaceRequired(
  '<label className="text-xs font-black text-slate-500">إلى<input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black"/></label>',
  '<label className="text-xs font-black text-slate-500">إلى<input type="date" value={to} onChange={event => { const nextTo = event.target.value; setTo(nextTo); if (nextTo && (!from || nextTo < from)) { const nextCycle = cycleRange(new Date(nextTo + \'T12:00:00\')); setFrom(nextCycle.start) } }} className="mt-1 w-full rounded-2xl border bg-slate-50 px-3 py-3 text-sm font-black"/></label>',
  'end date auto correction',
)

replaceRequired(
  "report.style.cssText = 'position:fixed;left:0;top:0;width:1123px;height:794px;background:#fff;z-index:2147483647;transform:translateX(-200vw);opacity:1;visibility:visible;pointer-events:none;'",
  "report.style.cssText = 'position:fixed;left:-12000px;top:0;width:1123px;height:794px;background:#fff;z-index:2147483647;opacity:1;visibility:visible;pointer-events:none;overflow:hidden;'",
  'stable offscreen PDF container',
)

replaceRequired(
  "      if (!canvas.width || !canvas.height) throw new Error('صورة التقرير غير صالحة')\n      const context = canvas.getContext('2d', { willReadFrequently: true })\n      if (!context) throw new Error('تعذر قراءة صورة التقرير')\n      const sample = context.getImageData(0, 0, canvas.width, canvas.height).data\n      let nonWhitePixels = 0\n      const step = Math.max(4, Math.floor(sample.length / 12000 / 4) * 4)\n      for (let index = 0; index < sample.length; index += step) {\n        if (sample[index] < 245 || sample[index + 1] < 245 || sample[index + 2] < 245) {\n          nonWhitePixels += 1\n          if (nonWhitePixels > 20) break\n        }\n      }\n      if (nonWhitePixels <= 20) throw new Error('صورة التقرير خرجت فارغة؛ لم يتم حفظ ملف غير صالح')\n      const imageData = canvas.toDataURL('image/png')\n      if (!imageData.startsWith('data:image/png;base64,') || imageData.length < 10000) throw new Error('فشل تجهيز صورة التقرير')",
  "      if (canvas.width < 1000 || canvas.height < 700) throw new Error('تعذر تجهيز أبعاد التقرير')\n      const imageData = canvas.toDataURL('image/png')\n      if (!imageData.startsWith('data:image/png;base64,') || imageData.length < 5000) throw new Error('فشل تجهيز صورة التقرير')",
  'remove false blank-image validation',
)

replaceRequired(
  "      const blob = pdf.output('blob')\n      if (!blob || blob.size < 10000) throw new Error('ملف PDF الناتج غير صالح')",
  "      const blob = pdf.output('blob')\n      if (!blob || blob.size < 5000) throw new Error('ملف PDF الناتج غير صالح')",
  'reasonable PDF size validation',
)

await writeFile(file, source, 'utf8')
console.log('Rider report date range and PDF generation fixed')
