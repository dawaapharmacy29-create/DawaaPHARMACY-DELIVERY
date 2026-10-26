import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Eye, Search, XCircle, CopyCheck } from 'lucide-react'
import { toast } from 'sonner'
import { DeliveryOrder, Rider } from '../../lib/types'
import { approveDuplicateInvoice, getRiders, rejectDuplicateInvoice } from '../../lib/delivery'
import { duplicateReasonLabel, formatCairoDateTime, getOperationalPeriod } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'
import CycleSelector from '../../components/CycleSelector'
import OrderDetailsModal from '../../components/OrderDetailsModal'
import OperationsAdminTabs from '../../components/OperationsAdminTabs'

function normalizeInvoice(order: any) {
  return String(order.invoice_number || order.invoice_no || '').trim()
}

function orderDate(order: any) {
  return order.delivery_date || order.work_date || order.registered_at || order.created_at
}

function safeStatus(order: any) {
  const status = String(order.duplicate_review_status || 'not_required')
  // "not_required" is normal for the first registration, but on this page
  // it still needs an explicit manager decision once the invoice is duplicated.
  return status === 'not_required' ? 'pending' : status
}

export default function DuplicateInvoices() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [detailsOrder, setDetailsOrder] = useState<DeliveryOrder | null>(null)
  const [decisionInvoice, setDecisionInvoice] = useState<string | null>(null)
  const [decisionChoice, setDecisionChoice] = useState<'first' | 'second' | 'both' | 'none' | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [decisionRejectReason, setDecisionRejectReason] = useState('الزيارة تخص المندوب الآخر')
  const [decisionCustomReason, setDecisionCustomReason] = useState('')
  const [decidingOrderId, setDecidingOrderId] = useState<string | null>(null)
  const decidingRef = useRef(false)

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

      if ([byDeliveryDate, byWorkDate].some(result => result.status === 'rejected' || (result.status === 'fulfilled' && result.value.error))) {
        throw new Error('تعذر تحميل كل تسجيلات الدورة؛ لا يمكن اتخاذ قرار من بيانات ناقصة')
      }

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
      setOrders([])
      toast.error(error instanceof Error ? error.message : 'فشل تحميل بيانات الفواتير المكررة')
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
  const invoiceGroups = useMemo(() => {
    const map = new Map<string, DeliveryOrder[]>()
    orders.forEach(order => {
      const invoice = normalizeInvoice(order)
      if (!invoice) return
      const group = map.get(invoice) || []
      group.push(order)
      map.set(invoice, group)
    })
    return Array.from(map, ([invoice, entries]) => ({
      invoice,
      entries: entries.sort((a, b) => {
        const aTime = new Date(String((a as any).registered_at || (a as any).created_at || 0)).getTime()
        const bTime = new Date(String((b as any).registered_at || (b as any).created_at || 0)).getTime()
        return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime)
      }),
    })).sort((a, b) => String(orderDate(b.entries[b.entries.length - 1])).localeCompare(String(orderDate(a.entries[a.entries.length - 1]))))
  }, [orders])
  // Every registration in a duplicated invoice must be decidable, including the earliest.
  const reviewableOrders = invoiceGroups.flatMap(group => group.entries)
  const decisionGroup = invoiceGroups.find(group => group.invoice === decisionInvoice)

  useEffect(() => {
    if (!decisionInvoice) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDecisionInvoice(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [decisionInvoice])

  function openUnifiedDecision(invoice: string) {
    setDecisionChoice(null)
    setDecisionNote('')
    setDecisionRejectReason('الزيارة تخص المندوب الآخر')
    setDecisionCustomReason('')
    setDecisionInvoice(invoice)
  }

  function matchesOrderFilters(order: DeliveryOrder) {
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
  }
  // A filtered group still shows every sibling: hiding the earlier delivery would mislead the reviewer.
  const filteredGroups = invoiceGroups.filter(group => group.entries.some(matchesOrderFilters))

  async function handleApprove(orderId: string) {
    if (decidingRef.current) return
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    const group = invoiceGroups.find(g => g.entries.some(entry => entry.id === orderId))
    const isLaterRegistration = Boolean(group && group.entries.findIndex(entry => entry.id === orderId) > 0)
    const duplicateReason = String((order as any).duplicate_reason || '').trim()
    if (isLaterRegistration && !duplicateReason) {
      toast.error('سبب التكرار غير مسجل لهذا التسجيل اللاحق؛ لا يمكن اعتماده قبل استكمال السبب')
      return
    }
    const otherApproved = group?.entries.some(entry => entry.id !== orderId && safeStatus(entry) === 'approved')
    if (!window.confirm(`اعتماد تسجيل هذا المندوب فقط؟\nفاتورة ${normalizeInvoice(order)} — ${riderMap.get(order.rider_id)?.name || (order as any).rider_name || 'مندوب غير محدد'}\n${otherApproved ? 'تنبيه: يوجد تسجيل آخر معتمد لنفس الفاتورة؛ تأكد من وجود زيارتين فعليتين مستقلتين.\n' : ''}هذا القرار لا يعتمد باقي التسجيلات ولا يضاعف قيمة الفاتورة تلقائيًا.`)) return
    try {
      decidingRef.current = true
      setDecidingOrderId(orderId)
      await approveDuplicateInvoice(orderId)
      toast.success('تم اعتماد هذا التسجيل فقط')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('فشل اعتماد الفاتورة')
    } finally {
      decidingRef.current = false
      setDecidingOrderId(null)
    }
  }

  async function handleReject(orderId: string) {
    if (decidingRef.current) return
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    const reason = window.prompt(`رفض هذا التسجيل فقط — فاتورة ${normalizeInvoice(order)}، المندوب ${riderMap.get(order.rider_id)?.name || (order as any).rider_name || 'غير محدد'}.\nاكتب سبب الرفض:`)
    if (!reason?.trim()) {
      toast.error('سبب الرفض مطلوب')
      return
    }
    try {
      decidingRef.current = true
      setDecidingOrderId(orderId)
      await rejectDuplicateInvoice(orderId, reason)
      toast.success('تم رفض هذا التسجيل فقط')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('فشل رفض الفاتورة')
    } finally {
      decidingRef.current = false
      setDecidingOrderId(null)
    }
  }

  if (loading) return <div className="min-h-screen bg-[#F3F7F8] p-8 text-center text-lg font-bold">جاري التحميل...</div>

  return (
    <div className="min-h-screen bg-[#F3F7F8] pb-12" dir="rtl">
      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <OperationsAdminTabs />
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><CopyCheck size={20}/></span>
            <div>
              <p className="text-xs font-black text-[#008E92]">التشغيل والمراجعة</p>
              <h1 className="mt-1 text-xl font-black text-[#061827]">مراجعة الأوردرات المكررة</h1>
              <p className="mt-1 text-sm font-bold text-slate-500">راجع سبب التكرار والتسجيلات المرتبطة قبل الاعتماد أو الرفض.</p>
            </div>
          </div>
        </section>
        <CycleSelector from={selectedFrom} to={selectedTo} onApply={applyCycle} />

        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          الفترة الحالية: <b>{selectedFrom}</b> إلى <b>{selectedTo}</b> — راجع سبب التكرار وملاحظة المندوب إن وجدت، ثم قارن التسجيلات قبل قرار الاعتماد.
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFilter('all')} className={`rounded-full px-4 py-2 text-sm font-black ${filter === 'all' ? 'bg-[#008E92] text-white' : 'bg-white text-slate-700'}`}>كل الفواتير ({invoiceGroups.length})</button>
            <button onClick={() => setFilter('pending')} className={`rounded-full px-4 py-2 text-sm font-black ${filter === 'pending' ? 'bg-amber-500 text-white' : 'bg-white text-slate-700'}`}>قيد المراجعة ({reviewableOrders.filter(o => safeStatus(o) === 'pending').length} تسجيل)</button>
            <button onClick={() => setFilter('approved')} className={`rounded-full px-4 py-2 text-sm font-black ${filter === 'approved' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-700'}`}>معتمدة ({reviewableOrders.filter(o => safeStatus(o) === 'approved').length} تسجيل)</button>
            <button onClick={() => setFilter('rejected')} className={`rounded-full px-4 py-2 text-sm font-black ${filter === 'rejected' ? 'bg-rose-500 text-white' : 'bg-white text-slate-700'}`}>مرفوضة ({reviewableOrders.filter(o => safeStatus(o) === 'rejected').length} تسجيل)</button>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-3 text-slate-400" size={20} />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="بحث برقم الفاتورة أو اسم العميل أو الدليفري" className="dawaa-input pr-10" />
          </div>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-8 text-center font-bold text-slate-500">
            {orders.length === 0 ? 'مفيش فواتير مكررة في الفترة المختارة' : 'مفيش نتائج مطابقة للبحث'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGroups.map(({ invoice, entries }) => {
              return (
                <div key={invoice} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                    <h2 className="text-lg font-black text-slate-950">فاتورة {invoice}</h2>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{entries.length} تسجيلات</span>
                    <span className="text-xs font-bold text-slate-500">ترتيب التسجيلات حسب وقت تسجيلها، وليس تأكيدًا لترتيب التوصيل الفعلي — يمكنك قبول أو رفض أي تسجيل بشكل مستقل</span>
                    {entries.length === 2 && <button type="button" onClick={() => openUnifiedDecision(invoice)} className="rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white">قرار سريع للفاتورة (تجربة)</button>}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {entries.map((order, index) => {
                      const rider = riderMap.get(order.rider_id)
                      const status = safeStatus(order)
                      const reason = String((order as any).duplicate_reason || '').trim()
                      const note = String((order as any).duplicate_note || '').trim()
                      const isLater = index > 0
                      const missingRequiredReason = isLater && !reason
                      return (
                        <div key={order.id} className={`rounded-xl border p-3 ${isLater ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="font-black text-slate-950">{isLater ? `تسجيل لاحق ${index + 1}` : 'الأسبق تسجيلًا'}</span>
                            <span className={`rounded-full px-2 py-1 text-xs font-black ${status === 'approved' ? 'bg-emerald-100 text-emerald-800' : status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{status === 'approved' ? 'معتمد' : status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><p className="text-slate-500">المندوب</p><p className="font-black">{rider?.name || (order as any).rider_name || 'غير محدد'}</p></div>
                            <div><p className="text-slate-500">تاريخ ووقت التسجيل (القاهرة)</p><p className="font-black">{formatCairoDateTime((order as any).registered_at || (order as any).created_at || orderDate(order))}</p></div>
                            <div><p className="text-slate-500">العميل</p><p className="font-bold">{order.customer_name_snapshot || 'غير محدد'}</p></div>
                            <div><p className="text-slate-500">كود العميل</p><p className="font-bold">{(order as any).customer_code_snapshot || '—'}</p></div>
                          </div>
                          <div className="mt-3 rounded-xl border border-amber-200 bg-white p-3 text-sm">
                            <p className="text-xs font-black text-amber-800">سبب {isLater || (order as any).is_duplicate_invoice ? 'التكرار' : 'التسجيل'}</p>
                            <p className="mt-1 font-black text-slate-950">{!reason && !isLater ? 'التسجيل الأسبق — لا يلزم منه سبب تكرار' : duplicateReasonLabel(reason)}</p>
                            <p className="mt-2 text-xs font-black text-amber-800">ملاحظة المندوب</p>
                            <p className="mt-1 whitespace-pre-wrap break-words font-bold text-slate-800">{note || 'لا توجد ملاحظة إضافية'}</p>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button onClick={() => setDetailsOrder(order)} className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white"><Eye size={16} /> تفاصيل التسجيل</button>
                            {status === 'pending' && (
                              <>
                                <button onClick={() => void handleApprove(order.id)} disabled={missingRequiredReason || decidingOrderId !== null} title={missingRequiredReason ? 'سبب التكرار غير مسجل للتسجيل اللاحق' : 'اعتماد هذا التسجيل فقط'} className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 size={16} /> اعتماد هذا التسجيل</button>
                                <button onClick={() => void handleReject(order.id)} disabled={decidingOrderId !== null} className="flex items-center gap-1 rounded-xl bg-rose-100 px-3 py-2 text-xs font-black text-rose-800 disabled:opacity-40"><XCircle size={16} /> رفض هذا التسجيل</button>
                              </>
                            )}
                            {status === 'pending' && missingRequiredReason && <span className="self-center text-xs font-bold text-rose-700">سبب التكرار غير مسجل، الاعتماد متوقف لهذا التسجيل اللاحق فقط</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {decisionGroup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3" onMouseDown={event => { if (event.target === event.currentTarget) setDecisionInvoice(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="unified-decision-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="unified-decision-title" className="text-xl font-black text-slate-950">قرار سريع — فاتورة {decisionGroup.invoice}</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">اختار المستحق، وشوف النتيجة قبل أي حفظ</p>
              </div>
              <button type="button" onClick={() => setDecisionInvoice(null)} aria-label="إغلاق" className="rounded-xl bg-slate-100 p-2 text-slate-700"><XCircle size={20}/></button>
            </div>
            <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
              {decisionGroup.entries.map((entry, index) => (
                <div key={entry.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-200 py-1 last:border-0">
                  <span className="font-black">{index + 1}. {riderMap.get(entry.rider_id)?.name || (entry as any).rider_name || 'مندوب غير محدد'}</span>
                  <span className="text-slate-600">{formatCairoDateTime((entry as any).registered_at || (entry as any).created_at || orderDate(entry))}</span>
                  {index === 1 && <span className="w-full text-xs text-slate-700">السبب: {duplicateReasonLabel(String((entry as any).duplicate_reason || ''))} — {(entry as any).duplicate_note || 'لا توجد ملاحظة'}</span>}
                </div>
              ))}
            </div>
            <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <legend className="mb-2 font-black">مين يستحق احتساب الأوردر؟</legend>
              {([
                ['first', `${riderMap.get(decisionGroup.entries[0].rider_id)?.name || (decisionGroup.entries[0] as any).rider_name || 'المندوب الأول'} فقط`],
                ['second', `${riderMap.get(decisionGroup.entries[1].rider_id)?.name || (decisionGroup.entries[1] as any).rider_name || 'المندوب الثاني'} فقط`],
                ['both', 'الاثنان — زيارتان مستقلتان'],
                ['none', 'لا أحد — رفض التسجيلين'],
              ] as const).map(([value, label]) => (
                <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-sm font-black ${decisionChoice === value ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}`}>
                  <input type="radio" checked={decisionChoice === value} onChange={() => setDecisionChoice(value)} />{label}
                </label>
              ))}
            </fieldset>
            {decisionChoice && decisionChoice !== 'both' && (
              <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
                <legend className="px-1 text-sm font-black">سبب رفض {decisionChoice === 'none' ? 'التسجيلين' : decisionChoice === 'first' ? (riderMap.get(decisionGroup.entries[1].rider_id)?.name || (decisionGroup.entries[1] as any).rider_name || 'المندوب الثاني') : (riderMap.get(decisionGroup.entries[0].rider_id)?.name || (decisionGroup.entries[0] as any).rider_name || 'المندوب الأول')}</legend>
                <div className="flex flex-wrap gap-2">
                  {['الزيارة تخص المندوب الآخر', 'تسجيل مكرر بالخطأ', 'لم ينفذ الزيارة', 'بيانات غير صحيحة', 'سبب آخر'].map(reason => (
                    <label key={reason} className={`cursor-pointer rounded-full border px-3 py-2 text-xs font-bold ${decisionRejectReason === reason ? 'border-rose-500 bg-rose-50 text-rose-900' : 'border-slate-200 text-slate-700'}`}>
                      <input className="sr-only" type="radio" name="decision-rejection-reason" checked={decisionRejectReason === reason} onChange={() => setDecisionRejectReason(reason)} />{reason}
                    </label>
                  ))}
                </div>
                {decisionRejectReason === 'سبب آخر' && <input value={decisionCustomReason} onChange={event => setDecisionCustomReason(event.target.value)} placeholder="اكتب سبب الرفض" className="w-full rounded-xl border border-slate-200 p-2.5 text-sm" />}
              </fieldset>
            )}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
              {!decisionChoice && <p>اختار قرارًا أولًا لعرض تأثيره على كل مندوب.</p>}
              {decisionChoice && decisionGroup.entries.map((entry, index) => {
                const approved = decisionChoice === 'both' || (decisionChoice === 'first' && index === 0) || (decisionChoice === 'second' && index === 1)
                return <p key={entry.id} className="py-1">{riderMap.get(entry.rider_id)?.name || (entry as any).rider_name || 'المندوب'}: {approved ? 'اعتماد مقترح' : `رفض مقترح — ${decisionRejectReason === 'سبب آخر' ? (decisionCustomReason.trim() || 'اكتب السبب') : decisionRejectReason}`}</p>
              })}
              <p className="mt-2 text-xs">هذا عرض للقرار فقط؛ لا يغيّر عدد الأوردرات أو مستحقات المندوبين.</p>
            </div>
            <label className="block text-sm font-bold">ملاحظة إدارية (اختيارية)
              <textarea value={decisionNote} onChange={event => setDecisionNote(event.target.value)} rows={2} placeholder="توضيح عند الحاجة" className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-2.5" />
            </label>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white p-3 sm:px-5">
              <button type="button" onClick={() => setDecisionInvoice(null)} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-black">إغلاق</button>
              <span className="rounded-xl bg-teal-100 px-4 py-3 text-sm font-black text-teal-900">تجربة عرض فقط — الحفظ غير مفعل</span>
            </div>
          </section>
        </div>
      )}

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
