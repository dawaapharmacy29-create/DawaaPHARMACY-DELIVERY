import { readFile, writeFile } from 'node:fs/promises'

async function patchFile(path, transforms) {
  const file = new URL(path, import.meta.url)
  let source = await readFile(file, 'utf8')
  let changed = false

  for (const { before, after, label } of transforms) {
    if (source.includes(after)) continue
    if (!source.includes(before)) {
      console.warn(`Operations review patch skipped: ${label}`)
      continue
    }
    source = source.replace(before, after)
    changed = true
  }

  if (changed) await writeFile(file, source, 'utf8')
}

await patchFile('../src/pages/admin/Reconciliation.tsx', [
  {
    label: 'reconciliation decision center',
    before: `        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">`,
    after: `        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-teal-700">مركز قرارات المطابقة</p>
              <h2 className="mt-1 text-xl font-black text-[#061827]">ابدأ بالحالات التي تحتاج تدخل إداري</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">المطابقة الأساسية تعتمد على رقم الفاتورة. اختلاف اسم العميل أو نفس اليوم لا يُستخدم كبديل للرقم.</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-black text-slate-600">الفترة: {selectedFrom} → {selectedTo}</div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button type="button" onClick={() => applyMainFilter('pending')} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="text-xs font-black text-amber-700">تحتاج قرار</span>
              <b className="mt-1 block text-2xl text-amber-900">{orders.filter(order => !String((order as any).final_count_status || '').startsWith('counted') && !String((order as any).final_count_status || '').startsWith('excluded') && !(order as any).deleted_at).length}</b>
              <span className="text-xs font-bold text-amber-700">مستني اعتماد أو مراجعة</span>
            </button>
            <button type="button" onClick={() => applyMainFilter('not_found')} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="text-xs font-black text-rose-700">غير موجود فعليًا</span>
              <b className="mt-1 block text-2xl text-rose-900">{notFoundTotal}</b>
              <span className="text-xs font-bold text-rose-700">رقم الفاتورة غير موجود في الملف</span>
            </button>
            <button type="button" onClick={() => applyMainFilter('duplicate')} className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="text-xs font-black text-orange-700">فواتير مكررة</span>
              <b className="mt-1 block text-2xl text-orange-900">{duplicateTotal}</b>
              <span className="text-xs font-bold text-orange-700">تحتاج تحديد السجل الصحيح</span>
            </button>
            <button type="button" onClick={() => applyMainFilter('multiplier')} className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="text-xs font-black text-blue-700">أوردرات ×1.5</span>
              <b className="mt-1 block text-2xl text-blue-900">{multiplierTotal}</b>
              <span className="text-xs font-bold text-blue-700">محتسبة مع مراجعة إدارية</span>
            </button>
          </div>
          <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm font-bold text-violet-800">
            رقم الفاتورة الموجود بنوع كاش لا يظهر كـ«غير موجود»؛ يتحول إلى «رقم موجود — نوع الفاتورة يحتاج مراجعة» ولا يُحتسب قبل قرار الإدارة.
          </div>
        </section>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">`,
  },
])

await patchFile('../src/pages/admin/TripsEnhanced.tsx', [
  {
    label: 'trips review queue',
    before: `      <section className="sticky top-2 z-20 rounded-3xl border bg-white p-4 shadow-sm">`,
    after: `      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black text-teal-700">طابور مراجعة المشاوير</p>
            <h2 className="mt-1 text-xl font-black text-[#061827]">راجع الأخطر أولًا ثم اعتمد السليم</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">كل رفض يحفظ السبب، والملاحظة، وحالة القرار داخل سجل المشوار.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-black text-slate-600">الدورة الحالية: {period.start} → {period.end}</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <button type="button" onClick={() => { setStatusFilter('pending_approval'); setProofFilter('all') }} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="text-xs font-black text-amber-700">مستني اعتماد</span><b className="mt-1 block text-2xl text-amber-900">{englishNumber(counts.pending)}</b><span className="text-xs font-bold text-amber-700">ابدأ بالمراجعة من هنا</span>
          </button>
          <button type="button" onClick={() => { setStatusFilter('all'); setProofFilter('without_photo') }} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="text-xs font-black text-rose-700">بدون إثبات</span><b className="mt-1 block text-2xl text-rose-900">{englishNumber(counts.withoutPhoto)}</b><span className="text-xs font-bold text-rose-700">تحتاج تحقق قبل الاعتماد</span>
          </button>
          <button type="button" onClick={() => { setStatusFilter('rejected'); setProofFilter('all') }} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="text-xs font-black text-slate-600">مرفوضة</span><b className="mt-1 block text-2xl text-slate-900">{englishNumber(counts.rejected)}</b><span className="text-xs font-bold text-slate-600">راجع أسباب الرفض</span>
          </button>
          <button type="button" onClick={() => { setStatusFilter('approved'); setProofFilter('all') }} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="text-xs font-black text-emerald-700">معتمدة</span><b className="mt-1 block text-2xl text-emerald-900">{englishNumber(counts.approved)}</b><span className="text-xs font-bold text-emerald-700">قرارات مكتملة</span>
          </button>
        </div>
      </section>

      <section className="sticky top-2 z-20 rounded-3xl border bg-white p-4 shadow-sm">`,
  },
])

console.log('Operations review centers organized for reconciliation and trips pages')
