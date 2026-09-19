import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { readRiderDeviceSnapshot } from '../../lib/riderDeviceSnapshot'
import { DUPLICATE_REASON_LABELS } from '../../lib/helpers'
import type { Rider } from '../../lib/types'

type Props = {
  open: boolean
  rider: Rider
  branchName?: string | null
  onClose: () => void
  onSaved: (orderId?: string | null) => void | Promise<void>
}

type RiderGpsFix = { lat: number | null; lng: number | null; accuracy: number | null }
type RuntimeContext = [RiderGpsFix, Awaited<ReturnType<typeof readRiderDeviceSnapshot>>]
type CustomerHit = {
  id: string
  customer_code: string
  customer_name: string
  phone?: string | null
  address?: string | null
  area?: string | null
  customer_status?: string | null
  importance_level?: string | null
}

const RUNTIME_CONTEXT_MAX_AGE_MS = 60_000

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

function requestRiderGps(): Promise<RiderGpsFix> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ lat: null, lng: null, accuracy: null })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
      }),
      () => resolve({ lat: null, lng: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-slate-500">{label}</span>
      {children}
    </label>
  )
}

export default function RiderQuickOrderForm({ open, rider, branchName, onClose, onSaved }: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerHit[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHit | null>(null)
  const [manualCustomerName, setManualCustomerName] = useState('')
  const [customerSearching, setCustomerSearching] = useState(false)
  const [customerSearchDone, setCustomerSearchDone] = useState(false)
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [multiplier, setMultiplier] = useState<1 | 1.5>(1)
  const [notes, setNotes] = useState('')
  const [duplicateRequired, setDuplicateRequired] = useState(false)
  const [duplicateReason, setDuplicateReason] = useState('')
  const [duplicateNote, setDuplicateNote] = useState('')
  const [duplicateDoctorName, setDuplicateDoctorName] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastError, setLastError] = useState('')
  const isSubmittingRef = useRef(false)
  const runtimeContextRef = useRef<Promise<RuntimeContext> | null>(null)
  const runtimeContextStartedAtRef = useRef(0)

  const customerCode = selectedCustomer?.customer_code || customerQuery.trim()
  const customerName = selectedCustomer?.customer_name || manualCustomerName.trim()
  const customerPhone = selectedCustomer?.phone || ''
  const customerAddress = useMemo(() => {
    if (!selectedCustomer) return ''
    return [selectedCustomer.address, selectedCustomer.area].filter(Boolean).join(' - ')
  }, [selectedCustomer])
  const manualMode = !selectedCustomer && customerSearchDone && customerQuery.trim().length > 0 && customerResults.length === 0
  const duplicateDetailsValid = !duplicateRequired || Boolean(duplicateReason && (duplicateNote.trim() || notes.trim()).length >= 5)
  const canSave = Boolean(invoiceNumber.trim() && customerCode && (selectedCustomer || manualCustomerName.trim()) && duplicateDetailsValid)

  function startRuntimeContext() {
    runtimeContextStartedAtRef.current = Date.now()
    const promise = Promise.all([requestRiderGps(), readRiderDeviceSnapshot()]) as Promise<RuntimeContext>
    runtimeContextRef.current = promise
    return promise
  }

  useEffect(() => {
    if (!open) {
      runtimeContextRef.current = null
      runtimeContextStartedAtRef.current = 0
      return
    }
    startRuntimeContext()
  }, [open])

  useEffect(() => {
    if (!open || selectedCustomer || customerQuery.trim().length < 1) {
      if (!selectedCustomer) setCustomerResults([])
      setCustomerSearchDone(false)
      return
    }

    const timer = window.setTimeout(async () => {
      const token = getStoredRiderToken()
      if (!token) return
      setCustomerSearching(true)
      setCustomerSearchDone(false)
      try {
        const { data, error } = await supabase.rpc('rider_search_customers_by_code', {
          p_token: token,
          p_query: customerQuery.trim(),
          p_limit: 8,
        })
        const result = getRpcResult<any>(data)
        if (error || !result?.success) throw new Error(error?.message || result?.message || 'تعذر البحث عن العميل')
        setCustomerResults(Array.isArray(result.customers) ? result.customers : [])
        setLastError('')
      } catch (error: any) {
        setCustomerResults([])
        setLastError(error?.message || 'تعذر البحث عن العميل')
      } finally {
        setCustomerSearching(false)
        setCustomerSearchDone(true)
      }
    }, 220)

    return () => window.clearTimeout(timer)
  }, [customerQuery, open, selectedCustomer])

  if (!open) return null

  function selectCustomer(customer: CustomerHit) {
    setSelectedCustomer(customer)
    setCustomerQuery(customer.customer_code)
    setManualCustomerName('')
    setCustomerResults([])
    setCustomerSearchDone(false)
    setLastError('')
  }

  function changeCustomerQuery(value: string) {
    setCustomerQuery(value)
    setCustomerSearchDone(false)
    setManualCustomerName('')
    if (selectedCustomer && value.trim() !== selectedCustomer.customer_code) setSelectedCustomer(null)
  }

  function reset() {
    setInvoiceNumber('')
    setCustomerQuery('')
    setCustomerResults([])
    setSelectedCustomer(null)
    setManualCustomerName('')
    setCustomerSearchDone(false)
    setInvoiceAmount('')
    setMultiplier(1)
    setNotes('')
    setDuplicateRequired(false)
    setDuplicateReason('')
    setDuplicateNote('')
    setDuplicateDoctorName('')
    setLastError('')
  }

  async function saveOrder() {
    if (isSubmittingRef.current) return
    const invoice = invoiceNumber.trim()
    const code = customerCode.trim()
    const name = customerName.trim()

    if (!invoice) {
      toast.error('رقم الفاتورة مطلوب')
      return
    }
    if (!code) {
      toast.error('كود العميل مطلوب')
      return
    }
    if (!selectedCustomer && !name) {
      toast.error('العميل غير موجود في التطبيق. اكتب اسم العميل من BConnect')
      return
    }
    if (duplicateRequired && !duplicateReason) {
      toast.error('اختار سبب التكرار')
      return
    }
    const effectiveDuplicateNote = (duplicateNote.trim() || notes.trim())
    if (duplicateRequired && effectiveDuplicateNote.length < 5) {
      toast.error('اكتب تفاصيل واضحة للتكرار لا تقل عن 5 حروف')
      return
    }
    if (!navigator.onLine) {
      toast.error('تسجيل الأوردر يحتاج اتصال بالإنترنت للتحقق من العميل والفاتورة ومنع التكرار.')
      return
    }

    try {
      isSubmittingRef.current = true
      setSaving(true)
      setLastError('')
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة. سجل دخول مرة أخرى من تطبيق الدليفري.')

      const contextAge = Date.now() - runtimeContextStartedAtRef.current
      const runtimeContext = runtimeContextRef.current && contextAge <= RUNTIME_CONTEXT_MAX_AGE_MS
        ? runtimeContextRef.current
        : startRuntimeContext()
      const [gps, device] = await runtimeContext
      runtimeContextRef.current = null
      runtimeContextStartedAtRef.current = 0

      const amount = invoiceAmount.trim() ? Number(invoiceAmount) : 0
      const auditNote = [
        notes.trim(),
        selectedCustomer ? 'العميل من قاعدة التطبيق' : 'عميل جديد من BConnect - إدخال يدوي',
        `نوع الأوردر: ×${multiplier}`,
        multiplier === 1.5 ? 'أوردر بعيد - بانتظار اعتماد الإدارة' : 'أوردر عادي',
        `الفرع: ${branchName || rider.branch_name || 'غير محدد'}`,
        `بطارية: ${device.batteryPercent ?? 'غير مدعومة'}%`,
        `Online: ${device.online ? 'yes' : 'no'}`,
        `GPS accuracy: ${gps.accuracy ?? 'unknown'}m`,
      ].filter(Boolean).join('\n')

      const request = duplicateRequired
        ? supabase.rpc('rider_create_order', {
            p_token: token,
            p_customer_id: selectedCustomer?.id || null,
            p_customer_code: code,
            p_customer_name: name,
            p_customer_phone: customerPhone || null,
            p_customer_address: customerAddress || null,
            p_invoice_number: invoice,
            p_invoice_amount: Number.isFinite(amount) ? amount : 0,
            p_order_multiplier: multiplier,
            p_notes: auditNote,
            p_is_duplicate_invoice: true,
            p_duplicate_reason: duplicateReason,
            p_duplicate_note: effectiveDuplicateNote,
            p_preparing_doctor_name: duplicateDoctorName.trim() || null,
            p_original_order_id: null,
            p_gps_lat: gps.lat,
            p_gps_lng: gps.lng,
            p_gps_accuracy_m: gps.accuracy,
            p_receipt_image_path: null,
            p_receipt_image_url: null,
            p_receipt_ocr_json: null,
          })
        : supabase.rpc('rider_create_order_v3', {
            p_token: token,
            p_customer_id: selectedCustomer?.id || null,
            p_customer_code: code,
            p_customer_name: name,
            p_invoice_number: invoice,
            p_invoice_amount: Number.isFinite(amount) ? amount : 0,
            p_order_multiplier: multiplier,
            p_notes: auditNote,
            p_gps_lat: gps.lat,
            p_gps_lng: gps.lng,
            p_gps_accuracy_m: gps.accuracy,
          })

      const { data, error } = await request
      const result = getRpcResult<any>(data)
      if (error || !result?.success) {
        const code = String(result?.error || error?.code || '')
        const message = String(error?.message || result?.message || result?.error || 'رفض السيرفر تسجيل الأوردر')
        if (!duplicateRequired && (code === 'DUPLICATE_DETAILS_REQUIRED' || /مكرر|duplicate/i.test(message))) {
          setDuplicateRequired(true)
          if (!duplicateNote.trim() && notes.trim()) setDuplicateNote(notes.trim())
          setLastError('الفاتورة مكررة: اختار سبب التكرار، وتأكد من تفاصيل الملاحظة ثم اضغط حفظ مرة أخرى.')
          toast.warning('الفاتورة مكررة — أكمل سبب التكرار والتفاصيل ثم احفظها للمراجعة.')
          return
        }
        throw new Error(message)
      }

      if (result.manual_customer_entry) {
        toast.success(result.message || 'تم تسجيل أوردر العميل الجديد وسيتم مراجعته ومزامنته')
      } else if (multiplier === 1.5) {
        toast.success(result.message || 'تم تسجيل الأوردر ×1.5 وهو بانتظار اعتماد الإدارة')
      } else if (gps.accuracy && gps.accuracy > 100) {
        toast.warning(`تم تسجيل الأوردر لكن دقة GPS ضعيفة (${gps.accuracy} متر)، وقد يحتاج مراجعة.`)
      } else {
        toast.success(result.message || 'تم تسجيل الأوردر بنجاح')
      }

      const savedOrderId = result?.order_id ? String(result.order_id) : null
      reset()
      onClose()
      void Promise.resolve(onSaved(savedOrderId)).catch(() => {})
    } catch (error: any) {
      const message = error?.message || 'تعذر تسجيل الأوردر'
      setLastError(message)
      startRuntimeContext()
      toast.error(message)
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
              <p className="text-xs font-black text-[#008E92]">Rider V3</p>
              <h2 className="text-xl font-black text-[#061827]">تسجيل أوردر</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">ابحث بكود العميل. لو جديد ومش موجود، سجّل الكود والاسم من BConnect.</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-500 disabled:opacity-50">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Field label="كود العميل *">
                <input autoFocus inputMode="numeric" value={customerQuery} onChange={(e) => changeCustomerQuery(e.target.value)} className="dawaa-input text-right" placeholder="اكتب كود العميل للبحث" autoComplete="off" />
              </Field>
              {customerSearching ? <p className="mt-1 text-xs font-bold text-slate-400">جاري البحث...</p> : null}
              {!selectedCustomer && customerResults.length > 0 ? (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {customerResults.map((customer) => (
                    <button key={customer.id} type="button" onClick={() => selectCustomer(customer)} className="block w-full border-b border-slate-100 px-3 py-3 text-right last:border-0 hover:bg-[#F1FAFA]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-black text-[#061827]">{customer.customer_name}</span>
                        <span className="rounded-lg bg-[#EAF8F8] px-2 py-1 text-xs font-black text-[#00767A]">{customer.customer_code}</span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-500">{customer.phone || 'بدون هاتف'}{customer.address ? ` · ${customer.address}` : ''}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {selectedCustomer ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-emerald-700">تم اختيار العميل ✅</p>
                    <p className="mt-1 text-base font-black text-slate-900">{customerName}</p>
                  </div>
                  <span className="rounded-xl bg-white px-3 py-2 text-sm font-black text-emerald-800">كود {customerCode}</span>
                </div>
                <div className="mt-2 space-y-1 text-xs font-bold text-slate-600">
                  <p>📞 {customerPhone || 'لا يوجد رقم مسجل'}</p>
                  <p>📍 {customerAddress || 'لا يوجد عنوان مسجل'}</p>
                </div>
              </div>
            ) : null}

            {manualMode ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-black text-amber-900">العميل غير موجود في التطبيق</p>
                <p className="mt-1 text-xs font-bold text-amber-700">لو ده عميل جديد موجود في BConnect، اكتب اسمه يدويًا. الكود هيتسجل كما كتبته.</p>
                <div className="mt-3">
                  <Field label="اسم العميل من BConnect *">
                    <input value={manualCustomerName} onChange={(e) => setManualCustomerName(e.target.value)} className="dawaa-input text-right" placeholder="اكتب اسم العميل" autoComplete="off" />
                  </Field>
                </div>
                <p className="mt-2 rounded-xl bg-white/70 p-2 text-xs font-black text-amber-800">سيتم تعليم الأوردر كعميل جديد يحتاج مزامنة ومراجعة، بدون إنشاء عميل مكرر تلقائيًا.</p>
              </div>
            ) : null}

            <Field label="رقم الفاتورة *">
              <input inputMode="numeric" value={invoiceNumber} onChange={(e) => { setInvoiceNumber(e.target.value); setDuplicateRequired(false); setDuplicateReason(''); setDuplicateNote(''); setDuplicateDoctorName(''); setLastError('') }} className="dawaa-input text-right" placeholder="اكتب رقم الفاتورة" />
            </Field>

            <div>
              <p className="mb-2 text-xs font-black text-slate-500">نوع الأوردر *</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMultiplier(1)} className={`rounded-2xl border p-4 text-center ${multiplier === 1 ? 'border-[#008E92] bg-[#EAF8F8] text-[#006A70]' : 'border-slate-200 bg-white text-slate-600'}`}>
                  <p className="text-lg font-black">×1</p><p className="mt-1 text-xs font-bold">أوردر عادي</p>
                </button>
                <button type="button" onClick={() => setMultiplier(1.5)} className={`rounded-2xl border p-4 text-center ${multiplier === 1.5 ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                  <p className="text-lg font-black">×1.5</p><p className="mt-1 text-xs font-bold">أوردر بعيد</p>
                </button>
              </div>
              {multiplier === 1.5 ? <p className="mt-2 rounded-xl bg-amber-50 p-2 text-center text-xs font-black text-amber-800">الأوردر هيتسجل ×1.5 ويظل بانتظار اعتماد الإدارة.</p> : null}
            </div>

            <Field label="قيمة الفاتورة">
              <input type="number" inputMode="decimal" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} className="dawaa-input text-right" placeholder="اختياري" />
            </Field>

            <Field label="ملاحظات">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="dawaa-input resize-none text-right" placeholder="ملاحظة اختيارية" />
            </Field>

            {duplicateRequired ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-black text-amber-900">⚠️ الفاتورة مكررة وتحتاج بيانات المراجعة</p>
                <p className="mt-1 text-xs font-bold text-amber-700">الملاحظة المكتوبة في الأوردر يمكن استخدامها كتفاصيل للتكرار، واسم الدكتور اختياري.</p>
                <div className="mt-3 space-y-3">
                  <Field label="سبب التكرار *">
                    <select value={duplicateReason} onChange={(e) => setDuplicateReason(e.target.value)} className="dawaa-input text-right">
                      <option value="">اختار سبب التكرار</option>
                      {Object.entries(DUPLICATE_REASON_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="تفاصيل التكرار *">
                    <textarea value={duplicateNote || notes} onChange={(e) => setDuplicateNote(e.target.value)} rows={3} className="dawaa-input resize-none text-right" placeholder="اكتب تفاصيل واضحة لا تقل عن 5 حروف" />
                  </Field>
                  <Field label="اسم الدكتور اللي حضّر الأوردر (اختياري)">
                    <input value={duplicateDoctorName} onChange={(e) => setDuplicateDoctorName(e.target.value)} className="dawaa-input text-right" placeholder="مثال: د/ أحمد" />
                  </Field>
                </div>
              </div>
            ) : null}

            {lastError ? <p className="rounded-2xl bg-rose-50 p-3 text-center text-xs font-black text-rose-700">{lastError}</p> : null}

            <button type="button" onClick={() => void saveOrder()} disabled={saving || !canSave} className="w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white disabled:opacity-50">
              {saving ? 'جاري الحفظ والتحقق...' : multiplier === 1.5 ? 'تسجيل الأوردر ×1.5 ⏳' : 'حفظ الأوردر ×1 ✅'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
