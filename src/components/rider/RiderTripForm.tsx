import { useEffect, useRef, useState } from 'react'
import { Camera, ChevronDown, ChevronUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { todayIso } from '../../lib/helpers'
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

type TripType = 'branch_to_branch' | 'warehouse' | 'supplies' | 'pharmacy' | 'shipment_pickup' | 'accessories' | 'other'
type ProofUpload = { path: string; url: string; sha256: string | null; capturedAt: string }

const TRIP_TYPES: Array<{ value: TripType; label: string }> = [
  { value: 'branch_to_branch', label: 'بين الفروع' },
  { value: 'warehouse', label: 'مخزن' },
  { value: 'supplies', label: 'مستلزمات' },
  { value: 'pharmacy', label: 'صيدلية خارجية' },
  { value: 'shipment_pickup', label: 'استلام شحن' },
  { value: 'accessories', label: 'إكسسوار' },
  { value: 'other', label: 'أخرى' },
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

function getStoredRiderToken(): string | null {
  try {
    const raw = localStorage.getItem('dawaa_rider_session')
    if (raw) return JSON.parse(raw)?.session_token || null
  } catch {}
  return localStorage.getItem('rider_session_token')
}

function getRpcResult<T = any>(data: any): T | null {
  return (Array.isArray(data) ? data[0] : data) as T | null
}

function createRequestId() {
  try { return crypto.randomUUID() }
  catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }
}

async function sha256(file: File): Promise<string | null> {
  try {
    if (!crypto?.subtle) return null
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}

export default function RiderTripForm({ open, rider, branch, shiftOpen, attendanceId, onClose, onSaved }: Props) {
  const currentBranch = normalizeBranchLabel(branch?.name ?? rider.branch_name)
  const [tripType, setTripType] = useState<TripType>('branch_to_branch')
  const [toLabel, setToLabel] = useState('')
  const [customToLabel, setCustomToLabel] = useState('')
  const [reason, setReason] = useState('')
  const [relatedInvoice, setRelatedInvoice] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofUpload, setProofUpload] = useState<ProofUpload | null>(null)
  const [proofUploading, setProofUploading] = useState(false)
  const [proofError, setProofError] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const isSubmittingRef = useRef(false)
  const requestIdRef = useRef(createRequestId())
  const uploadPromiseRef = useRef<Promise<ProofUpload | null> | null>(null)

  const destinationOptions = tripType === 'branch_to_branch'
    ? BRANCHES.filter((item) => item !== currentBranch)
    : tripType === 'warehouse'
      ? WAREHOUSES
      : tripType === 'supplies'
        ? SUPPLIES
        : tripType === 'accessories'
          ? ACCESSORIES
          : []

  function defaultDestination(type: TripType) {
    if (type === 'branch_to_branch') return BRANCHES.find((b) => b !== currentBranch) || 'فرع شكري'
    if (type === 'warehouse') return WAREHOUSES[0]
    if (type === 'supplies') return SUPPLIES[0]
    if (type === 'accessories') return ACCESSORIES[0]
    if (type === 'shipment_pickup') return currentBranch || 'فرع الشامي'
    return ''
  }

  useEffect(() => {
    if (!open) return
    setToLabel(defaultDestination(tripType))
  }, [open, currentBranch])

  if (!open) return null

  function applyType(next: TripType) {
    setTripType(next)
    setToLabel(defaultDestination(next))
    setCustomToLabel('')
  }

  function reset() {
    setTripType('branch_to_branch')
    setToLabel(defaultDestination('branch_to_branch'))
    setCustomToLabel('')
    setReason('')
    setRelatedInvoice('')
    setRequestedBy('')
    setProofFile(null)
    setProofUpload(null)
    setProofUploading(false)
    setProofError('')
    setShowMore(false)
    requestIdRef.current = createRequestId()
    uploadPromiseRef.current = null
  }

  async function uploadProof(file: File, requestId: string): Promise<ProofUpload | null> {
    if (!navigator.onLine) return null
    setProofUploading(true)
    setProofError('')
    try {
      const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg'
      const capturedAt = new Date().toISOString()
      const path = `trips/${rider.id}/${todayIso()}/${requestId}.${ext}`
      const [digest, uploadResult] = await Promise.all([
        sha256(file),
        supabase.storage.from('delivery-receipts').upload(path, file, { cacheControl: '3600', upsert: true }),
      ])
      if (uploadResult.error) throw uploadResult.error
      const { data } = supabase.storage.from('delivery-receipts').getPublicUrl(path)
      const result = { path, url: data.publicUrl, sha256: digest, capturedAt }
      setProofUpload(result)
      return result
    } catch (error: any) {
      setProofError(error?.message || 'تعذر رفع صورة الإثبات')
      return null
    } finally {
      setProofUploading(false)
    }
  }

  function handleProofFile(file: File | null) {
    setProofFile(file)
    setProofUpload(null)
    setProofError('')
    if (!file) {
      uploadPromiseRef.current = null
      return
    }
    uploadPromiseRef.current = uploadProof(file, requestIdRef.current)
  }

  async function attachProofAfterSave(tripId: string, token: string, upload: ProofUpload | null) {
    if (!upload) return
    const { data, error } = await supabase.rpc('rider_attach_trip_proof', {
      p_token: token,
      p_trip_id: tripId,
      p_image_path: upload.path,
      p_image_url: upload.url,
      p_proof_sha256: upload.sha256,
      p_captured_at: upload.capturedAt,
    })
    const result = getRpcResult<any>(data)
    if (error || !result?.success) toast.warning(error?.message || result?.message || 'تم حفظ المشوار لكن صورة الإثبات تحتاج إعادة ربط')
  }

  async function saveTrip() {
    if (isSubmittingRef.current) return
    const finalFrom = tripType === 'shipment_pickup' ? 'شركة الشحن / مكان الاستلام' : (currentBranch || 'فرع الشامي')
    const finalTo = toLabel === 'custom' ? customToLabel.trim() : toLabel.trim()

    if (!finalTo) return toast.error('اختار جهة المشوار')
    if (tripType === 'branch_to_branch' && finalFrom === finalTo) return toast.error('اختار فرعين مختلفين')
    if (!proofFile) return toast.error('صورة إثبات المشوار مطلوبة')
    if (!navigator.onLine) return toast.error('التسجيل السريع للمشوار يحتاج إنترنت لرفع صورة الإثبات بدقة')

    const token = getStoredRiderToken()
    if (!token) return toast.error('انتهت الجلسة. سجل دخول مرة أخرى')

    try {
      isSubmittingRef.current = true
      setSaving(true)
      const requestId = requestIdRef.current
      const alreadyUploaded = proofUpload
      const pendingUploadPromise = uploadPromiseRef.current
      const tripRate = rider.trip_rate ?? 10
      const payload = {
        client_request_id: requestId,
        rider_id: rider.id,
        branch_name: branch?.name ?? rider.branch_name ?? null,
        trip_date: todayIso(),
        work_date: todayIso(),
        attendance_id: attendanceId || null,
        trip_type: tripType,
        from_label: finalFrom,
        to_label: finalTo,
        reason: reason.trim() || TRIP_TYPES.find((t) => t.value === tripType)?.label || 'مشوار',
        requested_by_name: requestedBy.trim() || null,
        related_invoice_number: relatedInvoice.trim() || null,
        has_invoice_reference: Boolean(relatedInvoice.trim()),
        proof_required: true,
        evidence_type: alreadyUploaded ? (relatedInvoice.trim() ? 'invoice_photo' : 'trip_photo') : 'trip_photo_pending_upload',
        evidence_status: alreadyUploaded ? 'pending_admin_review' : 'pending_upload',
        proof_image_path: alreadyUploaded?.path || null,
        proof_image_url: alreadyUploaded?.url || null,
        proof_captured_at: alreadyUploaded?.capturedAt || new Date().toISOString(),
        proof_uploaded_at: alreadyUploaded ? new Date().toISOString() : null,
        proof_source: alreadyUploaded ? 'camera' : 'local_pending',
        proof_sha256: alreadyUploaded?.sha256 || null,
        proof_review_status: alreadyUploaded ? 'pending' : 'pending_upload',
        proof_exception_status: 'none',
        upload_status: alreadyUploaded ? 'uploaded' : 'pending',
        storage_path: alreadyUploaded?.path || null,
        needs_review: !shiftOpen || !alreadyUploaded,
        review_reason: !shiftOpen ? 'missing_shift' : !alreadyUploaded ? 'trip_proof_pending_upload' : null,
        review_status: !shiftOpen ? 'missing_shift' : alreadyUploaded ? 'pending_evidence_review' : 'pending_upload',
        is_countable: Boolean(alreadyUploaded),
        notes: [
          `نوع المشوار: ${TRIP_TYPES.find((t) => t.value === tripType)?.label || tripType}`,
          requestedBy.trim() ? `طالب المشوار: ${requestedBy.trim()}` : '',
          reason.trim() ? `السبب: ${reason.trim()}` : '',
          relatedInvoice.trim() ? `فاتورة/إذن: ${relatedInvoice.trim()}` : '',
        ].filter(Boolean).join(' | '),
        trip_rate: tripRate,
        trip_multiplier: 1,
        trip_earning: tripRate,
      }

      const { data, error } = await supabase.rpc('rider_create_trip_fast', { p_token: token, p_payload: payload })
      const result = getRpcResult<any>(data)
      if (error || !result?.success || !result?.trip?.id) throw new Error(error?.message || result?.message || 'تعذر تسجيل المشوار')

      const trip = result.trip as InternalTrip
      toast.success('تم تسجيل المشوار بنجاح')
      onClose()
      reset()
      void Promise.resolve(onSaved(trip)).catch(() => {})

      if (!alreadyUploaded && pendingUploadPromise) {
        void pendingUploadPromise.then((upload) => attachProofAfterSave(String(trip.id), token, upload)).catch(() => {})
      } else if (alreadyUploaded) {
        void attachProofAfterSave(String(trip.id), token, alreadyUploaded).catch(() => {})
      }
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تسجيل المشوار')
    } finally {
      setSaving(false)
      isSubmittingRef.current = false
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm" dir="rtl">
      <div className="mx-auto flex h-full max-w-[620px] items-end sm:items-center">
        <section className="max-h-[92vh] w-full overflow-y-auto rounded-[32px] bg-white p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#008E92]">تسجيل سريع</p>
              <h2 className="text-xl font-black text-[#061827]">مشوار جديد</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">اختار النوع والجهة وصوّر الإثبات ثم احفظ.</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-500"><X size={20} /></button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TRIP_TYPES.map((item) => (
              <button key={item.value} type="button" onClick={() => applyType(item.value)} className={`rounded-2xl border px-3 py-3 text-center text-sm font-black transition ${tripType === item.value ? 'border-[#008E92] bg-[#EAF8F8] text-[#006A70]' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>{item.label}</button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-slate-50 p-3 text-sm font-black text-slate-700">من: {tripType === 'shipment_pickup' ? 'شركة الشحن / مكان الاستلام' : (currentBranch || 'فرع الشامي')}</div>

            {destinationOptions.length ? (
              <div>
                <p className="mb-2 text-xs font-black text-slate-500">إلى *</p>
                <div className="flex flex-wrap gap-2">
                  {destinationOptions.map((item) => (
                    <button key={item} type="button" onClick={() => setToLabel(item)} className={`rounded-2xl px-3 py-2 text-sm font-black ${toLabel === item ? 'bg-[#008E92] text-white' : 'bg-slate-100 text-slate-700'}`}>{item}</button>
                  ))}
                  <button type="button" onClick={() => setToLabel('custom')} className={`rounded-2xl px-3 py-2 text-sm font-black ${toLabel === 'custom' ? 'bg-[#008E92] text-white' : 'bg-slate-100 text-slate-700'}`}>جهة أخرى</button>
                </div>
              </div>
            ) : (
              <input value={toLabel} onChange={(e) => setToLabel(e.target.value)} className="dawaa-input text-right" placeholder="اكتب جهة الوصول" autoFocus />
            )}

            {toLabel === 'custom' ? <input value={customToLabel} onChange={(e) => setCustomToLabel(e.target.value)} className="dawaa-input text-right" placeholder="اكتب الجهة الأخرى" autoFocus /> : null}

            <label className="block rounded-2xl border-2 border-dashed border-[#008E92]/30 bg-[#F3FBFB] p-4 text-center">
              <Camera className="mx-auto mb-2 text-[#008E92]" size={26} />
              <p className="text-sm font-black text-[#006A70]">{proofFile ? 'تم اختيار صورة الإثبات ✅' : 'صوّر إثبات المشوار *'}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">الرفع يبدأ فور اختيار الصورة لتوفير وقت الحفظ.</p>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleProofFile(e.target.files?.[0] || null)} />
            </label>

            {proofUploading ? <p className="text-center text-xs font-black text-[#008E92]">جاري رفع الإثبات في الخلفية…</p> : null}
            {proofError ? <p className="rounded-2xl bg-rose-50 p-3 text-center text-xs font-black text-rose-700">تعذر رفع الصورة. اختر الصورة مرة أخرى قبل الحفظ.</p> : null}

            <button type="button" onClick={() => setShowMore((v) => !v)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-600">تفاصيل إضافية اختيارية {showMore ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>

            {showMore ? (
              <div className="space-y-3 rounded-2xl border border-slate-100 p-3">
                <input value={relatedInvoice} onChange={(e) => setRelatedInvoice(e.target.value)} className="dawaa-input text-right" placeholder="رقم فاتورة / إذن - اختياري" inputMode="numeric" />
                <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className="dawaa-input text-right" placeholder="طالب المشوار - اختياري" />
                <input value={reason} onChange={(e) => setReason(e.target.value)} className="dawaa-input text-right" placeholder="سبب أو ملاحظة - اختياري" />
              </div>
            ) : null}

            {!shiftOpen ? <p className="rounded-2xl bg-amber-50 p-3 text-xs font-black text-amber-700">الشيفت غير ظاهر؛ المشوار سيتسجل للمراجعة بدون تعطيلك.</p> : null}

            <button type="button" onClick={() => void saveTrip()} disabled={saving || Boolean(proofError)} className="w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white disabled:opacity-60">{saving ? 'جاري التسجيل…' : 'حفظ المشوار فورًا ✅'}</button>
          </div>
        </section>
      </div>
    </div>
  )
}
