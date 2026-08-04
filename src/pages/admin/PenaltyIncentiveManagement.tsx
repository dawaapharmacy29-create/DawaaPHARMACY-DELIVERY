import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Clock, Gift, ShieldClose, Timer, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { getCurrentSession } from '../../lib/auth'
import type { UserProfile } from '../../lib/types'
import AdminModuleShell from '../../components/AdminModuleShell'
import Modal from '../../components/Modal'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import type { BadgeTone } from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import SearchInput from '../../components/ui/SearchInput'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

type Staff = {
  id: string
  rider_id?: string
  person_name?: string
  display_name: string
  username?: string
  role?: string
  branch_id?: string
  branch_name?: string
  account_status?: string
  rider_status?: string
  searchText?: string
}

type PenaltyIncentiveForm = {
  employeeId: string
  type: 'penalty' | 'reward'
  amount: number
  reason: string
  sourceName: string
  sourceRole: 'customer' | 'doctor' | 'admin' | 'other'
  approve?: boolean
}

type AdjustmentRecord = {
  id: string
  rider_id: string
  rider_name: string | null
  branch_name: string | null
  adjustment_type: 'reward' | 'penalty'
  amount: number
  final_amount: number
  reason: string
  source_person_name: string | null
  source_person_role: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'deferred'
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  cycle_start: string
  cycle_end: string
}

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected' | 'deferred' | 'deductions' | 'rewards'

type ReviewAction = 'approve' | 'edit' | 'double' | 'cancel' | 'defer' | 'reopen'

const penaltyReasons = [
  'تأخر عن ميعاد الحضور بدون تبليغ مدير الفرع',
  'انصراف قبل الميعاد بدون إذن',
  'عدم تسجيل الأوردر في التطبيق',
  'عدم رفع صورة الريسيت',
  'تسجيل فاتورة خطأ',
  'تأخير تسليم أوردر بدون سبب واضح',
  'عدم الالتزام بخط السير',
  'سوء تعامل مع العميل',
  'عدم الرد على اتصال الإدارة',
  'مخالفة تعليمات مدير الفرع',
  'إهمال في تسليم الطلب',
  'عدم تحديث حالة الأوردر',
  'تكرار نفس الخطأ أكثر من مرة',
  'غياب بدون إذن',
  'رفض تنفيذ مشوار بدون سبب مقبول',
]

const rewardReasons = [
  'التزام كامل بالمواعيد',
  'تسليم عدد أوردرات عالي',
  'مساعدة فرع آخر وقت الضغط',
  'حل مشكلة عميل بشكل ممتاز',
  'الالتزام بتسجيل كل الأوردرات بدقة',
  'تغطية شيفت إضافي',
  'أداء مميز خلال الشهر',
  'عدم وجود أي أخطاء خلال الفترة',
  'سرعة استجابة ممتازة',
  'تعاون مميز مع الفريق',
]

const num = (value: unknown) => Number(value || 0) || 0
const formatMoney = (val: number) => `${num(val).toFixed(2)} ج.م`

const STATUS_LABEL: Record<string, string> = {
  approved: 'معتمد',
  pending: 'معلّق',
  rejected: 'ملغي',
  cancelled: 'ملغي',
  deferred: 'مؤجل',
}

const STATUS_TONE: Record<string, BadgeTone> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
  cancelled: 'danger',
  deferred: 'neutral',
}

const REVIEW_ACTION_LABEL: Record<string, string> = {
  approve: 'اعتماد السجل',
  edit: 'تعديل واعتماد',
  double: 'مضاعفة المبلغ',
  cancel: 'إلغاء السجل',
  defer: 'تأجيل السجل',
  reopen: 'إعادة للمراجعة',
}

const ACTIONS_REQUIRING_CONFIRM = new Set(['cancel', 'defer', 'double'])

export default function PenaltyIncentiveManagement() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quick = searchParams.get('quick') === '1'
  const staffIdParam = searchParams.get('staffId')

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(quick)
  const [search, setSearch] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [records, setRecords] = useState<AdjustmentRecord[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [branchFilter, setBranchFilter] = useState<'all' | 'alshamy' | 'shukri'>('all')
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<AdjustmentRecord | null>(null)
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null)
  const [actionType, setActionType] = useState<'penalty' | 'reward'>('penalty')
  const [actionAmount, setActionAmount] = useState(0)
  const [actionReason, setActionReason] = useState('')
  const [actionSourceRole, setActionSourceRole] = useState<'customer' | 'doctor' | 'admin' | 'other'>('admin')
  const [actionSourceName, setActionSourceName] = useState('')
  const [managerNote, setManagerNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState<PenaltyIncentiveForm>({
    employeeId: staffIdParam || '',
    type: 'penalty',
    amount: 0,
    reason: '',
    sourceName: '',
    sourceRole: 'admin',
  })

  const [actionSaving, setActionSaving] = useState(false)

  const [confirmAction, setConfirmAction] = useState(false)

  const canManage = useMemo(() => {
    if (!profile) return false
    const managerRoles = ['admin', 'general_manager', 'operations_manager', 'branches_manager', 'branch_manager', 'shift_manager']
    return managerRoles.includes(profile.role || '')
  }, [profile])

  async function loadData() {
    setLoading(true)
    try {
      const session = await getCurrentSession()
      if (!session) {
        navigate('/login')
        return
      }

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      setProfile(userProfile as UserProfile)

      // Get all active staff from staff_accounts_full_view
      const { data: staffData, error: staffError } = await supabase
        .from('staff_accounts_full_view')
        .select('account_id, rider_id, person_name, display_name, username, role, branch_id, branch_name, account_status, rider_status')
        .eq('account_status', 'active')
        .in('role', ['rider', 'branch_manager', 'branches_manager', 'general_manager', 'operations_manager'])
        .order('person_name', { ascending: true })

      if (staffData) {
        const processedStaff = staffData.map(s => ({
          id: s.account_id,
          rider_id: s.rider_id,
          person_name: s.person_name,
          display_name: s.display_name,
          username: s.username,
          role: s.role,
          branch_id: s.branch_id,
          branch_name: s.branch_name || 'بدون فرع',
          account_status: s.account_status,
          rider_status: s.rider_status,
          searchText: `${s.person_name || ''} ${s.display_name || ''} ${s.username || ''} ${s.branch_name || ''}`.toLowerCase()
        }))
        setStaffList(processedStaff as Staff[])
      }

      const cycleStart = new Date()
      cycleStart.setDate(cycleStart.getDate() >= 26 ? 26 : 26 - 30)
      const cycleEnd = new Date(cycleStart)
      cycleEnd.setMonth(cycleEnd.getMonth() + 1)
      cycleEnd.setDate(25)

      const cycleStartStr = cycleStart.toISOString().slice(0, 10)
      const cycleEndStr = cycleEnd.toISOString().slice(0, 10)

      const { data: recordsData } = await supabase
        .from('rider_adjustments')
        .select('*')
        .gte('cycle_start', cycleStartStr)
        .lte('cycle_end', cycleEndStr)
        .order('created_at', { ascending: false })
        .limit(50)

      setRecords((recordsData as AdjustmentRecord[]) || [])
    } catch (error: any) {
      console.warn('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (quick && !showModal) {
      setShowModal(true)
    }
  }, [quick])

  const filteredStaff = staffList.filter(s =>
    s.searchText?.includes(staffSearch.toLowerCase())
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.employeeId || form.amount <= 0 || !form.reason.trim()) {
      toast.error('الرجاء ملء جميع الحقول')
      return
    }

    setSubmitting(true)
    try {
      const cycleStart = new Date()
      cycleStart.setDate(cycleStart.getDate() >= 26 ? 26 : 26 - 30)
      const cycleEnd = new Date(cycleStart)
      cycleEnd.setMonth(cycleEnd.getMonth() + 1)
      cycleEnd.setDate(25)

      const cycleStartStr = cycleStart.toISOString().slice(0, 10)
      const cycleEndStr = cycleEnd.toISOString().slice(0, 10)

      const selectedStaff = staffList.find(s => s.id === form.employeeId)

      const payload = {
        rider_id: selectedStaff?.rider_id || form.employeeId,
        rider_name: selectedStaff ? (selectedStaff.person_name || selectedStaff.display_name || selectedStaff.username) : null,
        branch_name: selectedStaff?.branch_name || null,
        cycle_start: cycleStartStr,
        cycle_end: cycleEndStr,
        adjustment_type: form.type,
        amount: form.amount,
        reason: form.reason,
        source_person_name: form.sourceName.trim() || null,
        source_person_role: form.sourceRole || null,
        status: 'pending',
        created_by: profile?.id,
      }

      const { error } = await supabase.from('rider_adjustments').insert(payload)
      if (error) throw error

      toast.success('تم إرسال الطلب للمراجعة')

      setForm({
        employeeId: '',
        type: 'penalty',
        amount: 0,
        reason: '',
        sourceName: '',
        sourceRole: 'admin',
      })
      setShowModal(false)

      await loadData()
    } catch (error: any) {
      toast.error(error?.message || 'فشل حفظ السجل')
    } finally {
      setSubmitting(false)
    }
  }

  function initializeReviewState(record: AdjustmentRecord) {
    setActionType(record.adjustment_type)
    setActionAmount(Math.abs(Number(record.amount ?? record.final_amount ?? 0)))
    setActionReason(record.reason || '')
    setActionSourceRole((record.source_person_role as any) || 'admin')
    setActionSourceName(record.source_person_name || '')
    setManagerNote('')
  }

  function openReviewModal(record: AdjustmentRecord, action: ReviewAction) {
    setSelectedRecord(record)
    setReviewAction(action)
    initializeReviewState(record)
    setReviewModalOpen(true)
  }

  function closeReviewModal() {
    setReviewModalOpen(false)
    setSelectedRecord(null)
    setReviewAction(null)
    setConfirmAction(false)
  }

  async function updateAdjustment(payload: Record<string, unknown>) {
    const { error } = await supabase.from('rider_adjustments').update(payload).eq('id', selectedRecord?.id)
    return error
  }

  function requestReviewSubmit() {
    if (!selectedRecord || !reviewAction) return

    const requiresNote = ['double', 'cancel', 'defer'].includes(reviewAction)
    if (requiresNote && !managerNote.trim()) {
      toast.error('اكتب ملاحظة المدير العام')
      return
    }

    if (reviewAction === 'edit' && (actionAmount <= 0 || !actionReason.trim())) {
      toast.error('تأكد من صحة النوع والمبلغ والسبب')
      return
    }

    if (ACTIONS_REQUIRING_CONFIRM.has(reviewAction)) {
      setConfirmAction(true)
      return
    }

    void handleReviewSubmit()
  }

  async function handleReviewSubmit() {
    if (!selectedRecord || !reviewAction) return

    setActionSaving(true)
    try {
      const payload: Record<string, unknown> = {
        reviewed_by: profile?.id,
        reviewed_at: new Date().toISOString(),
      }

      if (managerNote.trim()) {
        payload.review_note = managerNote.trim()
        payload.manager_note = managerNote.trim()
      }

      switch (reviewAction) {
        case 'approve':
          payload.status = 'approved'
          break
        case 'edit':
          payload.status = 'approved'
          payload.adjustment_type = actionType
          payload.amount = actionAmount
          payload.reason = actionReason.trim()
          payload.source_person_role = actionSourceRole
          payload.source_person_name = actionSourceName.trim() || null
          break
        case 'double':
          payload.status = 'approved'
          payload.amount = Math.abs(Number(selectedRecord.amount ?? selectedRecord.final_amount ?? 0)) * 2
          break
        case 'cancel':
          payload.status = 'cancelled'
          break
        case 'defer':
          payload.status = 'deferred'
          break
        case 'reopen':
          payload.status = 'pending'
          break
      }

      const error = await updateAdjustment(payload)
      if (error) throw error

      const successMessage = reviewAction === 'approve'
        ? 'تم اعتماد السجل'
        : reviewAction === 'edit'
          ? 'تم تعديل السجل واعتماده'
          : reviewAction === 'double'
            ? 'تم مضاعفة المبلغ واعتماده'
            : reviewAction === 'cancel'
              ? 'تم إلغاء السجل'
              : reviewAction === 'defer'
                ? 'تم تأجيل السجل'
                : 'أعيد السجل للمراجعة'

      toast.success(successMessage)
      closeReviewModal()
      await loadData()
    } catch (error: any) {
      toast.error(error?.message || 'فشل حفظ قرار المراجعة')
    } finally {
      setActionSaving(false)
    }
  }

  const summary = useMemo(() => ({
    pending: records.filter(r => r.status === 'pending').length,
    approved: records.filter(r => r.status === 'approved').length,
    rejected: records.filter(r => ['rejected', 'cancelled'].includes(r.status || '')).length,
    deferred: records.filter(r => r.status === 'deferred').length,
    penaltiesApprovedTotal: records.filter(r => r.status === 'approved' && r.adjustment_type === 'penalty').reduce((sum, r) => sum + Math.abs(Number((r.final_amount ?? r.amount) || 0)), 0),
    rewardsApprovedTotal: records.filter(r => r.status === 'approved' && r.adjustment_type === 'reward').reduce((sum, r) => sum + Math.abs(Number((r.final_amount ?? r.amount) || 0)), 0),
  }), [records])

  const filteredRecords = records.filter((record) => {
    const normalizedStatus = String(record.status || '').toLowerCase()
    const matchesStatus =
      filter === 'all' ||
      (filter === 'pending' && normalizedStatus === 'pending') ||
      (filter === 'approved' && normalizedStatus === 'approved') ||
      (filter === 'rejected' && ['rejected', 'cancelled'].includes(normalizedStatus)) ||
      (filter === 'deferred' && normalizedStatus === 'deferred') ||
      (filter === 'deductions' && record.adjustment_type === 'penalty') ||
      (filter === 'rewards' && record.adjustment_type === 'reward')

    const branchName = (record.branch_name || '').toLowerCase()
    const matchesBranch =
      branchFilter === 'all' ||
      (branchFilter === 'alshamy' && branchName.includes('الشامي')) ||
      (branchFilter === 'shukri' && branchName.includes('شكري'))

    const q = search.trim().toLowerCase()
    const matchesSearch =
      !q ||
      (record.rider_name || '').toLowerCase().includes(q) ||
      (record.source_person_name || '').toLowerCase().includes(q) ||
      (record.source_person_role || '').toLowerCase().includes(q) ||
      (record.reason || '').toLowerCase().includes(q)

    return matchesStatus && matchesBranch && matchesSearch
  })

  const selectedStaff = staffList.find(s => s.id === form.employeeId)
  const reasonSuggestions = (form.type === 'penalty' ? penaltyReasons : rewardReasons).slice(0, 6)

  return (
    <AdminModuleShell
      title="إدارة الخصومات والمكافآت"
      subtitle='كل سجل يُسجل بوضعية "معلّق" حتى يتخذ قرار من الإدارة'
      icon={<Gift size={22} />}
      loading={loading}
      onRefresh={() => void loadData()}
      actions={
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#008E92] px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-[#05777B]"
        >
          <Gift size={16} /> إضافة سجل جديد
        </button>
      }
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="معلّق" value={summary.pending} tone="amber" icon={<Clock size={18} />} loading={loading} />
          <StatCard label="معتمد" value={summary.approved} tone="emerald" icon={<CheckCircle2 size={18} />} loading={loading} />
          <StatCard label="مؤجل" value={summary.deferred} tone="slate" icon={<Timer size={18} />} loading={loading} />
          <StatCard label="ملغي" value={summary.rejected} tone="rose" icon={<ShieldClose size={18} />} loading={loading} />
          <StatCard label="إجمالي الخصومات المعتمدة" value={formatMoney(summary.penaltiesApprovedTotal)} tone="rose" icon={<TrendingDown size={18} />} loading={loading} />
          <StatCard label="إجمالي المكافآت المعتمدة" value={formatMoney(summary.rewardsApprovedTotal)} tone="emerald" icon={<TrendingUp size={18} />} loading={loading} />
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <SearchInput value={search} onChange={setSearch} placeholder="بحث باسم المناديب أو منشئ القرار أو السبب" />
              <div className="grid gap-3 sm:grid-cols-3">
                <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-black outline-none focus:border-[#008E92]">
                  <option value="all">الكل</option>
                  <option value="pending">معلّق</option>
                  <option value="approved">معتمد</option>
                  <option value="rejected">ملغي</option>
                  <option value="deferred">مؤجل</option>
                  <option value="deductions">خصومات فقط</option>
                  <option value="rewards">مكافآت فقط</option>
                </select>
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value as any)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-black outline-none focus:border-[#008E92]">
                  <option value="all">كل الفروع</option>
                  <option value="alshamy">فرع الشامي</option>
                  <option value="shukri">فرع شكري</option>
                </select>
                <button type="button" onClick={() => { setSearch(''); setFilter('all'); setBranchFilter('all') }} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-black text-slate-700 transition hover:bg-slate-100">مسح الفلاتر</button>
              </div>
            </div>
            <div className="grid gap-3 rounded-3xl border border-teal-100 bg-teal-50/50 p-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs font-black text-slate-500">ملاحظات مهمة</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>كل سجل جديد يُسجل بوضعية "معلّق".</li>
                  <li>يمكنك اعتماد السجل أو تعديله ثم اعتماده أو تأجيله أو إلغاءه.</li>
                  <li>لا يتم إجراء اعتماد مباشر أثناء الإنشاء.</li>
                </ul>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs font-black text-slate-500">البحث والتصفية</p>
                <p className="mt-2 text-sm text-slate-600">ابحث باسم الدليفري أو المصدر أو السبب، ثم اختر حالة أو فرع لتضييق النتائج.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h2 className="text-lg font-black text-[#061827] sm:text-xl">السجلات</h2>
              <p className="mt-1 text-xs font-bold text-slate-400">آخر 50 سجلًا من الدورة الحالية</p>
            </div>
            <button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200">تحديث السجلات</button>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="px-5 pb-6"><EmptyState title="لا توجد سجلات مطابقة" description="جرّب تغيير البحث أو الفلاتر، أو أضف سجلًا جديدًا" /></div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="bg-slate-50 text-xs font-black text-slate-500">
                    <tr>
                      <th className="p-3 text-right">الموظف</th>
                      <th className="p-3 text-right">الفرع</th>
                      <th className="p-3 text-right">النوع</th>
                      <th className="p-3 text-right">المبلغ</th>
                      <th className="p-3 text-right">المصدر</th>
                      <th className="p-3 text-right">الحالة</th>
                      <th className="p-3 text-right">التاريخ</th>
                      <th className="p-3 text-right">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => (
                      <tr key={record.id} className="border-t border-slate-50 hover:bg-slate-50">
                        <td className="p-3 font-black text-[#061827]">{record.rider_name || 'غير معروف'}</td>
                        <td className="p-3 text-slate-700">{record.branch_name || '—'}</td>
                        <td className="p-3">
                          <Badge tone={record.adjustment_type === 'penalty' ? 'danger' : 'success'}>{record.adjustment_type === 'penalty' ? 'خصم' : 'مكافأة'}</Badge>
                        </td>
                        <td className={`p-3 font-black ${record.adjustment_type === 'penalty' ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {record.adjustment_type === 'penalty' ? '−' : '+'}{formatMoney(Math.abs(record.final_amount))}
                        </td>
                        <td className="p-3 text-xs text-slate-500">{record.source_person_role || '—'}{record.source_person_name ? ` (${record.source_person_name})` : ''}</td>
                        <td className="p-3">
                          <Badge tone={STATUS_TONE[record.status] || 'neutral'}>{STATUS_LABEL[record.status] || record.status}</Badge>
                        </td>
                        <td className="p-3 text-slate-500">{new Date(record.created_at).toLocaleDateString('ar-EG')}</td>
                        <td className="p-3">
                          {canManage ? (
                            <div className="grid gap-1.5">
                              <button type="button" onClick={() => openReviewModal(record, 'approve')} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100">اعتماد</button>
                              <button type="button" onClick={() => openReviewModal(record, 'edit')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-100">تعديل واعتماد</button>
                              <button type="button" onClick={() => openReviewModal(record, 'double')} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700 transition hover:bg-sky-100">مضاعفة</button>
                              <button type="button" onClick={() => openReviewModal(record, 'cancel')} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100">إلغاء</button>
                              <button type="button" onClick={() => openReviewModal(record, 'defer')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-100">تأجيل</button>
                              <button type="button" onClick={() => openReviewModal(record, 'reopen')} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 transition hover:bg-amber-100">إعادة للمراجعة</button>
                            </div>
                          ) : (
                            <span className="text-xs font-black text-slate-400">غير مسموح</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {filteredRecords.map((record) => (
                  <article key={record.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <b className="font-black text-[#061827]">{record.rider_name || 'غير معروف'}</b>
                        <p className="mt-0.5 text-[11px] font-bold text-slate-400">{record.branch_name || '—'} · {new Date(record.created_at).toLocaleDateString('ar-EG')}</p>
                      </div>
                      <Badge tone={STATUS_TONE[record.status] || 'neutral'}>{STATUS_LABEL[record.status] || record.status}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-3">
                      <Badge tone={record.adjustment_type === 'penalty' ? 'danger' : 'success'}>{record.adjustment_type === 'penalty' ? 'خصم' : 'مكافأة'}</Badge>
                      <b className={`font-black ${record.adjustment_type === 'penalty' ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {record.adjustment_type === 'penalty' ? '−' : '+'}{formatMoney(Math.abs(record.final_amount))}
                      </b>
                    </div>
                    {record.reason && <p className="mt-2 text-xs font-bold text-slate-500">{record.reason}</p>}
                    {canManage && (
                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        <button type="button" onClick={() => openReviewModal(record, 'approve')} className="rounded-lg border border-emerald-200 bg-white px-2 py-2 text-[11px] font-black text-emerald-700">اعتماد</button>
                        <button type="button" onClick={() => openReviewModal(record, 'edit')} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-black text-slate-700">تعديل</button>
                        <button type="button" onClick={() => openReviewModal(record, 'double')} className="rounded-lg border border-sky-200 bg-white px-2 py-2 text-[11px] font-black text-sky-700">مضاعفة</button>
                        <button type="button" onClick={() => openReviewModal(record, 'cancel')} className="rounded-lg border border-rose-200 bg-white px-2 py-2 text-[11px] font-black text-rose-700">إلغاء</button>
                        <button type="button" onClick={() => openReviewModal(record, 'defer')} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-black text-slate-700">تأجيل</button>
                        <button type="button" onClick={() => openReviewModal(record, 'reopen')} className="rounded-lg border border-amber-200 bg-white px-2 py-2 text-[11px] font-black text-amber-700">إعادة</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <Modal open={showModal} title="إضافة خصم أو مكافأة" subtitle="سجل خصم أو مكافأة جديدة لتدخل في سير المراجعة" onClose={() => setShowModal(false)} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">الموظف / الدليفري</label>
            <SearchInput value={staffSearch} onChange={setStaffSearch} placeholder="ابحث باسم الموظف..." />
            {staffSearch && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50">
                {filteredStaff.length ? (
                  filteredStaff.map((staff) => (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => {
                        setForm({ ...form, employeeId: staff.id })
                        setStaffSearch('')
                      }}
                      className="block w-full border-b border-slate-100 p-3 text-right transition hover:bg-teal-50"
                    >
                      <p className="font-bold text-[#061827]">{staff.person_name || staff.display_name || staff.username}</p>
                      <p className="text-xs text-slate-500">{staff.branch_name} • {staff.role}</p>
                    </button>
                  ))
                ) : (
                  <p className="p-3 text-center text-sm text-slate-500">لا توجد نتائج</p>
                )}
              </div>
            )}
          </div>

          {selectedStaff && (
            <div className="rounded-2xl bg-teal-50 p-4">
              <p className="text-sm font-black text-slate-600">الموظف المختار:</p>
              <p className="mt-1 text-lg font-black text-[#061827]">{selectedStaff.person_name || selectedStaff.display_name || selectedStaff.username}</p>
              <p className="mt-1 text-xs text-slate-500">{selectedStaff.branch_name} • {selectedStaff.role}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className={`flex items-center gap-2 rounded-2xl border-2 p-3 transition cursor-pointer ${form.type === 'penalty' ? 'border-[#008E92] bg-teal-50' : 'border-slate-200'}`}>
              <input type="radio" name="type" value="penalty" checked={form.type === 'penalty'} onChange={() => setForm({ ...form, type: 'penalty' })} />
              <TrendingDown size={18} className="text-rose-600" />
              <div>
                <p className="text-sm font-black text-[#061827]">خصم</p>
                <p className="text-xs text-slate-500">تسجيل موقف أو خصم</p>
              </div>
            </label>
            <label className={`flex items-center gap-2 rounded-2xl border-2 p-3 transition cursor-pointer ${form.type === 'reward' ? 'border-[#008E92] bg-teal-50' : 'border-slate-200'}`}>
              <input type="radio" name="type" value="reward" checked={form.type === 'reward'} onChange={() => setForm({ ...form, type: 'reward' })} />
              <TrendingUp size={18} className="text-emerald-600" />
              <div>
                <p className="text-sm font-black text-[#061827]">مكافأة</p>
                <p className="text-xs text-slate-500">تسجيل إنجاز أو حافز</p>
              </div>
            </label>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">المبلغ (ج.م)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="10000"
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-[#008E92]"
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">مصدر الطلب</label>
              <select value={form.sourceRole} onChange={(e) => setForm({ ...form, sourceRole: e.target.value as any })} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 font-bold outline-none focus:border-[#008E92]">
                <option value="admin">إدارة</option>
                <option value="customer">عميل</option>
                <option value="doctor">دكتور</option>
                <option value="other">أخرى</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">اسم المصدر (اختياري)</label>
              <input type="text" value={form.sourceName} onChange={(e) => setForm({ ...form, sourceName: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-[#008E92]" placeholder="اسم العميل أو الدكتور" />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">السبب / الملاحظة</label>
            {reasonSuggestions.length > 0 && (
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {reasonSuggestions.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setForm({ ...form, reason })}
                    className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-[#008E92] hover:text-[#008E92]"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-[#008E92]"
              placeholder="اشرح سبب الخصم أو المكافأة"
              rows={3}
            />
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
              <AlertCircle size={16} /> سيتم إرسال الطلب لمراجعة المدير العام
            </p>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={submitting || !form.employeeId} className="flex-1 rounded-2xl bg-[#008E92] px-4 py-3 font-black text-white shadow-sm transition hover:bg-[#05777B] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? 'جاري الحفظ...' : 'حفظ'}
            </button>
            <button type="button" onClick={() => setShowModal(false)} disabled={submitting} className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black text-slate-600 disabled:opacity-60">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={reviewModalOpen && !!selectedRecord} title="قرار المراجعة" subtitle={reviewAction ? REVIEW_ACTION_LABEL[reviewAction] : undefined} onClose={closeReviewModal} size="md">
        {selectedRecord && (
          <>
            <div className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="font-black">اسم الموظف:</span> {selectedRecord.rider_name || 'غير معروف'}</div>
                <div><span className="font-black">الفرع:</span> {selectedRecord.branch_name || 'غير محدد'}</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="font-black">النوع:</span> {selectedRecord.adjustment_type === 'penalty' ? 'خصم' : 'مكافأة'}</div>
                <div><span className="font-black">المبلغ الحالي:</span> {formatMoney(Math.abs(selectedRecord.final_amount))}</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="font-black">السبب:</span> {selectedRecord.reason || '—'}</div>
                <div><span className="font-black">المصدر:</span> {(selectedRecord.source_person_role || '—') + (selectedRecord.source_person_name ? ` (${selectedRecord.source_person_name})` : '')}</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="font-black">من أنشأ القرار:</span> {selectedRecord.source_person_name || 'غير معروف'}</div>
                <div><span className="font-black">تاريخ الإنشاء:</span> {new Date(selectedRecord.created_at).toLocaleString('ar-EG')}</div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {reviewAction === 'edit' && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">النوع</label>
                    <select value={actionType} onChange={(e) => setActionType(e.target.value as any)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-[#008E92]">
                      <option value="penalty">خصم</option>
                      <option value="reward">مكافأة</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">المبلغ</label>
                    <input type="number" step="0.01" min="0" value={actionAmount || ''} onChange={(e) => setActionAmount(Number(e.target.value) || 0)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-[#008E92]" />
                  </div>
                </div>
              )}

              {reviewAction === 'double' && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                  <p className="font-black">سيتم مضاعفة المبلغ من {formatMoney(Math.abs(selectedRecord.final_amount))} إلى {formatMoney(Math.abs(selectedRecord.final_amount) * 2)}</p>
                </div>
              )}

              {(reviewAction === 'edit' || reviewAction === 'approve' || reviewAction === 'double') && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">مصدر الطلب</label>
                    <select value={actionSourceRole} onChange={(e) => setActionSourceRole(e.target.value as any)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-[#008E92]">
                      <option value="admin">إدارة</option>
                      <option value="customer">عميل</option>
                      <option value="doctor">دكتور</option>
                      <option value="other">أخرى</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">اسم المصدر</label>
                    <input type="text" value={actionSourceName} onChange={(e) => setActionSourceName(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-[#008E92]" placeholder="اسم العميل أو الدكتور" />
                  </div>
                </div>
              )}

              {(reviewAction === 'edit' || reviewAction === 'approve') && (
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">السبب</label>
                  <textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} rows={3} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-[#008E92]" />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">ملاحظة المدير{ACTIONS_REQUIRING_CONFIRM.has(reviewAction || '') ? ' (إلزامي)' : ''}</label>
                <textarea value={managerNote} onChange={(e) => setManagerNote(e.target.value)} rows={3} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-[#008E92]" placeholder="اكتب ملاحظة القرار" />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={requestReviewSubmit}
                  disabled={actionSaving}
                  className={`rounded-2xl px-4 py-3 font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${reviewAction === 'cancel' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#008E92] hover:bg-[#05777B]'}`}
                >
                  {actionSaving ? 'جاري الحفظ...' : 'حفظ القرار'}
                </button>
                <button type="button" onClick={closeReviewModal} disabled={actionSaving} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black text-slate-600 disabled:opacity-60">
                  إلغاء
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmAction}
        title={`تأكيد ${reviewAction ? REVIEW_ACTION_LABEL[reviewAction] : ''}`}
        description="هذا الإجراء يؤثر مباشرة على مستحقات الموظف. تأكد من الملاحظة قبل المتابعة."
        confirmLabel="تأكيد وتنفيذ"
        tone={reviewAction === 'cancel' ? 'danger' : 'default'}
        loading={actionSaving}
        onConfirm={() => void handleReviewSubmit()}
        onCancel={() => setConfirmAction(false)}
      />
    </AdminModuleShell>
  )
}

