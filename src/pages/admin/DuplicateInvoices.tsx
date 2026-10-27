import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Eye, Search, XCircle, CopyCheck } from 'lucide-react'
import { toast } from 'sonner'
import { DeliveryOrder, Rider } from '../../lib/types'
import { approveDuplicateInvoice, getRiders, rejectDuplicateInvoice } from '../../lib/delivery'
import { duplicateReasonLabel, formatCairoDateTime, getOperationalPeriod } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'
import { getRiderSession } from '../../lib/auth'
import { canReviewDuplicatePair, isDuplicateReviewPending, patchCommittedDuplicateOrders } from '../../lib/duplicateInvoiceReviewState'
import CycleSelector from '../../components/CycleSelector'
import OrderDetailsModal from '../../components/OrderDetailsModal'
import OperationsAdminTabs from '../../components/OperationsAdminTabs'

function normalizeInvoice(order: any) {
  return String(order.invoice_number || order.invoice_no || '').trim()
}

function invoiceIdentityKey(order: any): string | null {
  // Match the database's invoice normalizer; never include a date in identity.
  const invoice = normalizeInvoice(order)
    .replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - 0x6f0))
    .replace(/\.0$/, '').replace(/[^0-9A-Za-z-]/g, '')
  const branch = String(order.branch_id || '').trim()
  // An unknown branch cannot be safely matched to another branch's invoice.
  return invoice && branch ? `${branch}:${invoice}` : null
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

const VISIT_GATEWAY_ENABLED = import.meta.env.VITE_DELIVERY_VISIT_GATEWAY_V1_ENABLED === 'true'
const DECISION_REQUEST_TIMEOUT_MS = 20000

async function boundedDecisionRequest<T>(request: PromiseLike<T>, timeoutMs = DECISION_REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('decision_response_timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

type PendingVisit = {
  visit_id: number
  branch_id: string
  invoice_key: string
  rider_id: string
  visit_reason: string
  visit_note: string | null
  visit_status: string
  occurred_at: string
}

export default function DuplicateInvoices() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const loadedPeriodRef = useRef<string | null>(null)
  const loadSequenceRef = useRef(0)
  const decisionRevisionRef = useRef(0)
  // The manager's landing view is an actionable queue, not an archive of old decisions.
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [detailsOrder, setDetailsOrder] = useState<DeliveryOrder | null>(null)
  const [decisionInvoice, setDecisionInvoice] = useState<string | null>(null)
  const [decisionChoice, setDecisionChoice] = useState<'first' | 'second' | 'both' | 'none' | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [decisionRejectReason, setDecisionRejectReason] = useState('')
  const [decisionCustomReason, setDecisionCustomReason] = useState('')
  const [savingPairDecision, setSavingPairDecision] = useState(false)
  const [decisionUncertain, setDecisionUncertain] = useState(false)
  const [decidingOrderId, setDecidingOrderId] = useState<string | null>(null)
  const decidingRef = useRef(false)
  const [pendingVisits, setPendingVisits] = useState<PendingVisit[]>([])
  const [visitsError, setVisitsError] = useState<string | null>(null)
  const [selectedVisit, setSelectedVisit] = useState<PendingVisit | null>(null)
  const [visitEvidence, setVisitEvidence] = useState('')
  const [visitRejection, setVisitRejection] = useState('')
  const [savingVisit, setSavingVisit] = useState(false)

  const selectedFrom = searchParams.get('from') || period.start
  const selectedTo = searchParams.get('to') || period.end

  useEffect(() => {
    const status = searchParams.get('status') as typeof filter | null
    if (status && ['all', 'pending', 'approved', 'rejected'].includes(status)) setFilter(status)
  }, [searchParams])

  useEffect(() => {
    void loadAll()
  }, [selectedFrom, selectedTo])

  async function loadAll() {
    const requestId = ++loadSequenceRef.current
    const revisionAtStart = decisionRevisionRef.current
    const periodKey = `${selectedFrom}:${selectedTo}`
    const isNewPeriod = loadedPeriodRef.current !== periodKey
    try {
      if (isNewPeriod) setLoading(true)
      else setRefreshing(true)
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
        const key = invoiceIdentityKey(order)
        if (!key) return
        invoiceCounts.set(key, (invoiceCounts.get(key) || 0) + 1)
      })

      const duplicateOrders = allOrders.filter(order => {
        const key = invoiceIdentityKey(order)
        return Boolean((order as any).is_duplicate_invoice || (key && (invoiceCounts.get(key) || 0) > 1))
      })

      if (requestId !== loadSequenceRef.current || revisionAtStart !== decisionRevisionRef.current) return

      setOrders(duplicateOrders.sort((a: any, b: any) => String(orderDate(b)).localeCompare(String(orderDate(a)))))
      loadedPeriodRef.current = periodKey
      if (ridersData.status === 'fulfilled') setRiders(ridersData.value)
      if (VISIT_GATEWAY_ENABLED) await loadVisitQueue()
    } catch (error) {
      console.error(error)
      if (requestId === loadSequenceRef.current) {
        if (isNewPeriod) setOrders([])
        toast.error(error instanceof Error ? error.message : 'فشل تحميل بيانات الفواتير المكررة')
      }
    } finally {
      if (requestId === loadSequenceRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  // After a manager decision, fetch only the affected rows. Never block the whole
  // cycle behind two 50,000-row queries or clear the visible list on refresh.
  async function refreshDecidedOrders(orderIds: string[]) {
    const { data, error } = await boundedDecisionRequest(supabase.from('delivery_orders')
      .select('*').in('id', orderIds), 12000)
    if (error || !data || data.length !== orderIds.length) {
      throw new Error('تعذر تحديث التسجيلات بعد حفظ القرار. استخدم تحديث القائمة لاحقًا.')
    }
    const updates = new Map(data.map(row => [String(row.id), row as DeliveryOrder]))
    setOrders(current => current.map(order => updates.get(String(order.id)) || order))
  }

  function applyCommittedSingle(orderId: string, status: 'approved' | 'rejected') {
    decisionRevisionRef.current += 1
    setOrders(current => patchCommittedDuplicateOrders(current, new Map([[orderId, status]])))
  }

  function refreshSingleInBackground(orderId: string) {
    void refreshDecidedOrders([orderId]).catch(error => {
      console.warn('Decision committed but row display refresh was delayed', error)
      toast.warning('القرار محفوظ، لكن تحديث بعض التفاصيل اتأخر.')
    })
  }

  async function loadVisitQueue() {
    const token = getRiderSession().session_token
    const { data, error } = await supabase.rpc('list_delivery_visit_reviews_v1', {
      p_token: token || '', p_limit: 200,
    } as any)
    if (error) {
      setPendingVisits([])
      setVisitsError('تعذر تحميل الزيارات المعلقة بشكل موثوق؛ اعتماد الزيارات متوقف مؤقتًا.')
      return
    }
    setVisitsError(null)
    setPendingVisits((data || []) as PendingVisit[])
  }

  async function decideVisit(decision: 'approved' | 'rejected') {
    if (!selectedVisit || savingVisit || visitEvidence.trim().length < 10 ||
      (decision === 'rejected' && visitRejection.trim().length < 5)) {
      toast.error('اكتب دليل المراجعة (10 حروف على الأقل) وسبب الرفض عند الحاجة')
      return
    }
    if (!window.confirm(`${decision === 'approved' ? 'اعتماد' : 'رفض'} زيارة المندوب للفاتورة ${selectedVisit.invoice_key}؟\nلن تُضاف فاتورة تجارية جديدة، والقرار لا يصرف مستحقات تلقائيًا.`)) return
    setSavingVisit(true)
    try {
      const { error } = await supabase.rpc('review_delivery_visit_v1', {
        p_token: getRiderSession().session_token || '',
        p_event_id: selectedVisit.visit_id,
        p_decision: decision,
        p_evidence_note: visitEvidence.trim(),
        p_rejection_reason: decision === 'rejected' ? visitRejection.trim() : null,
      } as any)
      if (error) throw error
      toast.success('تم تسجيل القرار في سجل مراجعة الزيارات')
      setSelectedVisit(null)
      setVisitEvidence('')
      setVisitRejection('')
      await loadVisitQueue()
    } catch (error) {
      console.error(error)
      toast.error('تعذر حفظ القرار؛ لم نعتبر الزيارة معتمدة')
    } finally {
      setSavingVisit(false)
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
      const key = invoiceIdentityKey(order) || `unresolved:${order.id}`
      const group = map.get(key) || []
      group.push(order)
      map.set(key, group)
    })
    return Array.from(map, ([key, entries]) => ({
      key,
      invoice: normalizeInvoice(entries[0]),
      entries: entries.sort((a, b) => {
        const aTime = new Date(String((a as any).registered_at || (a as any).created_at || 0)).getTime()
        const bTime = new Date(String((b as any).registered_at || (b as any).created_at || 0)).getTime()
        return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime) || String(a.id).localeCompare(String(b.id))
      }),
    })).sort((a, b) => String(orderDate(b.entries[b.entries.length - 1])).localeCompare(String(orderDate(a.entries[a.entries.length - 1]))))
  }, [orders])
  // Every registration in a duplicated invoice must be decidable, including the earliest.
  const reviewableOrders = invoiceGroups.flatMap(group => group.entries)
  const decisionGroup = invoiceGroups.find(group => group.key === decisionInvoice)

  useEffect(() => {
    if (!decisionInvoice) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDecisionInvoice(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [decisionInvoice])

  function openUnifiedDecision(key: string) {
    const group = invoiceGroups.find(item => item.key === key)
    if (!group || !canReviewDuplicatePair(group.entries)) {
      toast.info('القرار الموحد غير متاح لهذه الحالة؛ أكمل مراجعة التسجيل المعلق بشكل فردي')
      return
    }
    setDecisionChoice(null)
    setDecisionNote('')
    setDecisionRejectReason('')
    setDecisionCustomReason('')
    setDecisionUncertain(false)
    setDecisionInvoice(key)
  }

  async function isUnifiedDecisionCommitted(firstId: string, secondId: string, choice: 'first' | 'second' | 'none', timeoutMs = 10000): Promise<boolean> {
    const { data, error } = await boundedDecisionRequest(supabase.from('delivery_orders')
      .select('id,duplicate_review_status,not_countable,needs_review')
      .in('id', [firstId, secondId]), timeoutMs)
    if (error || !data || data.length !== 2) return false
    const byId = new Map(data.map(row => [String(row.id), row]))
    return ([firstId, secondId] as const).every((id, index) => {
      const shouldApprove = (choice === 'first' && index === 0) || (choice === 'second' && index === 1)
      const order = byId.get(id)
      return order?.duplicate_review_status === (shouldApprove ? 'approved' : 'rejected') &&
        order.not_countable === !shouldApprove && order.needs_review === false
    })
  }

  async function refreshCommittedPair(firstId: string, secondId: string) {
    try {
      await refreshDecidedOrders([firstId, secondId])
    } catch (error) {
      console.warn('Pair committed but live row refresh failed', error)
      toast.warning('القرار محفوظ، لكن تحديث العرض اتأخر. اضغط تحديث القائمة عند الحاجة.')
    }
  }

  function applyCommittedPair(firstId: string, secondId: string, firstStatus: string, secondStatus: string) {
    if (!['approved', 'rejected'].includes(firstStatus) || !['approved', 'rejected'].includes(secondStatus)) return
    decisionRevisionRef.current += 1
    const statuses = new Map<string, 'approved' | 'rejected'>([[firstId, firstStatus as 'approved' | 'rejected'], [secondId, secondStatus as 'approved' | 'rejected']])
    setOrders(current => patchCommittedDuplicateOrders(current, statuses))
  }

  // Supabase can commit a transaction before its HTTP response reaches the browser.
  // Small read-only checks let the manager continue as soon as BOTH final states are visible.
  async function observeCommittedPair(firstId: string, secondId: string, choice: 'first' | 'second' | 'none', isFinished: () => boolean) {
    for (const waitMs of [900, 1800, 2700]) {
      await new Promise<void>(resolve => setTimeout(resolve, waitMs))
      if (isFinished()) return null
      try {
        if (await isUnifiedDecisionCommitted(firstId, secondId, choice, 2500)) {
          return {
            first_status: choice === 'first' ? 'approved' : 'rejected',
            second_status: choice === 'second' ? 'approved' : 'rejected',
          }
        }
      } catch {
        // Read-only probe failure must never initiate or repeat a write.
      }
    }
    return null
  }

  async function saveUnifiedDecision() {
    if (savingPairDecision || decidingRef.current || decisionUncertain || !decisionGroup || decisionGroup.entries.length !== 2 || !decisionChoice) return
    if (decisionChoice === 'both') {
      toast.error('اعتماد زيارتين مستقلتين يحتاج مراجعة الزيارات، ولا يمكن احتساب الفاتورة مرتين')
      return
    }
    const rejectionReason = decisionRejectReason === 'سبب آخر' ? decisionCustomReason.trim() : decisionRejectReason.trim()
    if (rejectionReason.length < 5) {
      toast.error('حدد سببًا واضحًا لرفض التسجيل غير المستحق')
      return
    }
    const [first, second] = decisionGroup.entries
    if (decisionGroup.key.startsWith('unresolved:') || !invoiceIdentityKey(first) || invoiceIdentityKey(first) !== invoiceIdentityKey(second)) {
      toast.error('هوية الفاتورة أو الفرع غير محسومة، لا يمكن حفظ قرار موحد')
      return
    }
    const token = getRiderSession().session_token || ''
    if (!window.confirm(`تأكيد القرار النهائي لفاتورة ${decisionGroup.invoice}؟\nسيتم تسجيل قرار كل مندوب وحفظ السبب في سجل المراجعة. لا يمكن التراجع تلقائيًا عن قرار نهائي.`)) return
    let responseReceived = false
    try {
      decidingRef.current = true
      setSavingPairDecision(true)
      const rpc = boundedDecisionRequest(supabase.rpc('review_duplicate_invoice_pair_v1', {
        p_token: token,
        p_first_order_id: String(first.id),
        p_second_order_id: String(second.id),
        p_choice: decisionChoice,
        p_rejection_reason: rejectionReason,
        p_manager_note: decisionNote.trim() || null,
      }), 12000).then(result => {
        if (result.error) throw result.error
        return result.data
      })
      const observed = observeCommittedPair(String(first.id), String(second.id), decisionChoice, () => responseReceived)
      const data = await Promise.race([rpc, observed.then(value => value || rpc)])
      if (!(data as any)?.first_status || !(data as any)?.second_status) throw new Error('لم يتم تأكيد حفظ القرارين')
      responseReceived = true
      applyCommittedPair(String(first.id), String(second.id), (data as any).first_status, (data as any).second_status)
      setDecisionInvoice(null)
      toast.success('تم اعتماد القرار النهائي للتسجيلين بنجاح')
      void refreshCommittedPair(String(first.id), String(second.id))
    } catch (error) {
      responseReceived = true
      console.error(error)
      // A timed-out HTTP response does not imply the PostgreSQL transaction failed.
      // Reconcile both committed order states before ever inviting another write.
      let committed = false
      try {
        committed = await isUnifiedDecisionCommitted(String(first.id), String(second.id), decisionChoice)
      } catch (reconcileError) {
        console.warn('Could not reconcile duplicate decision after request error', reconcileError)
      }
      if (committed) {
        applyCommittedPair(String(first.id), String(second.id), decisionChoice === 'first' ? 'approved' : 'rejected', decisionChoice === 'second' ? 'approved' : 'rejected')
        setDecisionInvoice(null)
        toast.success('القرار محفوظ بالفعل في قاعدة البيانات وتم تأكيده للتسجيلين')
        void refreshCommittedPair(String(first.id), String(second.id))
      } else {
        setDecisionUncertain(true)
        toast.error('لم نتمكن من تأكيد نتيجة الحفظ. لا تعِد الإرسال؛ تحقّق من الحالة أولًا.')
      }
    } finally {
      decidingRef.current = false
      setSavingPairDecision(false)
    }
  }

  async function recheckUnifiedDecision() {
    if (!decisionGroup || decisionGroup.entries.length !== 2 || !decisionChoice || decisionChoice === 'both' || savingPairDecision) return
    setSavingPairDecision(true)
    try {
      const committed = await isUnifiedDecisionCommitted(String(decisionGroup.entries[0].id), String(decisionGroup.entries[1].id), decisionChoice)
      if (committed) {
        applyCommittedPair(String(decisionGroup.entries[0].id), String(decisionGroup.entries[1].id), decisionChoice === 'first' ? 'approved' : 'rejected', decisionChoice === 'second' ? 'approved' : 'rejected')
        setDecisionInvoice(null)
        toast.success('تم التأكد: القرار النهائي محفوظ للتسجيلين')
        void refreshCommittedPair(String(decisionGroup.entries[0].id), String(decisionGroup.entries[1].id))
      } else {
        toast.error('لم يتم إثبات حفظ القرارين. راجع حالة الفاتورة مع الإدارة قبل اتخاذ قرار جديد.')
      }
    } catch {
      toast.error('تعذر التحقق من قاعدة البيانات الآن. لا تعِد اعتماد الفاتورة.')
    } finally {
      setSavingPairDecision(false)
    }
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
  const filteredGroups = invoiceGroups.filter(group => {
    // Pending is a GROUP decision, and a finalized pair must leave the queue.
    if (filter === 'pending' && !group.entries.some(isDuplicateReviewPending)) return false
    return group.entries.some(matchesOrderFilters)
  })

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
      applyCommittedSingle(orderId, 'approved')
      toast.success('تم اعتماد هذا التسجيل فقط')
      refreshSingleInBackground(orderId)
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
      applyCommittedSingle(orderId, 'rejected')
      toast.success('تم رفض هذا التسجيل فقط')
      refreshSingleInBackground(orderId)
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
        <div className="flex items-center justify-end gap-2">
          {refreshing && <span className="text-xs font-bold text-slate-500">جارٍ تحديث القائمة بالخلفية...</span>}
          <button type="button" disabled={refreshing} onClick={() => void loadAll()} className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-black text-teal-800 disabled:opacity-50">تحديث القائمة</button>
        </div>

        {VISIT_GATEWAY_ENABLED && (
          <section className="space-y-3 rounded-3xl border border-teal-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">الزيارات المكررة المعلقة ({pendingVisits.length})</h2>
                <p className="text-xs font-bold text-slate-600">سجل زيارات منفصل عن الفواتير، وبلا احتساب قيمة تجارية ثانية. الطابور يشمل جميع الفترات.</p>
              </div>
              <button type="button" onClick={() => void loadVisitQueue()} className="rounded-xl bg-teal-50 px-3 py-2 text-sm font-black text-teal-800">تحديث الطابور</button>
            </div>
            {visitsError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{visitsError}</p>}
            {!visitsError && pendingVisits.length === 0 && <p className="text-sm font-bold text-slate-500">لا توجد زيارات معلقة في الطابور الحالي.</p>}
            <div className="grid gap-2 md:grid-cols-2">
              {pendingVisits.map(visit => (
                <div key={visit.visit_id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-black text-slate-950">فاتورة {visit.invoice_key} — {riderMap.get(visit.rider_id)?.name || visit.rider_id}</p>
                  <p className="mt-1 text-xs text-slate-500">الفرع: {visit.branch_id} — {formatCairoDateTime(visit.occurred_at)}</p>
                  <p className="mt-2 font-bold text-slate-700">السبب: {duplicateReasonLabel(visit.visit_reason)}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{visit.visit_note || 'بدون ملاحظة إضافية'}</p>
                  <button type="button" onClick={() => { setSelectedVisit(visit); setVisitEvidence(''); setVisitRejection('') }} className="mt-3 rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white">مراجعة الزيارة</button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          الفترة الحالية: <b>{selectedFrom}</b> إلى <b>{selectedTo}</b> — راجع سبب التكرار وملاحظة المندوب إن وجدت، ثم قارن التسجيلات قبل قرار الاعتماد.
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFilter('pending')} className={`rounded-full px-4 py-2 text-sm font-black ${filter === 'pending' ? 'bg-amber-500 text-white' : 'bg-white text-slate-700'}`}>تحتاج قرار ({invoiceGroups.filter(group => group.entries.some(isDuplicateReviewPending)).length} فاتورة)</button>
            <button onClick={() => setFilter('all')} className={`rounded-full px-4 py-2 text-sm font-black ${filter === 'all' ? 'bg-[#008E92] text-white' : 'bg-white text-slate-700'}`}>كل الفواتير والسجل ({invoiceGroups.length})</button>
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
            {orders.length === 0 ? 'مفيش فواتير مكررة في الفترة المختارة' : filter === 'pending' && !searchTerm ? 'تمت مراجعة كل الفواتير المكررة في الدورة دي ✅' : 'مفيش نتائج مطابقة للبحث'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGroups.map(({ key, invoice, entries }) => {
              return (
                <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                    <h2 className="text-lg font-black text-slate-950">فاتورة {invoice}</h2>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{String((entries[0] as any).branch_name || (entries[0] as any).branch_id || 'فرع غير محسوم')}</span>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{entries.length} تسجيلات</span>
                    <span className="text-xs font-bold text-slate-500">ترتيب التسجيلات حسب وقت تسجيلها، وليس تأكيدًا لترتيب التوصيل الفعلي — يمكنك قبول أو رفض أي تسجيل بشكل مستقل</span>
                    {entries.every(entry => !isDuplicateReviewPending(entry)) && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">تم إغلاق المراجعة</span>}
                    {canReviewDuplicatePair(entries) && !key.startsWith('unresolved:') && <button type="button" disabled={savingPairDecision || decidingOrderId !== null} onClick={() => openUnifiedDecision(key)} className="rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white disabled:opacity-40">مراجعة واعتماد قرار الفاتورة</button>}
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

      {VISIT_GATEWAY_ENABLED && selectedVisit && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 p-3" onMouseDown={event => { if (event.target === event.currentTarget && !savingVisit) setSelectedVisit(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="visit-decision-title" className="w-full max-w-xl space-y-4 rounded-3xl bg-white p-5 shadow-2xl">
            <h2 id="visit-decision-title" className="text-xl font-black">مراجعة زيارة — فاتورة {selectedVisit.invoice_key}</h2>
            <p className="text-sm font-bold text-slate-600">المندوب: {riderMap.get(selectedVisit.rider_id)?.name || selectedVisit.rider_id} — {formatCairoDateTime(selectedVisit.occurred_at)}</p>
            <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">اعتماد الزيارة يعني إثبات زيارة فعلية مستقلة فقط، ولا ينشئ فاتورة ثانية أو يمنح مستحقات مالية تلقائيًا.</p>
            <label className="block text-sm font-black">دليل المراجعة (إجباري)
              <textarea value={visitEvidence} onChange={event => setVisitEvidence(event.target.value)} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 p-3" placeholder="ما الدليل على تنفيذ الزيارة أو عدم تنفيذها؟" />
            </label>
            <label className="block text-sm font-black">سبب الرفض (إجباري عند الرفض)
              <textarea value={visitRejection} onChange={event => setVisitRejection(event.target.value)} maxLength={500} rows={2} className="mt-2 w-full rounded-xl border border-slate-200 p-3" placeholder="اكتب سبب رفض هذه الزيارة" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={savingVisit || visitEvidence.trim().length < 10} onClick={() => void decideVisit('approved')} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">اعتماد الزيارة فقط</button>
              <button type="button" disabled={savingVisit || visitEvidence.trim().length < 10 || visitRejection.trim().length < 5} onClick={() => void decideVisit('rejected')} className="rounded-xl bg-rose-100 px-4 py-3 text-sm font-black text-rose-800 disabled:opacity-40">رفض الزيارة</button>
              <button type="button" disabled={savingVisit} onClick={() => setSelectedVisit(null)} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-black">إلغاء</button>
            </div>
          </section>
        </div>
      )}
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
                ['both', 'الاثنان — زيارتان مستقلتان (بانتظار تحقق الحسابات)'],
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
                {!decisionRejectReason && <p className="text-xs font-bold text-rose-700">اختار سبب الرفض بنفسك؛ مش هنفترض سبب تلقائيًا.</p>}
                {decisionRejectReason === 'سبب آخر' && <input value={decisionCustomReason} onChange={event => setDecisionCustomReason(event.target.value)} placeholder="اكتب سبب الرفض" className="w-full rounded-xl border border-slate-200 p-2.5 text-sm" />}
              </fieldset>
            )}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
              {!decisionChoice && <p>اختار قرارًا أولًا لعرض تأثيره على كل مندوب.</p>}
              {decisionChoice && decisionGroup.entries.map((entry, index) => {
                const approved = decisionChoice === 'both' || (decisionChoice === 'first' && index === 0) || (decisionChoice === 'second' && index === 1)
                return <p key={entry.id} className="py-1">{riderMap.get(entry.rider_id)?.name || (entry as any).rider_name || 'المندوب'}: {approved ? 'اعتماد مقترح' : `رفض مقترح — ${decisionRejectReason === 'سبب آخر' ? (decisionCustomReason.trim() || 'اكتب السبب') : (decisionRejectReason || 'سبب الرفض لم يُحدد')}`}</p>
              })}
              {decisionChoice === 'both' && <p className="mt-2 text-xs text-rose-800">لا يمكن حفظ اعتماد زيارتين حتى نتأكد من عدم مضاعفة قيمة الفاتورة في التقارير والمستحقات.</p>}
              <p className="mt-2 text-xs">لن يُحفظ شيء قبل التأكيد. يعتمد الحفظ النهائي على تحقق قاعدة البيانات من هوية الفاتورة وحالة التسجيلين.</p>
            </div>
            <label className="block text-sm font-bold">ملاحظة إدارية (اختيارية)
              <textarea value={decisionNote} onChange={event => setDecisionNote(event.target.value)} rows={2} placeholder="توضيح عند الحاجة" className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-2.5" />
            </label>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white p-3 sm:px-5">
              {decisionUncertain && <p role="alert" className="w-full text-sm font-bold text-amber-900">النتيجة غير مؤكدة بسبب تأخر الاتصال. لا تعِد الحفظ؛ اضغط «تحقق من القرار» لمراجعة الحالة الفعلية.</p>}
              <button type="button" disabled={savingPairDecision} onClick={() => setDecisionInvoice(null)} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-black disabled:opacity-50">إغلاق</button>
              {decisionUncertain && <button type="button" disabled={savingPairDecision} onClick={() => void recheckUnifiedDecision()} className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">تحقق من القرار</button>}
              <button type="button" disabled={savingPairDecision || decisionUncertain || !decisionChoice || decisionChoice === 'both' || (decisionRejectReason === 'سبب آخر' ? decisionCustomReason.trim().length < 5 : decisionRejectReason.trim().length < 5)} onClick={() => void saveUnifiedDecision()} className="rounded-xl bg-teal-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{savingPairDecision ? 'جاري حفظ القرار...' : 'اعتماد القرار النهائي'}</button>
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

