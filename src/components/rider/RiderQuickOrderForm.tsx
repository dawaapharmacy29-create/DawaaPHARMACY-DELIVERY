import { FormEvent, useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import type { Rider } from '../../lib/types'

type Props = {
  open: boolean
  rider: Rider
  branchName?: string | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}

type CustomerHit = {
  id: string | null
  customer_code: string | null
  customer_name: string | null
  phone: string | null
  address: string | null
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
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerCode, setCustomerCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [results, setResults] = useState<CustomerHit[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastError, setLastError] = useState('')
  const searchSeq = useRef(0)

  useEffect(() => {
    if (!open) return
    const q = customerSearch.trim()
    if (q.length < 2 || customerId) {
      setResults([])
      setSearching(false)
      return
    }

    const seq = ++searchSeq.current
    const timer = window.setTimeout(async () => {
      try {
        setSearching(true)
        const isNumeric = /^\d+$/.test(q)
        let query = supabase
          .from('customers')
          .select('id,customer_code,customer_name,phone,address')
          .limit(6)

        if (isNumeric) {
          query = query.or(`customer_code.eq.${q},phone.eq.${q},customer_code.ilike.%${q}%,phone.ilike.%${q}%`)
        } else {
          query = query.ilike('customer_name', `%${q}%`)
        }

        const { data, error } = await query
        if (seq !== searchSeq.current) return
        if (error) throw error
        setResults((data ?? []) as CustomerHit[])
      } catch {
        if (seq === searchSeq.current) setResults([])
      } finally {
        if (seq === searchSeq.current) setSearching(false)
      }
    }, 220)

    return () => window.clearTimeout(timer)
  }, [open, customerSearch, customerId])

  if (!open) return null

  function selectCustomer(customer: CustomerHit) {
    setCustomerId(customer.id || null)
    setCustomerCode(customer.customer_code || '')
    setCustomerName(customer.customer_name || '')
    setCustomerPhone(customer.phone || '')
    setCustomerAddress(customer.address || '')
    setCustomerSearch(customer.customer_name || customer.customer_code || customer.phone || '')
    setResults([])
  }

  function clearCustomer() {
    setCustomerId(null)
    setCustomerCode('')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setCustomerSearch('')
    setResults([])
  }

  function reset() {
    setInvoiceNumber('')
    setCustomerSearch('')
    setCustomerId(null)
    setCustomerCode('')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setInvoiceAmount('')
    setNotes('')
    setShowMore(false)
    setResults([])
    setLastError('')
  }

  async function saveOrder(event?: FormEvent) {
    event?.preventDefault()
    if (saving) return

    const invoice = invoiceNumber.trim()
    if (!invoice) {
      toast.error('اكتب رقم الفاتورة')
      return
    }

    if (!navigator.onLine) {
      toast.error('تسجيل الأوردر السريع يحتاج إنترنت حاليًا')
      return
    }

    try {
      setSaving(true)
      setLastError('')
      const token = getStoredRiderToken()
      if (!token) throw new Error('انتهت الجلسة. سجل دخول مرة أخرى من تطبيق الدليفري.')

      const customerNameForSave = customerName.trim() || customerCode.trim() || customerPhone.trim() || customerSearch.trim() || 'عميل غير مسجل'
      const customerCodeForSave = customerCode.trim() || null
      const customerPhoneForSave = customerPhone.trim() || null
      const customerAddressForSave = customerAddress.trim() || null
      const amount = invoiceAmount.trim() ? Number(invoiceAmount) : 0
      const auditNote = [
        notes.trim(),
        'تسجيل سريع بدون GPS',
        `الفرع: ${branchName || rider.branch_name || 'غير محدد'}`,
      ].filter(Boolean).join('\n')

      // المسار الحرج للحفظ متعمد أن يظل RPC واحدًا فقط: لا GPS، لا قراءة جهاز، لا رفع ملفات، ولا refresh قبل الإغلاق.
      const { data, error } = await supabase.rpc('rider_create_order', {
        p_token: token,
        p_customer_id: customerId,
        p_customer_code: customerCodeForSave,
        p_customer_name: customerNameForSave,
        p_customer_phone: customerPhoneForSave,
        p_customer_address: customerAddressForSave,
        p_invoice_number: invoice,
        p_invoice_amount: Number.isFinite(amount) ? amount : 0,
        p_order_multiplier: 1,
        p_notes: auditNote,
        p_gps_lat: null,
        p_gps_lng: null,
        p_gps_accuracy_m: null,
        p_receipt_image_path: null,
        p_receipt_image_url: null,
        p_receipt_ocr_json: null,
      })

      const result = getRpcResult<any>(data)
      if (error || !result?.success) {
        throw new Error(error?.message || result?.message || result?.error || 'رفض السيرفر تسجيل الأوردر')
      }

      toast.success(result.message || 'تم تسجيل الأوردر ✅')
      reset()
      onClose()
      void Promise.resolve(onSaved()).catch(() => {})
    } catch (error: any) {
      const message = error?.message || 'تعذر تسجيل الأوردر'
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
              <p className="text-xs font-black text-[#008E92]">تسجيل فوري</p>
              <h2 className="text-xl font-black text-[#061827]">أوردر جديد</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">رقم الفاتورة + العميل + القيمة ثم حفظ مباشرة.</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <X size={20} />
            </button>
          </div>

          <form className="space-y-3" onSubmit={(event) => void saveOrder(event)}>
            <Field label="رقم الفاتورة *">
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="dawaa-input text-right text-lg font-black" placeholder="رقم الفاتورة" inputMode="numeric" autoFocus autoComplete="off" />
            </Field>

            <div className="relative">
              <Field label="العميل — كود / اسم / موبايل">
                <div className="relative">
                  <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={customerSearch}
                    onChange={(e) => {
                      if (customerId) clearCustomer()
                      setCustomerSearch(e.target.value)
                    }}
                    className="dawaa-input pl-10 text-right"
                    placeholder="اكتب كود أو اسم أو رقم العميل"
                    autoComplete="off"
                  />
                </div>
              </Field>

              {searching ? <p className="mt-1 text-xs font-bold text-slate-400">جاري البحث...</p> : null}
              {results.length > 0 ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1 shadow-2xl">
                  {results.map((customer, index) => (
                    <button
                      key={customer.id || `${customer.customer_code}-${index}`}
                      type="button"
                      onClick={() => selectCustomer(customer)}
                      className="w-full rounded-xl px-3 py-2 text-right hover:bg-slate-50"
                    >
                      <p className="text-sm font-black text-slate-800">{customer.customer_name || 'بدون اسم'}</p>
                      <p className="mt-0.5 text-[11px] font-bold text-slate-400">{[customer.customer_code, customer.phone, customer.address].filter(Boolean).join(' • ')}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {customerId ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-emerald-800">{customerName || 'عميل مسجل'}</p>
                  <p className="truncate text-xs font-bold text-emerald-600">{[customerCode, customerPhone, customerAddress].filter(Boolean).join(' • ')}</p>
                </div>
                <button type="button" onClick={clearCustomer} className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-500">تغيير</button>
              </div>
            ) : null}

            <Field label="قيمة الفاتورة">
              <input type="number" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} className="dawaa-input text-right text-lg font-black" placeholder="0" inputMode="decimal" />
            </Field>

            <button type="button" onClick={() => setShowMore((value) => !value)} className="w-full rounded-xl bg-slate-50 py-2 text-xs font-black text-slate-500">
              {showMore ? 'إخفاء البيانات الإضافية' : 'بيانات إضافية عند الحاجة'}
            </button>

            {showMore ? (
              <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="كود العميل">
                    <input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} className="dawaa-input text-right" inputMode="numeric" />
                  </Field>
                  <Field label="اسم العميل">
                    <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="dawaa-input text-right" />
                  </Field>
                  <Field label="رقم الهاتف">
                    <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="dawaa-input text-right" inputMode="tel" />
                  </Field>
                  <Field label="العنوان">
                    <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="dawaa-input text-right" />
                  </Field>
                </div>
                <Field label="ملاحظات">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="dawaa-input resize-none text-right" />
                </Field>
              </div>
            ) : null}

            {lastError ? <p className="rounded-2xl bg-rose-50 p-3 text-center text-xs font-black text-rose-700">{lastError}</p> : null}

            <button type="submit" disabled={saving} className="w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : 'حفظ الأوردر الآن ✅'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
