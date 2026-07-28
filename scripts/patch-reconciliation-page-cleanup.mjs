import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Reconciliation cleanup anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  "  const [bulkCounting, setBulkCounting] = useState(false)",
  "  const [bulkCounting, setBulkCounting] = useState(false)\n  const [showRiderSummary, setShowRiderSummary] = useState(false)",
  'collapsible rider summary state',
)

replaceOnce(
  `<div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">`,
  `<div className="rounded-3xl bg-white p-5 shadow-sm">
          <button type="button" onClick={() => setShowRiderSummary(value => !value)} className="flex w-full items-center justify-between gap-3 text-right">
            <div><h2 className="text-xl font-black text-[#061827]">ملخص المناديب</h2><p className="mt-1 text-sm font-bold text-slate-500">ملخص سريع فقط، والتفاصيل الكاملة موجودة في ملف أداء كل مندوب.</p></div>
            <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">{showRiderSummary ? 'إخفاء' : 'عرض'}</span>
          </button>
          {showRiderSummary && <div className="mt-4">
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">`,
  'collapse rider summary start',
)

replaceOnce(
  `          <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-6 text-slate-600">
            مثال: «304 محتسب» يعني 304 أوردر صحيح يدخل في الحساب. «25 غير موجود» يعني رقم الفاتورة لم يظهر في ملفات السيستم المرفوعة للدورة. «190 مشوار معلق» لا يخص الفواتير؛ هو عدد المشاوير التي لم تُغلق أو تُعتمد بعد.
          </div>
        </div>`,
  `          <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-6 text-slate-600">
            المحتسب يدخل في حساب المندوب، أما المراجعة والمشاوير المعلقة فلا تدخل حتى يتم حسمها.
          </div>
          </div>}
        </div>`,
  'collapse rider summary end',
)

replaceOnce(
  `{report && (
          <div className="rounded-3xl border border-teal-200 bg-teal-50 p-5">
            <h3 className="mb-3 text-lg font-black text-teal-800">نتيجة آخر مطابقة</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Kpi label="فواتير التوصيل في الملف" value={report.bconnectInvoices} />
              <Kpi label="المظبوط المحتسب" value={report.counted} tone="green" />
              <Kpi label="تلاعب/غير موجود" value={report.notFound} tone="red" />
              <Kpi label="فاشل مستبعد" value={report.failedExcluded} tone="red" />
              <Kpi label="فواتير لم يسجلها دليفري" value={report.bconnectWithoutRider} tone="amber" />
            </div>
          </div>
        )}`,
  `{report && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-black text-teal-800">
            تمت آخر مطابقة: {report.bconnectInvoices} فاتورة بالملف · {report.counted} محتسبة · {report.notFound} غير موجودة · {report.failedExcluded} فاشلة مستبعدة · {report.bconnectWithoutRider} بدون تسجيل دليفري.
          </div>
        )}`,
  'compact reconciliation result',
)

replaceOnce(
  `<div className="sticky top-2 z-20 rounded-3xl border border-emerald-100 bg-white p-4 shadow-lg">`,
  `<div className="sticky top-2 z-20 rounded-2xl border border-emerald-100 bg-white p-3 shadow-lg">`,
  'compact bulk toolbar',
)

replaceOnce(
  `<div className="flex flex-wrap gap-2 sm:flex-col">
                      {!(order as any).deleted_at ? (
                        <>
                          <button onClick={() => setDetailsOrder(order)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-black text-white hover:bg-slate-800"><Eye size={18} /> عرض التفاصيل</button>
                          <button onClick={() => openEditOrder(order)} className="flex items-center gap-2 rounded-xl bg-amber-100 px-4 py-2 font-black text-amber-800 hover:bg-amber-200"><Pencil size={18} /> تعديل البيانات</button>
                          <button onClick={() => handleManualMatch(order.id)} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-black text-white hover:bg-emerald-600"><CheckCircle2 size={18} /> اعتماد يدوي</button>
                          <button onClick={() => handleMarkNotFound(order.id)} className="flex items-center gap-2 rounded-xl bg-rose-100 px-4 py-2 font-black text-rose-700 hover:bg-rose-200"><XCircle size={18} /> استبعاد</button>
                          <button onClick={() => handleReassign(order)} className="flex items-center gap-2 rounded-xl bg-blue-100 px-4 py-2 font-black text-blue-700 hover:bg-blue-200">🔁 تحويل لمندوب</button>
                          <button onClick={() => handleSoftDelete(order)} className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 font-black text-slate-700 hover:bg-slate-200"><Trash2 size={18} /> حذف مع حفظ البيان</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setDetailsOrder(order)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-black text-white hover:bg-slate-800"><Eye size={18} /> عرض التفاصيل</button>
                          <button onClick={() => handleRestore(order)} className="flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-2 font-black text-emerald-700 hover:bg-emerald-200"><RotateCcw size={18} /> استعادة</button>
                        </>
                      )}
                    </div>`,
  `<div className="flex flex-wrap gap-2 sm:flex-col">
                      <button onClick={() => setDetailsOrder(order)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-black text-white hover:bg-slate-800"><Eye size={18} /> عرض التفاصيل</button>
                      {!(order as any).deleted_at && !isCounted && <button onClick={() => handleManualMatch(order.id)} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-black text-white hover:bg-emerald-600"><CheckCircle2 size={18} /> اعتماد يدوي</button>}
                      {!(order as any).deleted_at && !isCounted && <button onClick={() => handleMarkNotFound(order.id)} className="flex items-center gap-2 rounded-xl bg-rose-100 px-4 py-2 font-black text-rose-700 hover:bg-rose-200"><XCircle size={18} /> استبعاد</button>}
                      {!(order as any).deleted_at ? <details className="relative"><summary className="cursor-pointer list-none rounded-xl border px-4 py-2 font-black text-slate-700">إجراءات أخرى</summary><div className="mt-2 flex min-w-[190px] flex-col gap-2 rounded-2xl border bg-white p-2 shadow-xl sm:absolute sm:left-0 sm:z-30"><button onClick={() => openEditOrder(order)} className="rounded-xl bg-amber-100 px-3 py-2 font-black text-amber-800">تعديل البيانات</button><button onClick={() => handleReassign(order)} className="rounded-xl bg-blue-100 px-3 py-2 font-black text-blue-700">تحويل لمندوب</button><button onClick={() => handleSoftDelete(order)} className="rounded-xl bg-slate-100 px-3 py-2 font-black text-slate-700">حذف مع حفظ البيان</button></div></details> : <button onClick={() => handleRestore(order)} className="flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-2 font-black text-emerald-700 hover:bg-emerald-200"><RotateCcw size={18} /> استعادة</button>}
                    </div>`,
  'compact order actions',
)

await writeFile(file, source, 'utf8')
console.log('Reconciliation page is cleaner, less repetitive, and uses compact contextual actions')
