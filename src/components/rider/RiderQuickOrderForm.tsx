import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { readRiderDeviceSnapshot } from '../../lib/riderDeviceSnapshot'
import type { Rider } from '../../lib/types'

type Props = {
  open: boolean
  rider: Rider
  branchName?: string | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}

type RiderGpsFix = {
  lat: number | null
  lng: number | null
  accuracy: number | null
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
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
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
  const [customerCode, setCustomerCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastError, setLastError] = useState('')

  if (!open) return null

  function reset() {
    setInvoiceNumber('')
    setCustomerCode('')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setInvoiceAmount('')
    setNotes('')
    setLastError('')
  }

  async function saveOrder() {
    const invoice = invoiceNumber.trim()
    if (!invoice) {
      toast.error('اكتب رقم الفاتورة')
      return
    }

    if (!navigator.onLine) {
      toast.error('تسجيل الأوردر السريع يحتاج إنترنت حاليًا لأنه يستخدم RPC آمن. سيتم إضافة Offline للأوردرات في المرحلة التالية.')
      return
    }

    try {
      setSaving(true)
      setLastError('')
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة. سجل دخول مرة أخرى من تطبيق الدليفري.')

      const gps = await requestRiderGps()
      const device = await readRiderDeviceSnapshot()

      const customerNameForSave = customerName.trim() || customerCode.trim() || customerPhone.trim() || 'عميل غير مسجل'
      const customerCodeForSave = customerCode.trim() || null
      const customerPhoneForSave = customerPhone.trim() || null
      const customerAddressForSave = customerAddress.trim() || null
      const amount = invoiceAmount.trim() ? Number(invoiceAmount) : 0

      const auditNote = [
        notes.trim(),
        `تسجيل سريع من Rider V2`,
        `الفرع: ${branchName || rider.branch_name || 'غير محدد'}`,
        `بطارية: ${device.batteryPercent ?? 'غير مدعومة'}%`,
        `Online: ${device.online ? 'yes' : 'no'}`,
        `GPS accuracy: ${gps.accuracy ?? 'unknown'}m`,
      ].filter(Boolean).join('\n')

      const { data, error } = await supabase.rpc('rider_create_order', {
        p_token: token,
        p_customer_id: null,
        p_customer_code: customerCodeForSave,
        p_customer_name: customerNameForSave,
        p_customer_phone: customerPhoneForSave,
        p_customer_address: customerAddressForSave,
        p_invoice_number: invoice,
        p_invoice_amount: Number.isFinite(amount) ? amount : 0,
        p_order_multiplier: 1,
        p_notes: auditNote,
        p_gps_lat: gps.lat,
        p_gps_lng: gps.lng,
        p_gps_accuracy_m: gps.accuracy,
        p_receipt_image_path: null,
        p_receipt_image_url: null,
        p_receipt_ocr_json: null,
      })

      const result = getRpcResult<any>(data)
      if (error || !result?.success) {
        throw new Error(error?.message || result?.message || result?.error || 'رفض السيرفر تسجيل الأوردر')
      }

      if (gps.accuracy && gps.accuracy > 100) {
        toast.warning(`تم تسجيل الأوردر لكن دقة GPS ضعيفة (${gps.accuracy} متر)، وقد يحتاج مراجعة.`)
      } else {
        toast.success(result.message || 'تم تسجيل الأوردر السريع بنجاح')
      }

      reset()
      await onSaved()
      onClose()
    } catch (error: any) {
      const message = error?.message || 'تعذر تسجيل الأوردر السريع'
      setLastError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm" dir="rtl">
      <div className="mx-auto flex h-full max-w-[620px] items-end sm:items-center">
        <section className="max-h-[92vh] w-full overflow-y-auto rounded-[32px] bg-white p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#008E92]">Rider V2</p>
              <h2 className="text-xl font-black text-[#061827]">تسجيل أوردر سريع</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">للفواتير العادية فقط. الريسيت و×1.5 والتفاصيل المتقدمة تظل في الداشبورد الكامل مؤقتًا.</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3">
            <Field label="رقم الفاتورة *">
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="dawaa-input text-right" placeholder="اكتب رقم الفاتورة" />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="كود العميل">
                <input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} className="dawaa-input text-right" placeholder="اختياري" />
              </Field>
              <Field label="اسم العميل">
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="dawaa-input text-right" placeholder="اختياري" />
              </Field>
              <Field label="رقم الهاتف">
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="dawaa-input text-right" placeholder="اختياري" />
              </Field>
              <Field label="قيمة الفاتورة">
                <input type="number" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} className="dawaa-input text-right" placeholder="0" />
              </Field>
            </div>

            <Field label="عنوان التسليم">
              <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="dawaa-input text-right" placeholder="اكتب العنوان الحالي لو موجود" />
            </Field>

            <Field label="ملاحظات">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="dawaa-input resize-none text-right" placeholder="ملاحظة اختيارية" />
            </Field>

            {lastError ? <p className="rounded-2xl bg-rose-50 p-3 text-center text-xs font-black text-rose-700">{lastError}</p> : null}

            <button type="button" onClick={() => void saveOrder()} disabled={saving} className="w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white disabled:opacity-60">
              {saving ? 'جاري تسجيل الأوردر...' : 'حفظ الأوردر السريع ✅'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
