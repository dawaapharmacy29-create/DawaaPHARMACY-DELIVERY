import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { todayIso } from '../../lib/helpers'
import { enqueueOfflineMutation } from '../../lib/offlineQueue'
import type { Branch, InternalTrip, Rider } from '../../lib/types'

type Props = {
  open: boolean
  rider: Rider
  branch?: Branch | null
  shiftOpen?: boolean
  attendanceId?: string | null
  onClose: () => void
  onSaved: (trip?: InternalTrip) => void | Promise<void>
}

type TripType =
  | 'branch_to_branch'
  | 'warehouse'
  | 'supplies'
  | 'pharmacy'
  | 'shipment_pickup'
  | 'accessories'
  | 'other'

const TRIP_TYPES: Array<{ value: TripType; label: string; hint: string }> = [
  { value: 'branch_to_branch', label: 'بين الفروع', hint: 'من فرع إلى فرع' },
  { value: 'warehouse', label: 'مخزن', hint: 'استلام/تسليم من مخزن' },
  { value: 'supplies', label: 'مستلزمات', hint: 'مستلزمات الفرع' },
  { value: 'pharmacy', label: 'صيدلية خارجية', hint: 'شراء/تبديل من صيدلية' },
  { value: 'shipment_pickup', label: 'استلام شحن', hint: 'شركة شحن أو مندوب' },
  { value: 'accessories', label: 'إكسسوار', hint: 'مخازن إكسسوار' },
  { value: 'other', label: 'أخرى', hint: 'مأمورية خاصة' },
]

const BRANCHES = ['فرع الشامي', 'فرع شكري', 'فرع بسيسة', 'فرع زكريا', 'فرع المنشية']
const WAREHOUSES = ['مخزن المعداوي', 'مخزن سونيستا', 'مخزن الحياة', 'مخزن المحلة', 'المخزن الرئيسي', 'المكتب']
const ACCESSORIES = ['كيان إكسسوار', 'المدينة المنورة إكسسوار', 'أورجينال إكسسوار', 'سوفيكو']
const SUPPLIES = ['مستلزمات الفرع', 'مخزن المستلزمات', 'مورد مستلزمات']

function normalizeBranchLabel(value?: string | null) {
  const v = String(value || '').trim()
  if (!v) return ''
  return v.startsWith('فرع ') ? v : `فرع ${v}`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-slate-500">{label}</span>
      {children}
    </label>
  )
}

export default function RiderTripForm({ open, rider, branch, shiftOpen, attendanceId, onClose, onSaved }: Props) {
  const currentBranch = normalizeBranchLabel(branch?.name ?? rider.branch_name)
  const [tripType, setTripType] = useState<TripType>('branch_to_branch')
  const [fromLabel, setFromLabel] = useState(currentBranch || 'فرع الشامي')
  const [toLabel, setToLabel] = useState('فرع شكري')
  const [customToLabel, setCustomToLabel] = useState('')
  const [reason, setReason] = useState('')
  const [relatedInvoice, setRelatedInvoice] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [proofNote, setProofNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const branchLabel = currentBranch || 'فرع الشامي'
    setFromLabel(branchLabel)
    if (tripType === 'branch_to_branch') setToLabel(BRANCHES.find((b) => b !== branchLabel) || 'فرع شكري')
  }, [open, currentBranch, tripType])

  if (!open) return null

  function applyType(next: TripType) {
    setTripType(next)
    const branchLabel = currentBranch || 'فرع الشامي'
    setFromLabel(branchLabel)
    setCustomToLabel('')
    if (next === 'branch_to_branch') setToLabel(BRANCHES.find((b) => b !== branchLabel) || 'فرع شكري')
    else if (next === 'warehouse') setToLabel(WAREHOUSES[0])
    else if (next === 'supplies') setToLabel(SUPPLIES[0])
    else if (next === 'accessories') setToLabel(ACCESSORIES[0])
    else if (next === 'shipment_pickup') {
      setFromLabel('شركة الشحن / مكان الاستلام')
      setToLabel(branchLabel)
    } else setToLabel('')
  }

  function reset() {
    setTripType('branch_to_branch')
    setFromLabel(currentBranch || 'فرع الشامي')
    setToLabel(BRANCHES.find((b) => b !== currentBranch) || 'فرع شكري')
    setCustomToLabel('')
    setReason('')
    setRelatedInvoice('')
    setRequestedBy('')
    setProofNote('')
  }

  async function saveTrip() {
    const finalFrom = fromLabel.trim()
    const finalTo = toLabel === 'custom' ? customToLabel.trim() : toLabel.trim()
    if (!finalFrom || !finalTo) {
      toast.error('اكتب من وإلى للمشوار')
      return
    }
    if (tripType === 'branch_to_branch' && finalFrom === finalTo) {
      toast.error('اختار فرعين مختلفين')
      return
    }

    try {
      setSaving(true)
      const tripRate = rider.trip_rate ?? 10
      const payload = {
        rider_id: rider.id,
        rider_name: rider.name,
        branch_id: rider.branch_id,
        branch_name: branch?.name ?? rider.branch_name ?? null,
        trip_date: todayIso(),
        work_date: todayIso(),
        attendance_id: attendanceId || null,
        trip_type: tripType,
        from_label: finalFrom,
        to_label: finalTo,
        reason: reason.trim() || 'مشوار بدون سبب تفصيلي',
        related_invoice_number: relatedInvoice.trim() || null,
        has_invoice_reference: Boolean(relatedInvoice.trim()),
        requested_by_name: requestedBy.trim() || null,
        evidence_type: relatedInvoice.trim() ? 'invoice' : 'none',
        evidence_note: proofNote.trim() || null,
        evidence_status: relatedInvoice.trim() ? 'pending_admin_review' : 'not_required',
        proof_required: false,
        needs_review: !shiftOpen,
        review_reason: !shiftOpen ? 'missing_shift' : null,
        review_status: relatedInvoice.trim() ? 'pending_evidence_review' : !shiftOpen ? 'missing_shift' : 'pending',
        notes: `نوع المشوار: ${TRIP_TYPES.find((t) => t.value === tripType)?.label || tripType}${requestedBy.trim() ? ` | طالب المشوار: ${requestedBy.trim()}` : ''}${reason.trim() ? ` | السبب: ${reason.trim()}` : ''}${relatedInvoice.trim() ? ` | فاتورة/إذن: ${relatedInvoice.trim()}` : ''}${proofNote.trim() ? ` | ملاحظة: ${proofNote.trim()}` : ''}`,
        status: 'pending_approval',
        registered_at: new Date().toISOString(),
        trip_rate: tripRate,
        trip_multiplier: 1,
        trip_earning: tripRate,
      }

      if (!navigator.onLine) {
        const offline = enqueueOfflineMutation({
          table: 'internal_trips',
          action: 'insert',
          payload: { ...payload, offline_created_at: new Date().toISOString(), offline_sync_status: 'pending' },
          label: `مشوار ${finalFrom} إلى ${finalTo}`,
        })
        toast.success('تم حفظ المشوار مؤقتًا وسيتم رفعه عند رجوع الإنترنت')
        await onSaved({ ...(payload as any), id: offline.id, offline_sync_status: 'pending' } as InternalTrip)
        reset()
        onClose()
        return
      }

      const { data, error } = await supabase.from('internal_trips').insert(payload).select('*').single()
      if (error) throw error
      toast.success('تم تسجيل المشوار وهو بانتظار الاعتماد')
      await onSaved(data as InternalTrip)
      reset()
      onClose()
    } catch (error: any) {
      toast.error(`تعذر تسجيل المشوار: ${error?.message || ''}`)
    } finally {
      setSaving(false)
    }
  }

  const destinationOptions = tripType === 'branch_to_branch' ? BRANCHES : tripType === 'warehouse' ? WAREHOUSES : tripType === 'supplies' ? SUPPLIES : tripType === 'accessories' ? ACCESSORIES : []

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm" dir="rtl">
      <div className="mx-auto flex h-full max-w-[620px] items-end sm:items-center">
        <section className="max-h-[92vh] w-full overflow-y-auto rounded-[32px] bg-white p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#008E92]">Rider V2</p>
              <h2 className="text-xl font-black text-[#061827]">تسجيل مشوار</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">المشوار يدخل مباشرة في تقرير المندوب وينتظر اعتماد الإدارة.</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TRIP_TYPES.map((item) => (
              <button key={item.value} type="button" onClick={() => applyType(item.value)} className={`rounded-2xl border p-3 text-right transition ${tripType === item.value ? 'border-[#008E92] bg-[#EAF8F8] text-[#006A70]' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                <p className="text-sm font-black">{item.label}</p>
                <p className="mt-1 text-[10px] font-bold opacity-70">{item.hint}</p>
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <Field label="من *">
              <input value={fromLabel} onChange={(e) => setFromLabel(e.target.value)} className="dawaa-input text-right" placeholder="جهة الخروج" />
            </Field>

            {destinationOptions.length > 0 ? (
              <Field label="إلى *">
                <select value={toLabel} onChange={(e) => setToLabel(e.target.value)} className="dawaa-input text-right">
                  {destinationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  <option value="custom">جهة أخرى</option>
                </select>
              </Field>
            ) : (
              <Field label="إلى *">
                <input value={toLabel} onChange={(e) => setToLabel(e.target.value)} className="dawaa-input text-right" placeholder="جهة الوصول" />
              </Field>
            )}

            {toLabel === 'custom' ? (
              <Field label="اكتب الجهة الأخرى">
                <input value={customToLabel} onChange={(e) => setCustomToLabel(e.target.value)} className="dawaa-input text-right" placeholder="اسم الجهة" />
              </Field>
            ) : null}

            <Field label="سبب المشوار">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="dawaa-input resize-none text-right" placeholder="مثال: تحويل ناقص، إرجاع، مستلزمات، استلام شحن..." />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="رقم فاتورة/إذن لو موجود">
                <input value={relatedInvoice} onChange={(e) => setRelatedInvoice(e.target.value)} className="dawaa-input text-right" placeholder="اختياري" />
              </Field>
              <Field label="طالب المشوار">
                <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className="dawaa-input text-right" placeholder="اسم الدكتور/المدير" />
              </Field>
            </div>

            <Field label="ملاحظة إثبات">
              <input value={proofNote} onChange={(e) => setProofNote(e.target.value)} className="dawaa-input text-right" placeholder="اختياري" />
            </Field>

            {!shiftOpen ? <p className="rounded-2xl bg-amber-50 p-3 text-xs font-black text-amber-700">تنبيه: الشيفت غير مفتوح، المشوار سيتسجل لكن يحتاج مراجعة.</p> : null}

            <button type="button" disabled={saving} onClick={() => void saveTrip()} className="w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white disabled:opacity-60">
              {saving ? 'جاري حفظ المشوار...' : 'حفظ المشوار ✅'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
