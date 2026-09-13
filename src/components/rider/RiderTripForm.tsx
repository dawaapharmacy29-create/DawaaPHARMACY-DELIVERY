import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
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

type ProofType = 'invoice' | 'item'

type ProofUpload = {
  path: string
  url: string
  sha256: string | null
}

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

async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || typeof document === 'undefined') return file
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذر قراءة الصورة')) }
      img.src = url
    })
    const maxDimension = 1280
    const ratio = Math.min(maxDimension / image.naturalWidth, maxDimension / image.naturalHeight, 1)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72))
    if (!blob) return file
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'trip-proof'}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

async function sha256OfFile(file: File): Promise<string | null> {
  try {
    if (!crypto?.subtle) return null
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
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
  const [proofType, setProofType] = useState<ProofType>('invoice')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofPreview, setProofPreview] = useState('')
  const [uploadingProof, setUploadingProof] = useState(false)
  const [saving, setSaving] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const isSubmittingRef = useRef(false)

  useEffect(() => {
    if (!open) return
    const branchLabel = currentBranch || 'فرع الشامي'
    setFromLabel(branchLabel)
    if (tripType === 'branch_to_branch') setToLabel(BRANCHES.find((b) => b !== branchLabel) || 'فرع شكري')
  }, [open, currentBranch, tripType])

  useEffect(() => () => {
    if (proofPreview) URL.revokeObjectURL(proofPreview)
  }, [proofPreview])

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

  function clearProof() {
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofFile(null)
    setProofPreview('')
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
    setProofType('invoice')
    clearProof()
  }

  function handleProofFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('اختار صورة فاتورة أو صورة صنف')
      return
    }
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofFile(file)
    setProofPreview(URL.createObjectURL(file))
  }

  async function uploadProof(): Promise<ProofUpload | null> {
    if (!proofFile) return null
    if (!navigator.onLine) throw new Error('رفع الصورة يحتاج اتصال بالإنترنت. يمكنك التسجيل بالتفاصيل بدل الصورة.')
    setUploadingProof(true)
    try {
      const file = await compressImageForUpload(proofFile)
      const sha256 = await sha256OfFile(file)
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const safeType = proofType === 'invoice' ? 'invoice' : 'item'
      const path = `trips/${rider.id}/${todayIso()}/${Date.now()}-${safeType}.${ext}`
      let lastError: any = null
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { error } = await supabase.storage.from('delivery-receipts').upload(path, file, { cacheControl: '3600', upsert: false })
        if (!error) {
          const { data } = supabase.storage.from('delivery-receipts').getPublicUrl(path)
          return { path, url: data.publicUrl, sha256 }
        }
        lastError = error
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 800 * attempt))
      }
      throw lastError || new Error('تعذر رفع الصورة')
    } finally {
      setUploadingProof(false)
    }
  }

  async function saveTrip() {
    if (isSubmittingRef.current) return
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

    const hasPhoto = Boolean(proofFile)
    const hasDetails = reason.trim().length >= 3 || relatedInvoice.trim().length > 0 || proofNote.trim().length >= 3
    if (!hasPhoto && !hasDetails) {
      toast.error('سجّل المشوار بصورة فاتورة/صنف أو اكتب تفاصيل المشوار')
      return
    }

    try {
      isSubmittingRef.current = true
      setSaving(true)
      const proof = hasPhoto ? await uploadProof() : null
      const tripRate = rider.trip_rate ?? 10
      const isPhotoProof = Boolean(proof?.url)
      const evidenceLabel = proofType === 'invoice' ? 'صورة فاتورة' : 'صورة صنف'
      const payload = {
        client_request_id: typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
        reason: reason.trim() || (isPhotoProof ? `إثبات المشوار بـ ${evidenceLabel}` : 'تفاصيل المشوار مرفقة'),
        related_invoice_number: relatedInvoice.trim() || null,
        has_invoice_reference: Boolean(relatedInvoice.trim()),
        requested_by_name: requestedBy.trim() || null,
        evidence_type: isPhotoProof ? `${proofType}_photo` : 'details',
        evidence_note: proofNote.trim() || null,
        evidence_status: isPhotoProof ? 'pending_admin_review' : 'details_pending_review',
        proof_required: isPhotoProof,
        proof_type: isPhotoProof ? proofType : 'details',
        proof_image_path: proof?.path || null,
        proof_image_url: proof?.url || null,
        proof_note: proofNote.trim() || null,
        proof_captured_at: isPhotoProof ? new Date().toISOString() : null,
        proof_uploaded_at: isPhotoProof ? new Date().toISOString() : null,
        proof_source: isPhotoProof ? 'rider_camera_or_gallery' : 'details',
        proof_review_status: isPhotoProof ? 'pending' : 'not_required',
        proof_exception_status: 'none',
        proof_exception_reason: null,
        proof_sha256: proof?.sha256 || null,
        upload_status: isPhotoProof ? 'uploaded' : 'not_required',
        storage_path: proof?.path || null,
        needs_review: !shiftOpen,
        review_reason: !shiftOpen ? 'missing_shift' : null,
        review_status: 'pending',
        notes: `نوع المشوار: ${TRIP_TYPES.find((t) => t.value === tripType)?.label || tripType}${isPhotoProof ? ` | الإثبات: ${evidenceLabel}` : ' | الإثبات: تفاصيل مكتوبة'}${requestedBy.trim() ? ` | طالب المشوار: ${requestedBy.trim()}` : ''}${reason.trim() ? ` | السبب: ${reason.trim()}` : ''}${relatedInvoice.trim() ? ` | فاتورة/إذن: ${relatedInvoice.trim()}` : ''}${proofNote.trim() ? ` | ملاحظة: ${proofNote.trim()}` : ''}`,
        status: 'pending_approval',
        trip_rate: tripRate,
        trip_multiplier: 1,
        trip_earning: tripRate,
        is_countable: true,
      }

      if (!navigator.onLine) {
        if (hasPhoto) throw new Error('الصورة لم تُرفع. ارجع للإنترنت أو احذف الصورة وسجّل المشوار بالتفاصيل.')
        const offline = enqueueOfflineMutation({
          table: 'internal_trips',
          action: 'insert',
          payload: { ...payload, registered_at: new Date().toISOString(), offline_created_at: new Date().toISOString(), offline_sync_status: 'pending' },
          label: `مشوار ${finalFrom} إلى ${finalTo}`,
        })
        const localTrip = { ...(payload as any), id: offline.id, registered_at: new Date().toISOString(), offline_sync_status: 'pending' } as InternalTrip
        toast.success('تم حفظ المشوار بالتفاصيل مؤقتًا وسيتم رفعه عند رجوع الإنترنت')
        reset()
        onClose()
        void Promise.resolve(onSaved(localTrip)).catch(() => {})
        return
      }

      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة. سجل دخول مرة أخرى من تطبيق الدليفري.')
      const { data, error } = await supabase.rpc('rider_create_trip_fast', { p_token: token, p_payload: payload })
      const result = getRpcResult<any>(data)
      if (error || !result?.success || !result?.trip) {
        throw new Error(error?.message || result?.message || result?.error || 'رفض السيرفر تسجيل المشوار')
      }

      const savedTrip = result.trip as InternalTrip
      toast.success(isPhotoProof ? 'تم تسجيل المشوار بالصورة وهو بانتظار الاعتماد' : 'تم تسجيل المشوار بالتفاصيل وهو بانتظار الاعتماد')
      reset()
      onClose()
      void Promise.resolve(onSaved(savedTrip)).catch(() => {})
    } catch (error: any) {
      toast.error(`تعذر تسجيل المشوار: ${error?.message || ''}`)
    } finally {
      setSaving(false)
      isSubmittingRef.current = false
    }
  }

  const destinationOptions = tripType === 'branch_to_branch' ? BRANCHES : tripType === 'warehouse' ? WAREHOUSES : tripType === 'supplies' ? SUPPLIES : tripType === 'accessories' ? ACCESSORIES : []

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm" dir="rtl">
      <div className="mx-auto flex h-full max-w-[620px] items-end sm:items-center">
        <section className="max-h-[92vh] w-full overflow-y-auto rounded-[32px] bg-white p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#008E92]">Rider V3</p>
              <h2 className="text-xl font-black text-[#061827]">تسجيل مشوار</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">سجّل بصورة أو بالتفاصيل. الصورة تغني عن تفاصيل الإثبات.</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-500 disabled:opacity-50"><X size={20} /></button>
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
            <Field label="من *"><input value={fromLabel} onChange={(e) => setFromLabel(e.target.value)} className="dawaa-input text-right" placeholder="جهة الخروج" /></Field>
            {destinationOptions.length > 0 ? (
              <Field label="إلى *"><select value={toLabel} onChange={(e) => setToLabel(e.target.value)} className="dawaa-input text-right">
                {destinationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                <option value="custom">جهة أخرى</option>
              </select></Field>
            ) : (
              <Field label="إلى *"><input value={toLabel} onChange={(e) => setToLabel(e.target.value)} className="dawaa-input text-right" placeholder="جهة الوصول" /></Field>
            )}
            {toLabel === 'custom' ? <Field label="اكتب الجهة الأخرى"><input value={customToLabel} onChange={(e) => setCustomToLabel(e.target.value)} className="dawaa-input text-right" placeholder="اسم الجهة" /></Field> : null}

            <div className="rounded-3xl border border-teal-100 bg-teal-50/60 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-black text-[#006A70]">إثبات المشوار بصورة</p>
                  <p className="text-xs font-bold text-slate-500">صورة الفاتورة أو صورة الصنف تكفي بدل تفاصيل الإثبات.</p>
                </div>
                {proofFile ? <button type="button" onClick={clearProof} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-rose-600">حذف الصورة</button> : null}
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setProofType('invoice')} className={`rounded-2xl border px-3 py-2 text-sm font-black ${proofType === 'invoice' ? 'border-[#008E92] bg-white text-[#006A70]' : 'border-slate-200 text-slate-500'}`}>صورة فاتورة</button>
                <button type="button" onClick={() => setProofType('item')} className={`rounded-2xl border px-3 py-2 text-sm font-black ${proofType === 'item' ? 'border-[#008E92] bg-white text-[#006A70]' : 'border-slate-200 text-slate-500'}`}>صورة صنف</button>
              </div>

              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handleProofFile(e.target.files?.[0] || null); e.target.value = '' }} />
              <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleProofFile(e.target.files?.[0] || null); e.target.value = '' }} />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-2xl bg-[#008E92] px-3 py-3 text-sm font-black text-white"><Camera size={18} /> تصوير الآن</button>
                <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-sm font-black text-[#008E92] shadow-sm"><ImagePlus size={18} /> اختيار صورة</button>
              </div>
              {proofPreview ? <img src={proofPreview} alt="إثبات المشوار" className="mt-3 max-h-52 w-full rounded-2xl object-contain bg-white" /> : null}
              {uploadingProof ? <p className="mt-2 text-xs font-black text-sky-700">جاري ضغط ورفع الصورة...</p> : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-3">
              <p className="font-black text-slate-800">أو سجّل بالتفاصيل</p>
              <p className="mb-3 text-xs font-bold text-slate-500">لو مفيش صورة، اكتب سبب أو وصف واضح للمشوار.</p>
              <Field label="سبب / تفاصيل المشوار"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="dawaa-input resize-none text-right" placeholder="مثال: تحويل ناقص، إرجاع، مستلزمات، استلام شحن..." /></Field>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="رقم فاتورة/إذن لو موجود"><input value={relatedInvoice} onChange={(e) => setRelatedInvoice(e.target.value)} className="dawaa-input text-right" placeholder="اختياري" /></Field>
                <Field label="طالب المشوار"><input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className="dawaa-input text-right" placeholder="اسم الدكتور/المدير" /></Field>
              </div>
              <div className="mt-3"><Field label="ملاحظة إضافية"><input value={proofNote} onChange={(e) => setProofNote(e.target.value)} className="dawaa-input text-right" placeholder="اختياري" /></Field></div>
            </div>

            {!shiftOpen ? <p className="rounded-2xl bg-amber-50 p-3 text-xs font-black text-amber-700">تنبيه: الشيفت غير مفتوح، المشوار سيتسجل لكنه يحتاج مراجعة.</p> : null}
            <button type="button" disabled={saving || uploadingProof} onClick={() => void saveTrip()} className="w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white disabled:opacity-60">
              {saving || uploadingProof ? 'جاري الحفظ والتحقق...' : proofFile ? 'حفظ المشوار بالصورة ✅' : 'حفظ المشوار بالتفاصيل ✅'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
