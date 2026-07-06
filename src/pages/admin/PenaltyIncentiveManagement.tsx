import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Gift, Repeat, Search, ShieldClose, Timer, TrendingDown, TrendingUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { getCurrentSession } from '../../lib/auth'
import type { UserProfile } from '../../lib/types'

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

  const canManage = useMemo(() => {
    if (!profile) return false
    const managerRoles = ['admin', 'general_manager', 'operations_manager', 'branches_manager', 'branch_manager', 'shift_manager']
    return managerRoles.includes(profile.role || '')
  }, [profile])

  const shouldAutoApprove = useMemo(() => {
    if (!profile) return false
    return ['admin', 'general_manager'].includes(profile.role || '')
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
  }

  async function updateAdjustment(payload: Record<string, unknown>) {
    const { error } = await supabase.from('rider_adjustments').update(payload).eq('id', selectedRecord?.id)
    return error
  }

  async function handleReviewSubmit() {
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent" />
          <p className="mt-3 text-sm font-bold text-slate-400">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  const selectedStaff = staffList.find(s => s.id === form.employeeId)

  return (
    <div className="p-4 text-right" dir="rtl">
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border bg-white p-5 shadow-sm">
          <div>
            <button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-600">
              <ArrowRight size={16} /> رجوع
            </button>
            <p className="text-sm font-black text-purple-600">إدارة الجزاءات والمكافآت</p>
            <h1 className="mt-1 text-3xl font-black text-[#061827]">سجل مراجعة الخصومات والمكافآت</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">كل سجل يُسجل بوضعية "قيد المراجعة" حتى يتم اتخاذ قرار من الإدارة.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 font-black text-white shadow-sm disabled:opacity-60"
          >
            <Gift size={18} /> إضافة جديد
          </button>
        </header>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-[#061827]">إضافة خصم أو مكافأة</h2>
                  <p className="mt-1 text-sm text-slate-500">سجل خصم أو مكافأة جديدة لتدخل في سير المراجعة.</p>
                </div>
                <button onClick={() => setShowModal(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">الموظف / الدليفري</label>
                  <div className="relative">
                    <Search className="absolute right-4 top-3 text-slate-400" size={18} />
                    <input
                      type="text"
                      placeholder="ابحث باسم الموظف..."
                      value={staffSearch}
                      onChange={(e) => setStaffSearch(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-11 font-bold outline-none focus:border-purple-300"
                    />
                  </div>
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
                            className="block w-full border-b p-3 text-right hover:bg-purple-50"
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
                  <div className="rounded-2xl bg-purple-50 p-4">
                    <p className="text-sm font-black text-slate-600">الموظف المختار:</p>
                    <p className="mt-1 text-lg font-black text-[#061827]">{selectedStaff.person_name || selectedStaff.display_name || selectedStaff.username}</p>
                    <p className="mt-1 text-xs text-slate-500">{selectedStaff.branch_name} • {selectedStaff.role}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 rounded-2xl border-2 p-3 cursor-pointer transition" style={{ borderColor: form.type === 'penalty' ? '#008E92' : '#e2e8f0', backgroundColor: form.type === 'penalty' ? 'rgba(0, 142, 146, 0.05)' : 'transparent' }}>
                    <input
                      type="radio"
                      name="type"
                      value="penalty"
                      checked={form.type === 'penalty'}
                      onChange={() => setForm({ ...form, type: 'penalty' })}
                    />
                    <div>
                      <TrendingDown size={18} className="text-rose-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#061827]">خصم</p>
                      <p className="text-xs text-slate-500">تسجيل موقف أو خصم</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 rounded-2xl border-2 p-3 cursor-pointer transition" style={{ borderColor: form.type === 'reward' ? '#008E92' : '#e2e8f0', backgroundColor: form.type === 'reward' ? 'rgba(0, 142, 146, 0.05)' : 'transparent' }}>
                    <input
                      type="radio"
                      name="type"
                      value="reward"
                      checked={form.type === 'reward'}
                      onChange={() => setForm({ ...form, type: 'reward' })}
                    />
                    <div>
                      <TrendingUp size={18} className="text-emerald-600" />
                    </div>
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
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-purple-300"
                    placeholder="0.00"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">مصدر الطلب</label>
                    <select
                      value={form.sourceRole}
                      onChange={(e) => setForm({ ...form, sourceRole: e.target.value as any })}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 font-bold outline-none focus:border-purple-300"
                    >
                      <option value="admin">إدارة</option>
                      <option value="customer">عميل</option>
                      <option value="doctor">دكتور</option>
                      <option value="other">أخرى</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">اسم المصدر (اختياري)</label>
                    <input
                      type="text"
                      value={form.sourceName}
                      onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-purple-300"
                      placeholder="اسم العميل أو الدكتور"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">السبب / الملاحظة</label>
                  <textarea
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-purple-300"
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
                  <button
                    type="submit"
                    disabled={submitting || !form.employeeId}
                    className="flex-1 rounded-2xl bg-purple-600 px-4 py-3 font-black text-white shadow-sm disabled:opacity-60"
                  >
                    {submitting ? 'جاري الحفظ...' : 'حفظ'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black text-slate-600"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard title="قيد المراجعة" value={summary.pending} tone="amber" icon={<Clock size={20} />} />
          <StatCard title="معتمد" value={summary.approved} tone="emerald" icon={<CheckCircle2 size={20} />} />
          <StatCard title="مرفوض / ملغي" value={summary.rejected} tone="rose" icon={<ShieldClose size={20} />} />
          <StatCard title="مؤجل" value={summary.deferred} tone="slate" icon={<Timer size={20} />} />
          <StatCard title="إجمالي الخصومات المعتمدة" value={formatMoney(summary.penaltiesApprovedTotal)} tone="rose" icon={<TrendingDown size={20} />} />
          <StatCard title="إجمالي المكافآت المعتمدة" value={formatMoney(summary.rewardsApprovedTotal)} tone="emerald" icon={<TrendingUp size={20} />} />
        </div>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr] xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute right-4 top-3 text-slate-400" size={18} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث باسم المناديب أو منشئ القرار أو السبب"
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-11 font-bold outline-none focus:border-purple-300"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black outline-none focus:border-purple-300">
                  <option value="all">الكل</option>
                  <option value="pending">قيد المراجعة</option>
                  <option value="approved">معتمد</option>
                  <option value="rejected">مرفوض / ملغي</option>
                  <option value="deferred">مؤجل</option>
                  <option value="deductions">خصومات فقط</option>
                  <option value="rewards">مكافآت فقط</option>
                </select>
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value as any)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black outline-none focus:border-purple-300">
                  <option value="all">كل الفروع</option>
                  <option value="alshamy">فرع الشامي</option>
                  <option value="shukri">فرع شكري</option>
                </select>
                <button type="button" onClick={() => { setSearch(''); setFilter('all'); setBranchFilter('all') }} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-black text-slate-700 hover:bg-slate-100">مسح الفلاتر</button>
              </div>
            </div>
            <div className="grid gap-3 rounded-3xl border border-purple-100 bg-purple-50 p-4">
              <div className="rounded-3xl bg-white p-4 shadow-sm">
                <p className="text-xs font-black text-slate-500">ملاحظات مهمة</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>كل سجل جديد يُسجل بوضعية "قيد المراجعة".</li>
                  <li>يمكنك اعتماد السجل أو تعديله ثم اعتماده أو تأجيله أو إلغاءه.</li>
                  <li>لا يتم إجراء اعتماد مباشر أثناء الإنشاء.</li>
                </ul>
              </div>
              <div className="rounded-3xl bg-white p-4 shadow-sm">
                <p className="text-xs font-black text-slate-500">البحث والتصفية</p>
                <p className="mt-2 text-sm text-slate-600">ابحث باسم الدليفري أو المصدر أو السبب، ثم اختر حالة أو فرع لتضييق النتائج.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#061827]">السجلات</h2>
              <p className="mt-1 text-xs font-bold text-slate-400">آخر 50 سجلًا من جدول rider_adjustments</p>
            </div>
            <button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 font-black text-slate-700 hover:bg-slate-200">تحديث السجلات</button>
          </div>
          <div className="overflow-x-auto">
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
                {filteredRecords.length ? filteredRecords.map((record) => (
                  <tr key={record.id} className="border-t hover:bg-slate-50">
                    <td className="p-3 font-black text-[#061827]">{record.rider_name || 'غير معروف'}</td>
                    <td className="p-3 text-slate-700">{record.branch_name || '—'}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${record.adjustment_type === 'penalty' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {record.adjustment_type === 'penalty' ? 'خصم' : 'مكافأة'}
                      </span>
                    </td>
                    <td className={`p-3 font-black ${record.adjustment_type === 'penalty' ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {record.adjustment_type === 'penalty' ? '−' : '+'}{formatMoney(Math.abs(record.final_amount))}
                    </td>
                    <td className="p-3 text-xs text-slate-500">{record.source_person_role || '—'}{record.source_person_name ? ` (${record.source_person_name})` : ''}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${record.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : record.status === 'pending' ? 'bg-amber-100 text-amber-700' : record.status === 'rejected' ? 'bg-rose-100 text-rose-700' : record.status === 'cancelled' ? 'bg-slate-100 text-slate-600' : record.status === 'deferred' ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-600'}`}>
                        {record.status === 'approved' ? 'معتمد' : record.status === 'pending' ? 'قيد المراجعة' : record.status === 'rejected' ? 'مرفوض' : record.status === 'cancelled' ? 'ملغي' : record.status === 'deferred' ? 'مؤجل' : record.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{new Date(record.created_at).toLocaleDateString('ar-EG')}</td>
                    <td className="p-3 space-y-2">
                      {canManage ? (
                        <div className="grid gap-2">
                          <button type="button" onClick={() => openReviewModal(record, 'approve')} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">اعتماد</button>
                          <button type="button" onClick={() => openReviewModal(record, 'edit')} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">تعديل واعتماد</button>
                          <button type="button" onClick={() => openReviewModal(record, 'double')} className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">مضاعفة</button>
                          <button type="button" onClick={() => openReviewModal(record, 'cancel')} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">إلغاء</button>
                          <button type="button" onClick={() => openReviewModal(record, 'defer')} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">تأجيل</button>
                          <button type="button" onClick={() => openReviewModal(record, 'reopen')} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">إعادة للمراجعة</button>
                        </div>
                      ) : (
                        <span className="text-xs font-black text-slate-400">غير مسموح</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">لا توجد سجلات</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {reviewModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-[#061827]">قرار المراجعة</h2>
                <p className="mt-1 text-sm text-slate-500">{reviewAction === 'approve' ? 'اعتماد السجل' : reviewAction === 'edit' ? 'تعديل واعتماد' : reviewAction === 'double' ? 'مضاعفة المبلغ' : reviewAction === 'cancel' ? 'إلغاء السجل' : reviewAction === 'defer' ? 'تأجيل السجل' : 'إعادة للمراجعة'}</p>
              </div>
              <button onClick={closeReviewModal} className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button>
            </div>

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
                    <select value={actionType} onChange={(e) => setActionType(e.target.value as any)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-purple-300">
                      <option value="penalty">خصم</option>
                      <option value="reward">مكافأة</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">المبلغ</label>
                    <input type="number" step="0.01" min="0" value={actionAmount || ''} onChange={(e) => setActionAmount(Number(e.target.value) || 0)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-purple-300" />
                  </div>
                </div>
              )}

              {reviewAction === 'double' && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  <p className="font-black">سيتم مضاعفة المبلغ من {formatMoney(Math.abs(selectedRecord.final_amount))} إلى {formatMoney(Math.abs(selectedRecord.final_amount) * 2)}</p>
                </div>
              )}

              {(reviewAction === 'edit' || reviewAction === 'approve' || reviewAction === 'double') && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">مصدر الطلب</label>
                    <select value={actionSourceRole} onChange={(e) => setActionSourceRole(e.target.value as any)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-purple-300">
                      <option value="admin">إدارة</option>
                      <option value="customer">عميل</option>
                      <option value="doctor">دكتور</option>
                      <option value="other">أخرى</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">اسم المصدر</label>
                    <input type="text" value={actionSourceName} onChange={(e) => setActionSourceName(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-purple-300" placeholder="اسم العميل أو الدكتور" />
                  </div>
                </div>
              )}

              {(reviewAction === 'edit' || reviewAction === 'approve') && (
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">السبب</label>
                  <textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} rows={3} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-purple-300" />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">ملاحظة المدير</label>
                <textarea value={managerNote} onChange={(e) => setManagerNote(e.target.value)} rows={3} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-purple-300" placeholder="اكتب ملاحظة القرار" />
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleReviewSubmit} disabled={actionSaving} className="rounded-2xl bg-purple-600 px-4 py-3 font-black text-white shadow-sm disabled:opacity-60">
                  {actionSaving ? 'جاري الحفظ...' : 'حفظ القرار'}
                </button>
                <button type="button" onClick={closeReviewModal} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black text-slate-600">
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, tone, icon }: { title: string; value: number | string; tone: 'emerald' | 'amber' | 'rose' | 'slate'; icon: ReactNode }) {
  const toneClass = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'rose' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-700'
  return (
    <div className={`rounded-[28px] border p-5 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-[0.08em] opacity-80">{title}</div>
        <div className="rounded-2xl bg-white p-2 text-[#061827]">{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-black">{value}</p>
    </div>
  )
}
