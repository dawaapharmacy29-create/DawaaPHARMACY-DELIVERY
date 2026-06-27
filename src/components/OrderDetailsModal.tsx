import { CheckCircle2, Pencil, X, XCircle } from 'lucide-react'
import { formatMoney } from '../lib/helpers'

function valueOf(order: any, ...keys: string[]) {
  for (const key of keys) {
    const value = order?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value)
  }
  return '—'
}

function dateValue(value: unknown) {
  if (!value) return '—'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('ar-EG')
}

function Detail({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${danger ? 'border-rose-100 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}>
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-sm font-black ${danger ? 'text-rose-700' : 'text-slate-800'}`}>{value || '—'}</p>
    </div>
  )
}

export default function OrderDetailsModal({
  order,
  riderName,
  invoiceNumber,
  onClose,
  onEdit,
  onApprove,
  onReject,
  onReassign,
}: {
  order: any
  riderName: string
  invoiceNumber: string
  onClose: () => void
  onEdit?: () => void
  onApprove?: () => void
  onReject?: () => void
  onReassign?: () => void
}) {
  if (!order) return null
  const finalStatus = valueOf(order, 'final_count_status')
  const countable = order.is_countable === true ? 'نعم' : 'لا'
  const multiplier = Number(order.order_multiplier ?? 1)
  const amount = Number(order.invoice_amount ?? order.invoice_value ?? 0)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" dir="rtl">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-[#061827] to-[#008E92] p-5 text-white">
          <div>
            <p className="text-xs font-black text-white/70">تفاصيل أوردر المطابقة</p>
            <h3 className="mt-1 text-2xl font-black">فاتورة {invoiceNumber || valueOf(order, 'invoice_number', 'invoice_no')}</h3>
            <p className="mt-1 text-sm font-bold text-white/80">{riderName || valueOf(order, 'rider_name')} · {dateValue(order.registered_at || order.created_at)}</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/15 p-2 transition hover:bg-white/25"><X size={22} /></button>
        </div>

        <div className="max-h-[calc(92vh-96px)] overflow-auto p-5">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="المندوب" value={riderName || valueOf(order, 'rider_name')} />
            <Detail label="العميل" value={valueOf(order, 'customer_name_snapshot', 'customer_name')} />
            <Detail label="كود العميل" value={valueOf(order, 'customer_code_snapshot', 'customer_code')} />
            <Detail label="التليفون" value={valueOf(order, 'customer_phone_snapshot', 'customer_phone')} />
            <Detail label="العنوان" value={valueOf(order, 'customer_address_snapshot', 'customer_address', 'address')} />
            <Detail label="قيمة الفاتورة" value={formatMoney(amount)} />
            <Detail label="حالة الأوردر" value={valueOf(order, 'status')} />
            <Detail label="حالة بي كونكت" value={valueOf(order, 'bconnect_match_status')} />
            <Detail label="حالة الاحتساب" value={finalStatus} />
            <Detail label="محتسب؟" value={countable} />
            <Detail label="معامل الأوردر" value={String(multiplier)} />
            <Detail label="دكتور التحضير" value={valueOf(order, 'preparing_doctor_name')} />
            <Detail label="وقت التسجيل" value={dateValue(order.registered_at || order.created_at)} />
            <Detail label="وقت التسليم" value={dateValue(order.delivered_at)} />
            <Detail label="تاريخ الحذف" value={dateValue(order.deleted_at)} />
            <Detail label="فرع/منطقة" value={valueOf(order, 'branch_name', 'delivery_zone', 'zone')} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Detail label="سبب 1.5" value={valueOf(order, 'multiplier_reason')} />
            <Detail label="سبب التكرار" value={valueOf(order, 'duplicate_reason')} />
            <Detail label="سبب الفشل" value={valueOf(order, 'failed_reason')} danger={Boolean(order.failed_reason)} />
            <Detail label="سبب الاستبعاد" value={valueOf(order, 'count_exclusion_reason')} danger={Boolean(order.count_exclusion_reason)} />
            <Detail label="سبب الحذف" value={valueOf(order, 'deletion_reason')} danger={Boolean(order.deleted_at)} />
            <Detail label="سبب التحويل" value={valueOf(order, 'reassignment_reason')} />
          </div>

          <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black text-slate-500">ملاحظات المطابقة</p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-bold text-slate-700">{valueOf(order, 'reconciliation_notes', 'notes')}</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {onApprove && <button onClick={onApprove} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-700"><CheckCircle2 size={18} /> اعتماد يدوي</button>}
            {onEdit && <button onClick={onEdit} className="inline-flex items-center gap-2 rounded-2xl bg-amber-100 px-4 py-3 font-black text-amber-800 hover:bg-amber-200"><Pencil size={18} /> تعديل البيانات</button>}
            {onReject && <button onClick={onReject} className="inline-flex items-center gap-2 rounded-2xl bg-rose-100 px-4 py-3 font-black text-rose-700 hover:bg-rose-200"><XCircle size={18} /> استبعاد</button>}
            {onReassign && <button onClick={onReassign} className="rounded-2xl bg-blue-100 px-4 py-3 font-black text-blue-700 hover:bg-blue-200">🔁 تحويل لمندوب</button>}
            <button onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-3 font-black text-slate-700 hover:bg-slate-200">إغلاق</button>
          </div>
        </div>
      </div>
    </div>
  )
}
