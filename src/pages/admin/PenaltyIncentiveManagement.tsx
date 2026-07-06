import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, Gift, Search, TrendingDown, TrendingUp, X } from 'lucide-react'
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
  approve: boolean
  sourceName: string
  sourceRole: 'customer' | 'doctor' | 'admin' | 'other'
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
  status: 'pending' | 'approved' | 'rejected'
  reviewed_at: string | null
  created_at: string
  cycle_start: string
  cycle_end: string
}

const num = (value: unknown) => Number(value || 0) || 0
const formatMoney = (val: number) => `${num(val).toFixed(2)} ر.ع`

export default function PenaltyIncentiveManagement() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quick = searchParams.get('quick') === '1'
  const staffIdParam = searchParams.get('staffId')

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(quick)
  const [search, setSearch] = useState('')
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [records, setRecords] = useState<AdjustmentRecord[]>([])

  const [form, setForm] = useState<PenaltyIncentiveForm>({
    employeeId: staffIdParam || '',
    type: 'penalty',
    amount: 0,
    reason: '',
    approve: false,
    sourceName: '',
    sourceRole: 'admin',
  })

  const [submitting, setSubmitting] = useState(false)

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
    s.searchText?.includes(search.toLowerCase())
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
        status: shouldAutoApprove || form.approve ? 'approved' : 'pending',
        created_by: profile?.id,
        reviewed_by: shouldAutoApprove || form.approve ? profile?.id : null,
        reviewed_at: shouldAutoApprove || form.approve ? new Date().toISOString() : null,
      }

      const { error } = await supabase.from('rider_adjustments').insert(payload)

      if (error) throw error

      const statusText = payload.status === 'approved'
        ? `${form.type === 'penalty' ? 'خصم' : 'مكافأة'} معتمد بنجاح`
        : `${form.type === 'penalty' ? 'خصم' : 'مكافأة'} مرسل للمراجعة`

      toast.success(statusText)

      setForm({
        employeeId: '',
        type: 'penalty',
        amount: 0,
        reason: '',
        approve: false,
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
            <h1 className="mt-1 text-3xl font-black text-[#061827]">خصم / مكافأة سريع</h1>
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
                <h2 className="text-2xl font-black text-[#061827]">إضافة خصم أو مكافأة</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-lg p-2 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">الموظف / الدليفري</label>
                  <div className="relative">
                    <Search className="absolute right-4 top-3 text-slate-400" size={18} />
                    <input
                      type="text"
                      placeholder="ابحث باسم الموظف..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-11 font-bold outline-none focus:border-purple-300"
                    />
                  </div>
                  {search && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50">
                      {filteredStaff.length ? (
                        filteredStaff.map((staff) => (
                          <button
                            key={staff.id}
                            type="button"
                            onClick={() => {
                              setForm({ ...form, employeeId: staff.id })
                              setSearch('')
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
                      onChange={(e) => setForm({ ...form, type: 'penalty' })}
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
                      onChange={(e) => setForm({ ...form, type: 'reward' })}
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
                  <label className="mb-2 block text-sm font-bold text-slate-700">المبلغ (ر.ع)</label>
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

                {canManage && shouldAutoApprove && (
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      checked={form.approve}
                      onChange={(e) => setForm({ ...form, approve: e.target.checked })}
                      className="h-5 w-5"
                    />
                    <div>
                      <p className="text-sm font-black text-[#061827]">معتمد مباشرة</p>
                      <p className="text-xs text-slate-500">تطبيق الخصم أو المكافأة فوراً بدون انتظار</p>
                    </div>
                  </label>
                )}

                {!shouldAutoApprove && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
                      <AlertCircle size={16} />
                      سيتم إرسال الطلب لمراجعة المدير العام
                    </p>
                  </div>
                )}

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

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-black text-[#061827]">السجلات الأخيرة</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">آخر 50 خصم أو مكافأة مسجلة</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-500">
                <tr>
                  <th className="p-3 text-right">الموظف</th>
                  <th className="p-3 text-right">النوع</th>
                  <th className="p-3 text-right">المبلغ</th>
                  <th className="p-3 text-right">السبب</th>
                  <th className="p-3 text-right">المصدر</th>
                  <th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {records.length ? records.map((record) => (
                  <tr key={record.id} className="border-t hover:bg-slate-50">
                    <td className="p-3 font-black text-[#061827]">{record.rider_name || 'غير معروف'}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${record.adjustment_type === 'penalty' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {record.adjustment_type === 'penalty' ? 'خصم' : 'مكافأة'}
                      </span>
                    </td>
                    <td className={`p-3 font-black ${record.adjustment_type === 'penalty' ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {record.adjustment_type === 'penalty' ? '−' : '+'}{formatMoney(Math.abs(record.final_amount))}
                    </td>
                    <td className="p-3 text-slate-600">{record.reason || '—'}</td>
                    <td className="p-3 text-xs text-slate-500">{record.source_person_role || '—'}{record.source_person_name ? ` (${record.source_person_name})` : ''}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${record.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : record.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                        {record.status === 'approved' ? 'معتمد' : record.status === 'pending' ? 'مستني' : 'مرفوض'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{new Date(record.created_at).toLocaleDateString('ar-OM')}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      لا توجد سجلات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
