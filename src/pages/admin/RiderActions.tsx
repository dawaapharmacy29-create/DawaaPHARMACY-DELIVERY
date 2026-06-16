import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Award, CheckCircle2, Clock, Filter, RefreshCw, Search, ShieldAlert, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '../../components/Modal'
import { supabase } from '../../lib/supabase'
import { getOperationalPeriod } from '../../lib/helpers'

type RiderAction = {
  id: string
  rider_id: string
  rider_name: string | null
  branch_id: string | null
  branch_name: string | null
  action_type: 'notice' | 'deduction_request' | 'reward_request' | 'shift_note'
  severity: 'low' | 'medium' | 'high' | 'critical'
  incident_at: string
  shift_date: string | null
  summary: string
  requested_amount: number | null
  requested_by_name: string | null
  requested_by_role: string | null
  review_status: 'pending_general_manager' | 'approved' | 'rejected' | 'cancelled'
  final_action_type: string | null
  final_amount: number | null
  general_manager_note: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  created_at: string
}

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected' | 'deductions' | 'rewards' | 'notices'

const ACTION_LABELS: Record<string, string> = {
  notice: 'لفت نظر',
  deduction_request: 'طلب خصم',
  reward_request: 'طلب مكافأة',
  shift_note: 'ملاحظة شيفت',
}

const SEVERITY_LABELS: Record<string, string> = {
  low: 'بسيط',
  medium: 'متوسط',
  high: 'مهم',
  critical: 'خطير',
}

const STATUS_LABELS: Record<string, string> = {
  pending_general_manager: 'تحت مراجعة المدير العام',
  approved: 'معتمد',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
}

function dateTimeText(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('ar-EG')
  } catch {
    return value
  }
}

function statusClass(status: string) {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 border-rose-200'
  if (status === 'cancelled') return 'bg-slate-50 text-slate-600 border-slate-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
}

export default function RiderActions() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [items, setItems] = useState<RiderAction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('pending')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<RiderAction | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [finalActionType, setFinalActionType] = useState('notice')
  const [finalAmount, setFinalAmount] = useState('')
  const [managerNote, setManagerNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { void loadItems() }, [])

  async function loadItems() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('rider_shift_actions')
        .select('*')
        .gte('shift_date', period.start)
        .lte('shift_date', period.end)
        .order('created_at', { ascending: false })
      if (error) throw error
      setItems((data ?? []) as RiderAction[])
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || 'فشل تحميل مواقف الدليفري')
    } finally {
      setLoading(false)
    }
  }

  const filtered = items.filter(item => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'pending' && item.review_status === 'pending_general_manager') ||
      (filter === 'approved' && item.review_status === 'approved') ||
      (filter === 'rejected' && item.review_status === 'rejected') ||
      (filter === 'deductions' && item.action_type === 'deduction_request') ||
      (filter === 'rewards' && item.action_type === 'reward_request') ||
      (filter === 'notices' && item.action_type === 'notice')
    const q = search.trim().toLowerCase()
    const matchesSearch = !q ||
      (item.rider_name || '').toLowerCase().includes(q) ||
      (item.branch_name || '').toLowerCase().includes(q) ||
      (item.summary || '').toLowerCase().includes(q) ||
      (item.requested_by_name || '').toLowerCase().includes(q)
    return matchesFilter && matchesSearch
  })

  const stats = useMemo(() => ({
    pending: items.filter(i => i.review_status === 'pending_general_manager').length,
    approved: items.filter(i => i.review_status === 'approved').length,
    rejected: items.filter(i => i.review_status === 'rejected').length,
    deductions: items.filter(i => i.action_type === 'deduction_request').length,
    rewards: items.filter(i => i.action_type === 'reward_request').length,
  }), [items])

  async function getReviewerName() {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) return 'مدير عام'
    const { data } = await supabase
      .from('user_profiles')
      .select('display_name, username, role')
      .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle()
    return (data as any)?.display_name || (data as any)?.username || user.email || 'مدير عام'
  }

  function openReview(item: RiderAction, nextDecision: 'approved' | 'rejected') {
    setSelected(item)
    setDecision(nextDecision)
    setFinalActionType(item.action_type === 'reward_request' ? 'reward' : item.action_type === 'deduction_request' ? 'deduction' : 'notice')
    setFinalAmount(item.requested_amount ? String(item.requested_amount) : '')
    setManagerNote('')
    setReviewOpen(true)
  }

  async function submitReview() {
    if (!selected) return
    if (!managerNote.trim()) {
      toast.error('لازم تكتب ملاحظة المدير العام أو سبب القرار')
      return
    }
    try {
      setSaving(true)
      const reviewer = await getReviewerName()
      const payload: Record<string, unknown> = {
        review_status: decision,
        final_action_type: decision === 'approved' ? finalActionType : 'none',
        final_amount: decision === 'approved' && finalAmount ? Number(finalAmount) : 0,
        general_manager_note: managerNote.trim(),
        reviewed_by_name: reviewer,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('rider_shift_actions').update(payload).eq('id', selected.id)
      if (error) throw error
      toast.success(decision === 'approved' ? 'تم اعتماد القرار' : 'تم رفض الطلب')
      setReviewOpen(false)
      setSelected(null)
      await loadItems()
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || 'فشل حفظ قرار المدير العام')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F3F7F8] pb-12">
      <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/admin')} className="rounded-full bg-white/20 p-2 hover:bg-white/30">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-black">لفت النظر والخصومات والمكافآت</h1>
              <p className="text-sm text-white/80">كل موقف يتسجل باسم المسئول ويظل تحت مراجعة المدير العام</p>
            </div>
          </div>
          <button onClick={loadItems} className="rounded-xl bg-white/15 px-3 py-2 text-sm font-bold hover:bg-white/25">
            <RefreshCw className="inline" size={16} /> تحديث
          </button>
        </div>
      </header>

      <main className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat title="تحت المراجعة" value={stats.pending} icon={<Clock size={20} />} color="bg-amber-50 text-amber-700" />
          <Stat title="معتمدة" value={stats.approved} icon={<CheckCircle2 size={20} />} color="bg-emerald-50 text-emerald-700" />
          <Stat title="مرفوضة" value={stats.rejected} icon={<XCircle size={20} />} color="bg-rose-50 text-rose-700" />
          <Stat title="طلبات خصم" value={stats.deductions} icon={<ShieldAlert size={20} />} color="bg-red-50 text-red-700" />
          <Stat title="طلبات مكافأة" value={stats.rewards} icon={<Award size={20} />} color="bg-purple-50 text-purple-700" />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-3 text-slate-400" size={18} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="dawaa-input pr-10"
                placeholder="بحث باسم الدليفري أو المسئول أو ملخص الموقف"
              />
            </div>
            <div className="relative">
              <Filter className="absolute right-3 top-3 text-slate-400" size={18} />
              <select value={filter} onChange={e => setFilter(e.target.value as FilterKey)} className="dawaa-input min-w-[220px] pr-10 font-bold">
                <option value="pending">تحت المراجعة</option>
                <option value="all">كل المواقف</option>
                <option value="approved">معتمدة</option>
                <option value="rejected">مرفوضة</option>
                <option value="deductions">طلبات خصم</option>
                <option value="rewards">طلبات مكافأة</option>
                <option value="notices">لفت نظر</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center font-black">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-500">لا توجد مواقف مطابقة</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => (
              <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#008E92]/10 px-3 py-1 text-xs font-black text-[#008E92]">{ACTION_LABELS[item.action_type]}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{SEVERITY_LABELS[item.severity]}</span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(item.review_status)}`}>{STATUS_LABELS[item.review_status]}</span>
                    </div>
                    <h3 className="text-lg font-black text-slate-950">{item.rider_name || 'دليفري غير محدد'}</h3>
                    <p className="text-sm font-bold text-slate-500">{item.branch_name || 'فرع غير محدد'} • {dateTimeText(item.incident_at)}</p>
                    <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{item.summary}</p>
                  </div>
                  <div className="min-w-[210px] rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm">
                    <p><b>مسجل بواسطة:</b> {item.requested_by_name || 'غير محدد'}</p>
                    <p><b>الدور:</b> {item.requested_by_role || 'غير محدد'}</p>
                    <p><b>المبلغ المقترح:</b> {item.requested_amount ? `${item.requested_amount} ج.م` : '—'}</p>
                    {item.reviewed_by_name ? <p><b>المراجع:</b> {item.reviewed_by_name}</p> : null}
                  </div>
                </div>
                {item.general_manager_note ? (
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                    <b>قرار المدير العام:</b> {item.general_manager_note}
                  </div>
                ) : null}
                {item.review_status === 'pending_general_manager' ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button onClick={() => openReview(item, 'approved')} className="rounded-xl bg-emerald-600 p-3 font-black text-white hover:bg-emerald-700">اعتماد القرار</button>
                    <button onClick={() => openReview(item, 'rejected')} className="rounded-xl bg-rose-600 p-3 font-black text-white hover:bg-rose-700">رفض الطلب</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={decision === 'approved' ? 'اعتماد موقف الدليفري' : 'رفض موقف الدليفري'} subtitle={selected?.rider_name || ''}>
        <div className="space-y-4">
          {decision === 'approved' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">نوع القرار النهائي</span>
                <select value={finalActionType} onChange={e => setFinalActionType(e.target.value)} className="dawaa-input">
                  <option value="notice">لفت نظر فقط</option>
                  <option value="deduction">خصم</option>
                  <option value="reward">مكافأة</option>
                  <option value="no_action">حفظ بدون إجراء مالي</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-black text-slate-700">القيمة النهائية إن وجدت</span>
                <input value={finalAmount} onChange={e => setFinalAmount(e.target.value)} type="number" min="0" className="dawaa-input" placeholder="0" />
              </label>
            </div>
          ) : null}
          <label className="space-y-1">
            <span className="text-sm font-black text-slate-700">ملاحظة المدير العام / سبب القرار *</span>
            <textarea value={managerNote} onChange={e => setManagerNote(e.target.value)} className="dawaa-input min-h-[120px]" placeholder="اكتب سبب الاعتماد أو الرفض بوضوح" />
          </label>
          <button disabled={saving} onClick={submitReview} className="w-full rounded-2xl bg-[#008E92] p-4 font-black text-white disabled:opacity-60">
            {saving ? 'جاري الحفظ...' : 'حفظ قرار المدير العام'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function Stat({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm ${color}`}>
      <div className="mb-2 flex items-center justify-between">
        {icon}
        <span className="text-2xl font-black">{value}</span>
      </div>
      <p className="text-sm font-black">{title}</p>
    </div>
  )
}
