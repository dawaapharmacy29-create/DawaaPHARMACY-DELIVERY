import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/TripsEnhanced.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) {
    console.warn(`Trip rejection reasons patch skipped: ${label}`)
    return
  }
  source = source.replace(before, after)
}

replaceOnce(
  "const statusText: Record<string,string> = { pending_approval:'مستني اعتماد', approved:'معتمد', rejected:'مرفوض', completed:'تم', cancelled:'ملغي' }",
  "const statusText: Record<string,string> = { pending_approval:'مستني اعتماد', approved:'معتمد', rejected:'مرفوض', completed:'تم', cancelled:'ملغي' }\nconst rejectionReasons = [\n  { value: 'duplicate_trip', label: 'مشوار مكرر', needsNote: false },\n  { value: 'invalid_trip', label: 'مشوار غير صحيح', needsNote: false },\n  { value: 'missing_detailed_reason', label: 'لا يوجد سبب تفصيلي للمشوار', needsNote: false },\n  { value: 'unclear_or_missing_proof', label: 'الصورة أو الإثبات غير واضح / ناقص', needsNote: false },\n  { value: 'data_mismatch', label: 'بيانات المشوار غير مطابقة', needsNote: true },\n  { value: 'other', label: 'سبب آخر', needsNote: true },\n] as const",
  'reason options',
)

replaceOnce(
  "  const [rejectReason,setRejectReason] = useState('')",
  "  const [rejectReason,setRejectReason] = useState('')\n  const [rejectCategory,setRejectCategory] = useState('')",
  'reason category state',
)

replaceOnce(
  "<button onClick={()=>{setRejectTrip(t);setRejectReason('')}} disabled={busy.has(t.id)} className=\"flex-1 rounded-xl bg-rose-500 py-2 text-xs font-bold text-white\">رفض</button>",
  "<button onClick={()=>{setRejectTrip(t);setRejectReason('');setRejectCategory('')}} disabled={busy.has(t.id)} className=\"flex-1 rounded-xl bg-rose-500 py-2 text-xs font-bold text-white\">رفض</button>",
  'reset category on open',
)

const oldModal = "    {rejectTrip&&<div className=\"fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4\"><div className=\"w-full max-w-md rounded-3xl bg-white p-6\"><h2 className=\"text-xl font-black\">رفض المشوار</h2><textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} className=\"mt-4 w-full rounded-2xl border p-3\" placeholder=\"اكتب سبب الرفض...\"/><div className=\"mt-4 flex gap-3\"><button onClick={()=>{if(!rejectReason.trim())return toast.error('اكتب سبب الرفض');void changeStatus(rejectTrip,'rejected',rejectReason.trim());setRejectTrip(null)}} className=\"flex-1 rounded-2xl bg-rose-500 py-3 font-black text-white\">تأكيد</button><button onClick={()=>setRejectTrip(null)} className=\"rounded-2xl border px-5\">إلغاء</button></div></div></div>}"

const newModal = "    {rejectTrip&&<div className=\"fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4\"><div className=\"w-full max-w-lg rounded-3xl bg-white p-6\"><h2 className=\"text-xl font-black\">رفض المشوار</h2><p className=\"mt-1 text-sm font-bold text-slate-500\">اختر سبب الرفض الأساسي، ثم أضف ملاحظة عند الحاجة.</p><div className=\"mt-4 grid gap-2 sm:grid-cols-2\">{rejectionReasons.map(item=><button key={item.value} type=\"button\" onClick={()=>setRejectCategory(item.value)} className={`rounded-2xl border px-3 py-3 text-right text-sm font-black transition ${rejectCategory===item.value?'border-rose-500 bg-rose-50 text-rose-700':'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{item.label}{item.needsNote&&<span className=\"mr-1 text-xs text-rose-500\">(التفاصيل مطلوبة)</span>}</button>)}</div><textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} className=\"mt-4 w-full rounded-2xl border p-3\" placeholder=\"ملاحظة إضافية عن سبب الرفض...\"/><div className=\"mt-4 flex gap-3\"><button onClick={()=>{const selectedReason=rejectionReasons.find(item=>item.value===rejectCategory);if(!selectedReason)return toast.error('اختر سبب الرفض');if(selectedReason.needsNote&&rejectReason.trim().length<5)return toast.error('اكتب تفاصيل واضحة لسبب الرفض');const finalReason=selectedReason.label+(rejectReason.trim()?' — '+rejectReason.trim():'');void changeStatus(rejectTrip,'rejected',finalReason);setRejectTrip(null);setRejectCategory('');setRejectReason('')}} className=\"flex-1 rounded-2xl bg-rose-500 py-3 font-black text-white\">تأكيد الرفض</button><button onClick={()=>{setRejectTrip(null);setRejectCategory('');setRejectReason('')}} className=\"rounded-2xl border px-5\">إلغاء</button></div></div></div>}"

replaceOnce(oldModal, newModal, 'rejection modal')

await writeFile(file, source, 'utf8')
console.log('Trip rejection now uses structured reasons and conditional required notes')
