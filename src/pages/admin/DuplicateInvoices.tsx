import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Eye, Search, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { DeliveryOrder, Rider } from '../../lib/types'
import { approveDuplicateInvoice, getRiders, rejectDuplicateInvoice } from '../../lib/delivery'
import { formatTime, getOperationalPeriod } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'
import CycleSelector from '../../components/CycleSelector'
import OrderDetailsModal from '../../components/OrderDetailsModal'

function normalizeInvoice(order: any) {
  return String(order.invoice_number || order.invoice_no || '').trim()
}

function orderDate(order: any) {
  return order.delivery_date || order.work_date || order.registered_at || order.created_at
}

function safeStatus(order: any) {
  return String(order.duplicate_review_status || (order.is_duplicate_invoice ? 'pending' : 'pending'))
}

export default function DuplicateInvoices() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [detailsOrder, setDetailsOrder] = useState<DeliveryOrder | null>(null)

  const selectedFrom = searchParams.get('from') || period.start
  const selectedTo = searchParams.get('to') || period.end

  useEffect(() => {
    const status = searchParams.get('status') as typeof filter | null
    if (status && ['all', 'pending', 'approved', 'rejected'].includes(status)) setFilter(status)
    void loadAll()
  }, [searchParams])

  async function loadAll() {
    try {
      setLoading(true)
      const [byDeliveryDate, byWorkDate, ridersData] = await Promise.allSettled([
        supabase.from('delivery_orders').select('*').gte('delivery_date', selectedFrom).lte('delivery_date', selectedTo).order('registered_at', { ascending: false }).limit(50000),
        supabase.from('delivery_orders').select('*').gte('work_date', selectedFrom).lte('work_date', selectedTo).order('registered_at', { ascending: false }).limit(50000),
        getRiders(),
      ])

      const rows = [byDeliveryDate, byWorkDate].flatMap((res: any) => res.status === 'fulfilled' && !res.value.error ? (res.value.data || []) : []) as DeliveryOrder[]
      const unique = new Map<string, DeliveryOrder>()
      rows.forEach((order, index) => unique.set(String((order as any).id || index), order))
      const allOrders = Array.from(unique.values())

      const invoiceCounts = new Map<string, number>()
      allOrders.forEach(order => {
        const invoice = normalizeInvoice(order)
        if (!invoice) return
        invoiceCounts.set(invoice, (invoiceCounts.get(invoice) || 0) + 1)
      })

      const duplicateOrders = allOrders.filter(order => {
        const invoice = normalizeInvoice(order)
        return Boolean((order as any).is_duplicate_invoice || (invoice && (invoiceCounts.get(invoice) || 0) > 1))
      })

      setOrders(duplicateOrders.sort((a: any, b: any) => String(orderDate(b)).localeCompare(String(orderDate(a)))))
      if (ridersData.status === 'fulfilled') setRiders(ridersData.value)
    } catch (error) {
      console.error(error)
      toast.error('فشل تحميل بيانات الفواتير المكررة')
    } finally {
      setLoading(false)
    }
  }

  function applyCycle(from: string, to: string) {
    const next = new URLSearchParams(searchParams)
    next.set('from', from)
    next.set('to', to)
    setSearchParams(next)
  }

  const riderMap = new Map(riders.map(r => [r.id, r]))
  const groupedCounts = useMemo(() => {
    const map = new Map<string, number>()
    orders.forEach(order => {
      const invoice = normalizeInvoice(order)
      if (invoice) map.set(invoice, (map.get(invoice) || 0) + 1)
    })
    return map
  }, [orders])

  const filteredOrders = orders.filter(order => {
    const status = safeStatus(order)
    const matchesFilter = filter === 'all' || status === filter
    const matchesRider = !searchParams.get('rider_id') || order.rider_id === searchParams.get('rider_id')
    const branch = searchParams.get('branch')
    const rider = riderMap.get(order.rider_id)
    const matchesBranch = !branch || String((order as any).branch_name || rider?.branch_id || '').includes(branch)
    const matchesSearch = !searchTerm ||
      normalizeInvoice(order).includes(searchTerm) ||
      order.customer_name_snapshot?.includes(searchTerm) ||
      (rider?.name || '').includes(searchTerm)
    return matchesFilter && matchesSearch && matchesRider && matchesBranch
  })

  async function handleApprove(orderId: string) {
    const order = orders.find(o => o.id === orderId)
    const duplicateReason = String((order as any)?.duplicate_reason || '').trim()
    const duplicateNote = String((order as any)?.duplicate_note || (order as any)?.notes || '').trim()
    const doctorName = String((order as any)?.preparing_doctor_name || (order as any)?.receipt_extracted_doctor_name || '').trim()
    if (!duplicateReason || duplicateNote.length < 8 || !doctorName) {
      toast.error('لا يمكن اعتماد الفاتورة المكررة قبل وجود سبب التكرار، ملاحظة واضحة، واسم الدكتور/المحضر')
      return
    }
    try {
      await approveDuplicateInvoice(orderId)
      toast.success('تم اعتماد الفاتورة المكررة')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('فشل اعتماد الفاتورة')
    }
  }

  async function handleReject(orderId: string) {
    const reason = window.prompt('اكتب سبب الرفض')
    if (!reason?.trim()) {
      toast.error('سبب الرفض مطلوب')
      return
    }
    try {
      await rejectDuplicateInvoice(orderId, reason)
      toast.success('تم رفض الفاتورة المكررة')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('فشل رفض الفاتورة')
    }
  }

  if (loading) return <div className="min-h-screen bg-[#F3F7F8] p-8 text-center text-lg font-bold">جاري التحميل...</div>

  return (
    <div className="min-h-screen bg-[#F3F7F8] pb-12" dir="rtl">
      <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin')} className="rounded-full bg-white/20 p-2 hover:bg-white/30">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-black">إدارة الفواتير المكررة</h1>
            <p className="text-sm text-white/80">كل الفواتير التي تكررت داخل الدورة المختارة، مع سبب التكرار واسم الدكتور إن سجله الدليفري</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <CycleSelector from={selectedFrom} to={selectedTo} onApply={applyCycle} />

        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          الفترة الحالية: <b>{selectedFrom}</b> إلى <b>{selectedTo}</b> — اضغط على زر العين لعرض كل تفاصيل الأوردر، والاعتماد يكون فقط بعد التأكد من السبب والدكتور الذي أخرج الأوردر.
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFilter('all')} className={`rounded-full px-4 py-2 text-sm font-black ${filter === 'all' ? 'bg-[#008E92] text-white' : 'bg-white text-slate-700'}`}>الكل ({orders.length})</button>
            <button onClick={() => setFilter('pending')} className={`rounded-full px-4 py-2 text-sm font-black ${filter === 'pending' ? 'bg-amber-500 text-white' : 'bg-white text-slate-700'}`}>قيد المراجعة ({orders.filter(o => safeStatus(o) === 'pending').length})</button>
            <button onClick={() => setFilter('approved')} className={`rounded-full px-4 py-2 text-sm font-black ${filter === 'approved' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-700'}`}>معتمدة ({orders.filter(o => safeStatus(o) === 'approved').length})</button>
            <button onClick={() => setFilter('rejected')} className={`rounded-full px-4 py-2 text-sm font-black ${filter === 'rejected' ? 'bg-rose-500 text-white' : 'bg-white text-slate-700'}`}>مرفوضة ({orders.filter(o => safeStatus(o) === 'rejected').length})</button>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-3 text-slate-400" size={20} />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="بحث برقم الفاتورة أو اسم العميل أو الدليفري" className="dawaa-input pr-10" />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-8 text-center font-bold text-slate-500">
            {orders.length === 0 ? 'مفيش فواتير مكررة في الفترة المختارة' : 'مفيش نتائج مطابقة للبحث'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const rider = riderMap.get(order.rider_id)
              const status = safeStatus(order)
              const invoice = normalizeInvoice(order)
              const repeatCount = groupedCounts.get(invoice) || 1
              const doctorName = (order as any).preparing_doctor_name || (order as any).receipt_extracted_doctor_name || 'غير مسجل'
              const duplicateReason = (order as any).duplicate_reason || ''
              const duplicateNote = (order as any).duplicate_note || (order as any).notes || ''
              const missingAuditInfo = status === 'pending' && (!duplicateReason || duplicateNote.length < 8 || doctorName === 'غير مسجل')
              return (
                <div key={order.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-lg font-black">فاتورة {invoice || '—'}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">تكررت {repeatCount} مرة</span>
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${status === 'approved' ? 'bg-emerald-100 text-emerald-700' : status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                          {status === 'approved' ? 'معتمدة' : status === 'rejected' ? 'مرفوضة' : 'قيد المراجعة'}
                        </span>
                        {!((order as any).is_duplicate_invoice) && <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">مكتشفة تلقائيًا</span>}
                        {missingAuditInfo && <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-black text-rose-700">ناقص سبب/دكتور</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                        <div><p className="text-slate-500">الدليفري</p><p className="font-bold">{rider?.name || 'غير محدد'}</p></div>
                        <div><p className="text-slate-500">العميل</p><p className="font-bold">{order.customer_name_snapshot || 'غير محدد'}</p></div>
                        <div><p className="text-slate-500">تاريخ التسجيل</p><p className="font-bold">{formatTime((order as any).registered_at || orderDate(order))}</p></div>
                        <div><p className="text-slate-500">قيمة الفاتورة</p><p className="font-bold">{(order as any).invoice_amount || '—'}</p></div>
                        <div><p className="text-slate-500">سبب التكرار</p><p className="font-bold">{duplicateReason || '—'}</p></div>
                        <div><p className="text-slate-500">الدكتور/المحضّر</p><p className="font-bold">{doctorName}</p></div>
                        <div><p className="text-slate-500">كود العميل</p><p className="font-bold">{(order as any).customer_code_snapshot || '—'}</p></div>
                        <div><p className="text-slate-500">ملاحظة الدليفري</p><p className="font-bold">{duplicateNote || '—'}</p></div>
                      </div>
                      {duplicateNote && <div className="mt-2 rounded-lg bg-slate-50 p-2 text-sm"><p className="text-slate-500">تفاصيل الملاحظة</p><p className="font-bold">{duplicateNote}</p></div>}
                    </div>
                    <div className="flex gap-2 sm:flex-col">
                      <button onClick={() => setDetailsOrder(order)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-black text-white hover:bg-slate-800"><Eye size={18} />تفاصيل</button>
                      {status === 'pending' && (
                        <>
                          <button onClick={() => handleApprove(order.id)} disabled={missingAuditInfo} title={missingAuditInfo ? 'لا تعتمد قبل تسجيل سبب التكرار واسم الدكتور' : 'اعتماد'} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-black text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"><CheckCircle2 size={18} />اعتماد</button>
                          <button onClick={() => handleReject(order.id)} className="flex items-center gap-2 rounded-xl bg-rose-100 px-4 py-2 font-black text-rose-700 hover:bg-rose-200"><XCircle size={18} />رفض</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {detailsOrder && (
        <OrderDetailsModal
          order={detailsOrder}
          riderName={riderMap.get(detailsOrder.rider_id)?.name || (detailsOrder as any).rider_name || 'غير محدد'}
          invoiceNumber={normalizeInvoice(detailsOrder)}
          onClose={() => setDetailsOrder(null)}
          onApprove={safeStatus(detailsOrder) === 'pending' ? () => { const id = detailsOrder.id; setDetailsOrder(null); void handleApprove(id) } : undefined}
          onReject={safeStatus(detailsOrder) === 'pending' ? () => { const id = detailsOrder.id; setDetailsOrder(null); void handleReject(id) } : undefined}
        />
      )}
    </div>
  )
}
