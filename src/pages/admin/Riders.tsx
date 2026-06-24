import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Edit, Eye, Calendar, AlertCircle, CheckCircle2, ShieldAlert, Save, PlusCircle } from 'lucide-react'
import LeavePermissionModal from '../../components/LeavePermissionModal'
import Modal from '../../components/Modal'
import { Rider, Branch } from '../../lib/types'
import { getRiders, getBranches } from '../../lib/delivery'
import { getOperationalPeriod } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'

type ActionForm = {
  action_type: 'notice' | 'deduction_request' | 'reward_request' | 'shift_note'
  severity: 'low' | 'medium' | 'high' | 'critical'
  incident_at: string
  summary: string
  requested_amount: string
}

const initialActionForm = (): ActionForm => ({
  action_type: 'notice',
  severity: 'medium',
  incident_at: new Date().toISOString().slice(0, 16),
  summary: '',
  requested_amount: '',
})


type EditForm = {
  name: string
  username: string
  phone: string
  branch_id: string
  branch_name: string
  level: string
  hourly_rate: string
  order_rate: string
  trip_rate: string
  monthly_incentive_base: string
  weekly_day_off: string
  status: 'active' | 'inactive' | 'suspended'
  notes: string
}

type RiderScheduleRow = {
  id: string
  day_name_ar?: string | null
  day_name?: string | null
  day_of_week?: number | null
  day_order?: number | null
  shift_start?: string | null
  shift_end?: string | null
  start_time?: string | null
  end_time?: string | null
  branch_name?: string | null
  status?: string | null
  is_day_off?: boolean | null
}

type RiderScheduleExceptionRow = {
  id: string
  exception_type?: string | null
  exception_date?: string | null
  day_name_ar?: string | null
  day_order?: number | null
  shift_start?: string | null
  shift_end?: string | null
  branch_name?: string | null
  is_day_off?: boolean | null
  reason?: string | null
  notes?: string | null
  status?: string | null
}

type ScheduleExceptionForm = {
  exception_type: 'one_day' | 'weekly' | 'date_range'
  exception_date: string
  day_name_ar: string
  branch_id: string
  branch_name: string
  shift_start: string
  shift_end: string
  is_day_off: boolean
  active_from: string
  active_until: string
  reason: string
  notes: string
}

type PerformanceSummary = {
  ordersTotal: number
  delivered: number
  failed: number
  review: number
  multiplier: number
  duplicate: number
  tripsTotal: number
  approvedTrips: number
  pendingTrips: number
  actionsPending: number
  actionsApproved: number
}

const dayNames = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
const dayOrderMap: Record<string, number> = {
  'السبت': 1,
  'الأحد': 2,
  'الاحد': 2,
  'الاثنين': 3,
  'الإثنين': 3,
  'الأثنين': 3,
  'الثلاثاء': 4,
  'الأربعاء': 5,
  'الاربعاء': 5,
  'الخميس': 6,
  'الجمعة': 7,
}

function getDayOrder(day?: string | null) {
  if (!day) return 99
  return dayOrderMap[String(day).trim()] ?? 99
}

function toTimeInput(value?: string | null) {
  return value ? String(value).slice(0, 5) : ''
}

function initialExceptionForm(rider?: Rider | null, branches: Branch[] = []): ScheduleExceptionForm {
  const today = new Date().toISOString().slice(0, 10)
  const branch = rider?.branch_id ? branches.find(b => b.id === rider.branch_id) : undefined
  return {
    exception_type: 'one_day',
    exception_date: today,
    day_name_ar: 'السبت',
    branch_id: rider?.branch_id || '',
    branch_name: branch?.name || (rider as any)?.branch_name || '',
    shift_start: '09:00',
    shift_end: '17:00',
    is_day_off: false,
    active_from: today,
    active_until: today,
    reason: '',
    notes: '',
  }
}

function riderToEditForm(rider: Rider): EditForm {
  return {
    name: rider.name || '',
    username: rider.username || '',
    phone: rider.phone || '',
    branch_id: rider.branch_id || '',
    branch_name: (rider as any).branch_name || '',
    level: rider.level || 'normal',
    hourly_rate: String(rider.hourly_rate ?? 0),
    order_rate: String(rider.order_rate ?? 0),
    trip_rate: String(rider.trip_rate ?? 0),
    monthly_incentive_base: String(rider.monthly_incentive_base ?? 0),
    weekly_day_off: rider.weekly_day_off || '',
    status: rider.status || 'active',
    notes: rider.notes || '',
  }
}

function toNumber(value: string) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export default function Riders() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)
  const [selectedRider, setSelectedRider] = useState<{id: string, branchId: string} | null>(null)
  const [actionRider, setActionRider] = useState<Rider | null>(null)
  const [actionForm, setActionForm] = useState<ActionForm>(initialActionForm())
  const [savingAction, setSavingAction] = useState(false)
  const [riders, setRiders] = useState<Rider[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [editRider, setEditRider] = useState<Rider | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [performanceRider, setPerformanceRider] = useState<Rider | null>(null)
  const [performanceSummary, setPerformanceSummary] = useState<PerformanceSummary | null>(null)
  const [loadingPerformance, setLoadingPerformance] = useState(false)
  const [scheduleRider, setScheduleRider] = useState<Rider | null>(null)
  const [scheduleRows, setScheduleRows] = useState<RiderScheduleRow[]>([])
  const [scheduleExceptions, setScheduleExceptions] = useState<RiderScheduleExceptionRow[]>([])
  const [showExceptionForm, setShowExceptionForm] = useState(false)
  const [exceptionForm, setExceptionForm] = useState<ScheduleExceptionForm>(initialExceptionForm())
  const [savingException, setSavingException] = useState(false)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        const [ridersData, branchesData] = await Promise.allSettled([
          getRiders(),
          getBranches()
        ])
        if (ridersData.status === 'fulfilled') {
          setRiders(ridersData.value)
        }
        if (branchesData.status === 'fulfilled') {
          setBranches(branchesData.value)
        }
      } catch (error) {
        console.error(error)
        toast.error('فشل تحميل بيانات الدليفري')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const filteredRiders = riders.filter(r =>
    r.name?.includes(search) || r.username?.toLowerCase().includes(search.toLowerCase()) || r.branch_id?.includes(search)
  )

  function getBranchName(branchId: string | null): string {
    if (!branchId) return 'غير محدد'
    const branch = branches.find(b => b.id === branchId)
    return branch?.name || branchId
  }


  function openEditModal(rider: Rider) {
    setEditRider(rider)
    setEditForm(riderToEditForm(rider))
  }

  async function saveEditRider() {
    if (!editRider || !editForm) return
    if (!editForm.name.trim()) {
      toast.error('اسم الدليفري مطلوب')
      return
    }
    if (!editForm.username.trim()) {
      toast.error('Username مطلوب')
      return
    }

    const branch = branches.find(b => b.id === editForm.branch_id)
    try {
      setSavingEdit(true)
      const payload = {
        name: editForm.name.trim(),
        username: editForm.username.trim().toUpperCase(),
        phone: editForm.phone.trim() || null,
        branch_id: editForm.branch_id || null,
        branch_name: branch?.name || editForm.branch_name || null,
        level: editForm.level,
        hourly_rate: toNumber(editForm.hourly_rate),
        order_rate: toNumber(editForm.order_rate),
        trip_rate: toNumber(editForm.trip_rate),
        monthly_incentive_base: toNumber(editForm.monthly_incentive_base),
        weekly_day_off: editForm.weekly_day_off || null,
        status: editForm.status,
        active: editForm.status === 'active',
        notes: editForm.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('riders').update(payload).eq('id', editRider.id)
      if (error) throw error
      toast.success('تم تعديل بيانات الدليفري')
      setRiders(prev => prev.map(r => r.id === editRider.id ? { ...r, ...(payload as any) } : r))
      setEditRider(null)
      setEditForm(null)
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || 'فشل تعديل بيانات الدليفري')
    } finally {
      setSavingEdit(false)
    }
  }

  async function openPerformanceModal(rider: Rider) {
    setPerformanceRider(rider)
    setPerformanceSummary(null)
    setLoadingPerformance(true)
    try {
      const period = getOperationalPeriod(new Date())
      const [ordersRes, tripsRes, actionsRes] = await Promise.all([
        supabase
          .from('delivery_orders')
          .select('id,status,review_status,is_multiplier_order,order_multiplier,is_duplicate_invoice,duplicate_warning,duplicate_review_status,delivery_date,created_at')
          .eq('rider_id', rider.id)
          .gte('delivery_date', period.start)
          .lte('delivery_date', period.end),
        supabase
          .from('internal_trips')
          .select('id,status,trip_date,created_at')
          .eq('rider_id', rider.id)
          .gte('trip_date', period.start)
          .lte('trip_date', period.end),
        supabase
          .from('rider_shift_actions')
          .select('id,review_status,incident_at,action_type')
          .eq('rider_id', rider.id)
          .gte('incident_at', `${period.start}T00:00:00`)
          .lte('incident_at', `${period.end}T23:59:59`),
      ])

      const orders = ordersRes.error ? [] : ((ordersRes.data || []) as any[])
      const trips = tripsRes.error ? [] : ((tripsRes.data || []) as any[])
      const actions = actionsRes.error ? [] : ((actionsRes.data || []) as any[])
      if (ordersRes.error) console.warn('orders performance error', ordersRes.error)
      if (tripsRes.error) console.warn('trips performance error', tripsRes.error)
      if (actionsRes.error) console.warn('actions performance error', actionsRes.error)

      setPerformanceSummary({
        ordersTotal: orders.length,
        delivered: orders.filter(o => ['delivered', 'completed'].includes(o.status)).length,
        failed: orders.filter(o => o.status === 'failed' || o.is_countable === false).length,
        review: orders.filter(o => ['pending', 'pending_reconciliation', 'pending_review'].includes(o.review_status) || o.needs_review).length,
        multiplier: orders.filter(o => o.is_multiplier_order || Number(o.order_multiplier || 1) > 1).length,
        duplicate: orders.filter(o => o.is_duplicate_invoice || o.duplicate_warning || o.duplicate_review_status === 'pending').length,
        tripsTotal: trips.length,
        approvedTrips: trips.filter(t => ['approved', 'completed'].includes(t.status)).length,
        pendingTrips: trips.filter(t => ['pending_approval', 'pending'].includes(t.status)).length,
        actionsPending: actions.filter(a => String(a.review_status || '').includes('pending')).length,
        actionsApproved: actions.filter(a => String(a.review_status || '').includes('approved')).length,
      })
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || 'فشل تحميل أداء الدليفري')
    } finally {
      setLoadingPerformance(false)
    }
  }
  void openPerformanceModal

  async function openScheduleModal(rider: Rider) {
    setScheduleRider(rider)
    setScheduleRows([])
    setScheduleExceptions([])
    setShowExceptionForm(false)
    setExceptionForm(initialExceptionForm(rider, branches))
    setLoadingSchedule(true)
    try {
      const { data, error } = await supabase
        .from('rider_schedules')
        .select('*')
        .eq('rider_id', rider.id)
      if (error) throw error
      const rows = ((data || []) as any[]).map((row) => ({
        id: row.id,
        day_name_ar: row.day_name_ar || row.day_name,
        day_name: row.day_name,
        day_of_week: row.day_of_week ?? getDayOrder(row.day_name_ar || row.day_name),
        day_order: row.day_order ?? row.day_of_week ?? getDayOrder(row.day_name_ar || row.day_name),
        shift_start: row.shift_start || row.start_time,
        shift_end: row.shift_end || row.end_time,
        start_time: row.start_time,
        end_time: row.end_time,
        branch_name: row.branch_name || (rider as any).branch_name || getBranchName(rider.branch_id),
        status: row.status || 'active',
        is_day_off: !!row.is_day_off,
      })).sort((a, b) => (a.day_order ?? getDayOrder(a.day_name_ar || a.day_name)) - (b.day_order ?? getDayOrder(b.day_name_ar || b.day_name)))
      setScheduleRows(rows)

      const { data: exceptionsData, error: exceptionsError } = await supabase
        .from('rider_schedule_exceptions_active_view')
        .select('*')
        .eq('rider_id', rider.id)
      if (exceptionsError) {
        console.warn('exceptions load error', exceptionsError)
        setScheduleExceptions([])
      } else {
        const exceptions = ((exceptionsData || []) as any[]).map(row => ({
          id: row.id,
          exception_type: row.exception_type,
          exception_date: row.exception_date,
          day_name_ar: row.day_name_ar,
          day_order: row.day_order ?? getDayOrder(row.day_name_ar),
          shift_start: row.shift_start,
          shift_end: row.shift_end,
          branch_name: row.branch_name,
          is_day_off: !!row.is_day_off,
          reason: row.reason,
          notes: row.notes,
          status: row.status,
        })).sort((a, b) => String(a.exception_date || '').localeCompare(String(b.exception_date || '')) || (a.day_order ?? 99) - (b.day_order ?? 99))
        setScheduleExceptions(exceptions)
      }
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || 'فشل تحميل مواعيد الدليفري')
    } finally {
      setLoadingSchedule(false)
    }
  }

  function updateExceptionForm(patch: Partial<ScheduleExceptionForm>) {
    setExceptionForm(prev => ({ ...prev, ...patch }))
  }

  async function saveScheduleException() {
    if (!scheduleRider) return
    if (!exceptionForm.is_day_off && (!exceptionForm.shift_start || !exceptionForm.shift_end)) {
      toast.error('وقت البداية والنهاية مطلوبان للموعد المتغير')
      return
    }
    if (!exceptionForm.reason.trim()) {
      toast.error('سبب الموعد الاستثنائي مطلوب')
      return
    }

    const branch = branches.find(b => b.id === exceptionForm.branch_id)
    try {
      setSavingException(true)
      const reporter = await getReporter()
      const payload = {
        rider_id: scheduleRider.id,
        branch_id: exceptionForm.branch_id || scheduleRider.branch_id || null,
        rider_name: scheduleRider.name,
        branch_name: branch?.name || exceptionForm.branch_name || (scheduleRider as any).branch_name || getBranchName(scheduleRider.branch_id),
        exception_type: exceptionForm.exception_type,
        exception_date: exceptionForm.exception_type === 'one_day' ? exceptionForm.exception_date || null : null,
        day_name_ar: exceptionForm.exception_type !== 'one_day' ? exceptionForm.day_name_ar : null,
        day_of_week: exceptionForm.exception_type !== 'one_day' ? getDayOrder(exceptionForm.day_name_ar) : null,
        shift_start: exceptionForm.is_day_off ? null : exceptionForm.shift_start,
        shift_end: exceptionForm.is_day_off ? null : exceptionForm.shift_end,
        is_day_off: exceptionForm.is_day_off,
        active_from: exceptionForm.exception_type === 'date_range' ? exceptionForm.active_from || null : null,
        active_until: exceptionForm.exception_type === 'date_range' ? exceptionForm.active_until || null : null,
        reason: exceptionForm.reason.trim(),
        notes: exceptionForm.notes.trim() || null,
        status: 'active',
        created_by_name: reporter.name,
        created_by: reporter.authUserId,
      }
      const { data, error } = await supabase
        .from('rider_schedule_exceptions')
        .insert(payload as any)
        .select('*')
        .single()
      if (error) throw error
      toast.success('تم حفظ الموعد الاستثنائي')
      setScheduleExceptions(prev => ([...prev, {
        id: (data as any)?.id || crypto.randomUUID(),
        exception_type: payload.exception_type,
        exception_date: payload.exception_date,
        day_name_ar: payload.day_name_ar,
        day_order: payload.day_of_week ?? undefined,
        shift_start: payload.shift_start,
        shift_end: payload.shift_end,
        branch_name: payload.branch_name,
        is_day_off: payload.is_day_off,
        reason: payload.reason,
        notes: payload.notes,
        status: 'active',
      }]).sort((a, b) => String(a.exception_date || '').localeCompare(String(b.exception_date || '')) || (a.day_order ?? 99) - (b.day_order ?? 99)))
      setShowExceptionForm(false)
      setExceptionForm(initialExceptionForm(scheduleRider, branches))
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || 'فشل حفظ الموعد الاستثنائي')
    } finally {
      setSavingException(false)
    }
  }

  function updateScheduleRow(id: string, patch: Partial<RiderScheduleRow>) {
    setScheduleRows(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row))
  }

  async function saveScheduleRows() {
    if (!scheduleRider) return
    try {
      setSavingSchedule(true)
      for (const row of scheduleRows) {
        const { error } = await supabase
          .from('rider_schedules')
          .update({
            shift_start: row.shift_start || null,
            shift_end: row.shift_end || null,
            start_time: row.shift_start || null,
            end_time: row.shift_end || null,
            branch_name: row.branch_name || (scheduleRider as any).branch_name || getBranchName(scheduleRider.branch_id),
            status: row.status || 'active',
            is_day_off: !!row.is_day_off,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
        if (error) throw error
      }
      toast.success('تم حفظ المواعيد')
      setScheduleRider(null)
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || 'فشل حفظ المواعيد')
    } finally {
      setSavingSchedule(false)
    }
  }

  function openActionModal(rider: Rider) {
    setActionRider(rider)
    setActionForm(initialActionForm())
  }

  async function getReporter() {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) return { name: 'مسئول الشيفت', role: 'shift_manager', authUserId: null as string | null }
    const { data } = await supabase
      .from('user_profiles')
      .select('display_name, username, role, auth_user_id')
      .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle()
    return {
      name: (data as any)?.display_name || (data as any)?.username || user.email || 'مسئول الشيفت',
      role: (data as any)?.role || 'shift_manager',
      authUserId: user.id,
    }
  }

  async function submitRiderAction() {
    if (!actionRider) return
    if (!actionForm.summary.trim() || actionForm.summary.trim().length < 10) {
      toast.error('لازم تكتب ملخص واضح للموقف لا يقل عن 10 حروف')
      return
    }
    if ((actionForm.action_type === 'deduction_request' || actionForm.action_type === 'reward_request') && actionForm.requested_amount && Number(actionForm.requested_amount) < 0) {
      toast.error('القيمة لا يمكن أن تكون سالبة')
      return
    }

    try {
      setSavingAction(true)
      const reporter = await getReporter()
      const period = getOperationalPeriod(new Date(actionForm.incident_at || new Date()))
      const branchName = (actionRider as any).branch_name || getBranchName(actionRider.branch_id)
      const { error } = await supabase.from('rider_shift_actions').insert({
        rider_id: actionRider.id,
        rider_name: actionRider.name,
        branch_id: actionRider.branch_id || null,
        branch_name: branchName,
        action_type: actionForm.action_type,
        severity: actionForm.severity,
        incident_at: new Date(actionForm.incident_at).toISOString(),
        shift_date: new Date(actionForm.incident_at).toISOString().slice(0, 10),
        summary: actionForm.summary.trim(),
        requested_amount: actionForm.requested_amount ? Number(actionForm.requested_amount) : null,
        requested_by_auth_user_id: reporter.authUserId,
        requested_by_name: reporter.name,
        requested_by_role: reporter.role,
        review_status: 'pending_general_manager',
        cycle_start: period.start,
        cycle_end: period.end,
      })
      if (error) throw error
      toast.success('تم تسجيل الموقف وأصبح تحت مراجعة المدير العام')
      setActionRider(null)
      setActionForm(initialActionForm())
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || 'فشل تسجيل الموقف')
    } finally {
      setSavingAction(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-lg font-bold">جاري التحميل...</div>

  return (
    <div className="min-h-screen bg-[#F3F7F8] pb-12">
      <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/admin')} className="rounded-full bg-white/20 p-2 hover:bg-white/30">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-black">إدارة الدليفري</h1>
              <p className="text-sm text-white/80">عرض وإدارة بيانات الدليفري</p>
            </div>
          </div>
          <button onClick={() => navigate('/admin/rider-actions')} className="rounded-xl bg-white/15 px-3 py-2 text-sm font-black hover:bg-white/25">
            مراجعة الخصومات والمكافآت
          </button>
        </div>
      </header>

      <main className="p-4">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute right-3 top-3 text-slate-400" size={20} />
            <input
              className="dawaa-input pr-10"
              placeholder="بحث بالاسم أو Username أو الفرع"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredRiders.map(rider => (
            <div key={rider.id} className="rounded-2xl bg-white p-4 shadow-lg">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="text-lg font-black">{rider.name}</h3>
                  <p className="text-sm text-slate-500">@{rider.username}</p>
                  <p className="text-sm text-slate-500">{getBranchName(rider.branch_id)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${rider.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {rider.status === 'active' ? 'نشط' : 'متوقف'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-slate-500">المستوى</p>
                  <p className="font-bold">{rider.level}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-slate-500">إجازة أسبوعية</p>
                  <p className="font-bold">{rider.weekly_day_off || 'غير محدد'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-slate-500">سعر الساعة</p>
                  <p className="font-bold">{rider.hourly_rate || 0} ج.م</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-slate-500">سعر الأوردر</p>
                  <p className="font-bold">{rider.order_rate || 0} ج.م</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-slate-500">سعر المشوار</p>
                  <p className="font-bold">{rider.trip_rate || 0} ج.م</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-slate-500">الحافز الشهري</p>
                  <p className="font-bold">{rider.monthly_incentive_base || 0} ج.م</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <button
                  onClick={() => openEditModal(rider)}
                  className="rounded-xl border border-slate-300 p-2 text-sm font-bold hover:bg-slate-50 flex items-center justify-center gap-1"
                >
                  <Edit size={16} />
                  تعديل
                </button>
                <button
                  onClick={() => navigate(`/admin/riders/${rider.id}/performance`)}
                  className="rounded-xl border border-slate-300 p-2 text-sm font-bold hover:bg-slate-50 flex items-center justify-center gap-1"
                >
                  <Eye size={16} />
                  تقرير الأداء
                </button>
                <button
                  onClick={() => { openScheduleModal(rider); setSelectedRider({id: rider.id, branchId: rider.branch_id || ''}) }}
                  className="rounded-xl border border-slate-300 p-2 text-sm font-bold hover:bg-slate-50 flex items-center justify-center gap-1"
                >
                  <Calendar size={16} />
                  المواعيد والإذونات
                </button>
                <button
                  onClick={() => navigate('/admin/rider-accounts')}
                  className="rounded-xl bg-[#008E92] p-2 text-sm font-bold text-white hover:bg-[#05777B] flex items-center justify-center gap-1"
                >
                  <AlertCircle size={16} />
                  الأجهزة والحساب
                </button>
                <button
                  onClick={() => openActionModal(rider)}
                  className="rounded-xl bg-amber-500 p-2 text-sm font-black text-white hover:bg-amber-600 flex items-center justify-center gap-1"
                >
                  <ShieldAlert size={16} />
                  إجراءات وملاحظات
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredRiders.length === 0 && !loading && (
          <div className="text-center py-12">
            <CheckCircle2 className="mx-auto text-slate-400 mb-3" size={48} />
            <p className="text-slate-500">لا توجد نتائج</p>
          </div>
        )}
      </main>

      {selectedRider && (
        <LeavePermissionModal
          open={leaveModalOpen}
          onClose={() => { setLeaveModalOpen(false); setSelectedRider(null) }}
          riderId={selectedRider.id}
          branchId={selectedRider.branchId}
        />
      )}

      <Modal
        open={!!editRider && !!editForm}
        onClose={() => { setEditRider(null); setEditForm(null) }}
        title="تعديل بيانات الدليفري"
        subtitle={editRider ? `${editRider.name} • ${(editRider as any).branch_name || getBranchName(editRider.branch_id)}` : ''}
        size="lg"
      >
        {editForm ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">اسم الدليفري *</span>
                <input className="dawaa-input" value={editForm.name} onChange={e => setEditForm(f => f ? ({ ...f, name: e.target.value }) : f)} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">Username *</span>
                <input className="dawaa-input" value={editForm.username} onChange={e => setEditForm(f => f ? ({ ...f, username: e.target.value }) : f)} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">الهاتف</span>
                <input className="dawaa-input" value={editForm.phone} onChange={e => setEditForm(f => f ? ({ ...f, phone: e.target.value }) : f)} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">الفرع</span>
                <select className="dawaa-input" value={editForm.branch_id} onChange={e => setEditForm(f => f ? ({ ...f, branch_id: e.target.value }) : f)}>
                  <option value="">غير محدد</option>
                  {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">المستوى</span>
                <select className="dawaa-input" value={editForm.level} onChange={e => setEditForm(f => f ? ({ ...f, level: e.target.value }) : f)}>
                  <option value="normal">normal</option>
                  <option value="junior">junior</option>
                  <option value="mid">mid</option>
                  <option value="senior">senior</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">الحالة</span>
                <select className="dawaa-input" value={editForm.status} onChange={e => setEditForm(f => f ? ({ ...f, status: e.target.value as EditForm['status'] }) : f)}>
                  <option value="active">نشط</option>
                  <option value="inactive">غير نشط</option>
                  <option value="suspended">موقوف</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">الإجازة الأسبوعية</span>
                <select className="dawaa-input" value={editForm.weekly_day_off} onChange={e => setEditForm(f => f ? ({ ...f, weekly_day_off: e.target.value }) : f)}>
                  <option value="">غير محدد</option>
                  {dayNames.map(day => <option key={day} value={day}>{day}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">سعر الساعة</span>
                <input type="number" min="0" className="dawaa-input" value={editForm.hourly_rate} onChange={e => setEditForm(f => f ? ({ ...f, hourly_rate: e.target.value }) : f)} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">سعر الأوردر</span>
                <input type="number" min="0" className="dawaa-input" value={editForm.order_rate} onChange={e => setEditForm(f => f ? ({ ...f, order_rate: e.target.value }) : f)} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">سعر المشوار</span>
                <input type="number" min="0" className="dawaa-input" value={editForm.trip_rate} onChange={e => setEditForm(f => f ? ({ ...f, trip_rate: e.target.value }) : f)} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-black text-slate-700">الحافز الشهري</span>
                <input type="number" min="0" className="dawaa-input" value={editForm.monthly_incentive_base} onChange={e => setEditForm(f => f ? ({ ...f, monthly_incentive_base: e.target.value }) : f)} />
              </label>
            </div>
            <label className="space-y-1">
              <span className="text-sm font-black text-slate-700">ملاحظات</span>
              <textarea className="dawaa-input min-h-[100px]" value={editForm.notes} onChange={e => setEditForm(f => f ? ({ ...f, notes: e.target.value }) : f)} />
            </label>
            <div className="flex gap-3">
              <button disabled={savingEdit} onClick={saveEditRider} className="flex-1 rounded-2xl bg-[#008E92] p-4 font-black text-white disabled:opacity-60 flex items-center justify-center gap-2">
                <Save size={18} />
                {savingEdit ? 'جاري الحفظ...' : 'حفظ التعديل'}
              </button>
              <button onClick={() => { setEditRider(null); setEditForm(null) }} className="rounded-2xl border border-slate-300 px-5 font-black text-slate-700">
                إلغاء
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!performanceRider}
        onClose={() => setPerformanceRider(null)}
        title="أداء الدليفري"
        subtitle={performanceRider ? `${performanceRider.name} • الدورة الحالية من 26 إلى 25` : ''}
        size="lg"
      >
        {loadingPerformance ? (
          <div className="py-10 text-center font-black text-slate-600">جاري تحميل الأداء...</div>
        ) : performanceSummary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">كل الأوردرات</p><p className="text-2xl font-black">{performanceSummary.ordersTotal}</p></div>
              <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-sm text-emerald-700">مسلمة</p><p className="text-2xl font-black">{performanceSummary.delivered}</p></div>
              <div className="rounded-2xl bg-red-50 p-4"><p className="text-sm text-red-700">فاشلة</p><p className="text-2xl font-black">{performanceSummary.failed}</p></div>
              <div className="rounded-2xl bg-amber-50 p-4"><p className="text-sm text-amber-700">قيد المراجعة</p><p className="text-2xl font-black">{performanceSummary.review}</p></div>
              <div className="rounded-2xl bg-orange-50 p-4"><p className="text-sm text-orange-700">أوردر ×1.5</p><p className="text-2xl font-black">{performanceSummary.multiplier}</p></div>
              <div className="rounded-2xl bg-yellow-50 p-4"><p className="text-sm text-yellow-700">مكررة/مشكوك</p><p className="text-2xl font-black">{performanceSummary.duplicate}</p></div>
              <div className="rounded-2xl bg-sky-50 p-4"><p className="text-sm text-sky-700">كل المشاوير</p><p className="text-2xl font-black">{performanceSummary.tripsTotal}</p></div>
              <div className="rounded-2xl bg-teal-50 p-4"><p className="text-sm text-teal-700">مشاوير معتمدة</p><p className="text-2xl font-black">{performanceSummary.approvedTrips}</p></div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 text-sm font-bold text-slate-700">
              <p>مواقف تحت مراجعة المدير العام: <span className="font-black">{performanceSummary.actionsPending}</span></p>
              <p>مواقف تم اعتمادها: <span className="font-black">{performanceSummary.actionsApproved}</span></p>
              <p className="mt-2 text-xs text-slate-500">الأداء هنا للمتابعة والمراجعة فقط، وليس حساب راتب نهائي.</p>
            </div>
            <button onClick={() => navigate('/admin/reconciliation')} className="w-full rounded-2xl bg-[#008E92] p-3 font-black text-white">
              فتح صفحة المطابقة والتقارير
            </button>
          </div>
        ) : (
          <div className="py-10 text-center font-black text-slate-500">لا توجد بيانات أداء حتى الآن</div>
        )}
      </Modal>

      <Modal
        open={!!scheduleRider}
        onClose={() => setScheduleRider(null)}
        title="مواعيد الدليفري"
        subtitle={scheduleRider ? `${scheduleRider.name} • ${(scheduleRider as any).branch_name || getBranchName(scheduleRider.branch_id)}` : ''}
        size="lg"
      >
        {loadingSchedule ? (
          <div className="py-10 text-center font-black text-slate-600">جاري تحميل المواعيد...</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
              يتم عرض الأيام بترتيب: السبت، الأحد، الاثنين، الثلاثاء، الأربعاء، الخميس، الجمعة. المواعيد الاستثنائية لا تغير الجدول الأساسي وتظهر كتنبيه منفصل.
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-black text-slate-800">الجدول الأسبوعي الأساسي</h3>
              <button
                type="button"
                onClick={() => { setShowExceptionForm(v => !v); setExceptionForm(initialExceptionForm(scheduleRider, branches)) }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#008E92] px-4 py-3 text-sm font-black text-white hover:bg-[#00777A]"
              >
                <PlusCircle size={18} />
                إضافة موعد استثنائي
              </button>
            </div>

            {scheduleRows.length > 0 ? (
              <div className="space-y-3">
                {[...scheduleRows]
                  .sort((a, b) => (a.day_order ?? a.day_of_week ?? getDayOrder(a.day_name_ar || a.day_name)) - (b.day_order ?? b.day_of_week ?? getDayOrder(b.day_name_ar || b.day_name)))
                  .map(row => (
                    <div key={row.id} className="grid gap-2 rounded-2xl border border-slate-200 p-3 md:grid-cols-5">
                      <div className="font-black text-slate-800">{row.day_name_ar || row.day_name || 'يوم غير محدد'}</div>
                      <input type="time" className="dawaa-input" value={toTimeInput(row.shift_start)} onChange={e => updateScheduleRow(row.id, { shift_start: e.target.value })} disabled={!!row.is_day_off} />
                      <input type="time" className="dawaa-input" value={toTimeInput(row.shift_end)} onChange={e => updateScheduleRow(row.id, { shift_end: e.target.value })} disabled={!!row.is_day_off} />
                      <input className="dawaa-input" value={row.branch_name || ''} onChange={e => updateScheduleRow(row.id, { branch_name: e.target.value })} />
                      <label className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 p-2 text-sm font-black">
                        <input type="checkbox" checked={!!row.is_day_off} onChange={e => updateScheduleRow(row.id, { is_day_off: e.target.checked })} />
                        إجازة
                      </label>
                    </div>
                  ))}
                <button disabled={savingSchedule} onClick={saveScheduleRows} className="w-full rounded-2xl bg-[#008E92] p-4 font-black text-white disabled:opacity-60 flex items-center justify-center gap-2">
                  <Save size={18} />
                  {savingSchedule ? 'جاري حفظ المواعيد...' : 'حفظ المواعيد الأساسية'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                  <Calendar className="mx-auto mb-2 text-slate-400" size={42} />
                  <p className="font-black text-slate-700">لا توجد مواعيد أساسية مسجلة لهذا الدليفري</p>
                  <p className="mt-1 text-sm text-slate-500">استخدم صفحة استيراد الجداول لإنشاء المواعيد، أو أضفها من Supabase.</p>
                </div>
                <button onClick={() => navigate('/admin/rider-schedules')} className="w-full rounded-2xl bg-[#008E92] p-3 font-black text-white">
                  فتح صفحة استيراد الجداول
                </button>
              </div>
            )}

            {showExceptionForm ? (
              <div className="rounded-3xl border border-cyan-200 bg-cyan-50/60 p-4 shadow-sm">
                <h3 className="mb-3 text-lg font-black text-slate-900">إضافة موعد استثنائي</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-black text-slate-700">نوع الاستثناء</span>
                    <select className="dawaa-input" value={exceptionForm.exception_type} onChange={e => updateExceptionForm({ exception_type: e.target.value as ScheduleExceptionForm['exception_type'] })}>
                      <option value="one_day">يوم واحد بتاريخ محدد</option>
                      <option value="weekly">متكرر أسبوعيًا</option>
                      <option value="date_range">فترة من تاريخ إلى تاريخ</option>
                    </select>
                  </label>
                  {exceptionForm.exception_type === 'one_day' ? (
                    <label className="space-y-1">
                      <span className="text-sm font-black text-slate-700">تاريخ اليوم</span>
                      <input type="date" className="dawaa-input" value={exceptionForm.exception_date} onChange={e => updateExceptionForm({ exception_date: e.target.value })} />
                    </label>
                  ) : (
                    <label className="space-y-1">
                      <span className="text-sm font-black text-slate-700">اليوم</span>
                      <select className="dawaa-input" value={exceptionForm.day_name_ar} onChange={e => updateExceptionForm({ day_name_ar: e.target.value })}>
                        {dayNames.map(day => <option key={day} value={day}>{day}</option>)}
                      </select>
                    </label>
                  )}
                  {exceptionForm.exception_type === 'date_range' ? (
                    <>
                      <label className="space-y-1">
                        <span className="text-sm font-black text-slate-700">من تاريخ</span>
                        <input type="date" className="dawaa-input" value={exceptionForm.active_from} onChange={e => updateExceptionForm({ active_from: e.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm font-black text-slate-700">إلى تاريخ</span>
                        <input type="date" className="dawaa-input" value={exceptionForm.active_until} onChange={e => updateExceptionForm({ active_until: e.target.value })} />
                      </label>
                    </>
                  ) : null}
                  <label className="space-y-1">
                    <span className="text-sm font-black text-slate-700">الفرع</span>
                    <select className="dawaa-input" value={exceptionForm.branch_id} onChange={e => {
                      const branch = branches.find(b => b.id === e.target.value)
                      updateExceptionForm({ branch_id: e.target.value, branch_name: branch?.name || '' })
                    }}>
                      <option value="">اختر الفرع</option>
                      {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center justify-center gap-2 rounded-2xl bg-white p-3 text-sm font-black">
                    <input type="checkbox" checked={exceptionForm.is_day_off} onChange={e => updateExceptionForm({ is_day_off: e.target.checked })} />
                    هذا اليوم إجازة استثنائية
                  </label>
                  {!exceptionForm.is_day_off ? (
                    <>
                      <label className="space-y-1">
                        <span className="text-sm font-black text-slate-700">من الساعة</span>
                        <input type="time" className="dawaa-input" value={exceptionForm.shift_start} onChange={e => updateExceptionForm({ shift_start: e.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm font-black text-slate-700">إلى الساعة</span>
                        <input type="time" className="dawaa-input" value={exceptionForm.shift_end} onChange={e => updateExceptionForm({ shift_end: e.target.value })} />
                      </label>
                    </>
                  ) : null}
                </div>
                <label className="mt-3 block space-y-1">
                  <span className="text-sm font-black text-slate-700">سبب التغيير *</span>
                  <textarea className="dawaa-input min-h-[90px]" value={exceptionForm.reason} onChange={e => updateExceptionForm({ reason: e.target.value })} placeholder="مثال: تغطية شيفت / ظروف تشغيل / تغيير مؤقت لهذا اليوم" />
                </label>
                <label className="mt-3 block space-y-1">
                  <span className="text-sm font-black text-slate-700">ملاحظات إضافية</span>
                  <textarea className="dawaa-input min-h-[70px]" value={exceptionForm.notes} onChange={e => updateExceptionForm({ notes: e.target.value })} />
                </label>
                <div className="mt-4 flex gap-2">
                  <button disabled={savingException} onClick={saveScheduleException} className="flex-1 rounded-2xl bg-[#008E92] p-3 font-black text-white disabled:opacity-60">
                    {savingException ? 'جاري الحفظ...' : 'حفظ الموعد الاستثنائي'}
                  </button>
                  <button onClick={() => setShowExceptionForm(false)} className="rounded-2xl border border-slate-300 px-5 font-black text-slate-700">
                    إلغاء
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <h3 className="font-black text-slate-800">المواعيد الاستثنائية النشطة</h3>
              {scheduleExceptions.length ? scheduleExceptions.map(ex => (
                <div key={ex.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-950">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{ex.exception_type === 'one_day' ? `تاريخ: ${ex.exception_date || 'غير محدد'}` : `يوم: ${ex.day_name_ar || 'غير محدد'}`}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs">{ex.is_day_off ? 'إجازة' : `${toTimeInput(ex.shift_start)} → ${toTimeInput(ex.shift_end)}`}</span>
                  </div>
                  <p className="mt-1">الفرع: {ex.branch_name || 'غير محدد'}</p>
                  <p className="mt-1 text-amber-800">السبب: {ex.reason || 'غير محدد'}</p>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-500">
                  لا توجد مواعيد استثنائية نشطة لهذا الدليفري.
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!actionRider}
        onClose={() => setActionRider(null)}
        title="تسجيل موقف للدليفري"
        subtitle={actionRider ? `${actionRider.name} • ${(actionRider as any).branch_name || getBranchName(actionRider.branch_id)}` : ''}
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-black text-slate-700">نوع الموقف *</span>
              <select value={actionForm.action_type} onChange={e => setActionForm(f => ({ ...f, action_type: e.target.value as ActionForm['action_type'] }))} className="dawaa-input">
                <option value="notice">لفت نظر</option>
                <option value="deduction_request">طلب خصم</option>
                <option value="reward_request">طلب مكافأة</option>
                <option value="shift_note">ملاحظة شيفت</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-black text-slate-700">درجة الأهمية</span>
              <select value={actionForm.severity} onChange={e => setActionForm(f => ({ ...f, severity: e.target.value as ActionForm['severity'] }))} className="dawaa-input">
                <option value="low">بسيط</option>
                <option value="medium">متوسط</option>
                <option value="high">مهم</option>
                <option value="critical">خطير</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-black text-slate-700">وقت الموقف *</span>
              <input type="datetime-local" value={actionForm.incident_at} onChange={e => setActionForm(f => ({ ...f, incident_at: e.target.value }))} className="dawaa-input" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-black text-slate-700">قيمة مقترحة إن وجدت</span>
              <input type="number" min="0" value={actionForm.requested_amount} onChange={e => setActionForm(f => ({ ...f, requested_amount: e.target.value }))} className="dawaa-input" placeholder="مثال 20" />
            </label>
          </div>
          <label className="space-y-1">
            <span className="text-sm font-black text-slate-700">ملخص الموقف بالتفصيل *</span>
            <textarea value={actionForm.summary} onChange={e => setActionForm(f => ({ ...f, summary: e.target.value }))} className="dawaa-input min-h-[130px]" placeholder="مثال: المندوب تأخر في تسليم أوردر مهم بدون سبب واضح / المندوب رجع صنف ناقص بسرعة وساعد الشيفت..." />
          </label>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
            هذا التسجيل لا يصبح خصم أو مكافأة نهائية إلا بعد مراجعة واعتماد المدير العام.
          </div>
          <button disabled={savingAction} onClick={submitRiderAction} className="w-full rounded-2xl bg-[#008E92] p-4 font-black text-white disabled:opacity-60">
            {savingAction ? 'جاري التسجيل...' : 'تسجيل الموقف تحت المراجعة'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
