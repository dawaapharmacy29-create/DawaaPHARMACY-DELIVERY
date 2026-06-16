import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Search, Download, Eye, EyeOff,
  UserPlus, Edit3, Key, ToggleLeft, ToggleRight, ShieldCheck,
  Users, UserCheck, UserX, LockKeyhole
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/Modal'
import { CANONICAL_BRANCHES, canonicalBranchName } from '../../lib/branchUtils'

type StaffAccountRow = {
  row_id: string
  account_id: string | null
  rider_id: string | null
  person_name: string
  rider_status: string | null
  branch_id: string | null
  branch_name: string | null
  username: string | null
  display_name: string | null
  role: string | null
  pin_enabled: boolean
  must_change_pin: boolean
  pin_changed_at: string | null
  last_login_at: string | null
  failed_attempts: number
  locked_until: string | null
  account_status: string | null
  account_created_at: string | null
  account_scope: 'rider' | 'manager' | 'staff'
  sort_order: number
}

type BranchOption = { id: string; name: string }

const ROLE_OPTIONS = [
  { value: 'rider', label: 'دليفري' },
  { value: 'branch_manager', label: 'مدير فرع' },
  { value: 'shift_manager', label: 'مسؤول شيفت' },
  { value: 'operations_manager', label: 'مدير تشغيل' },
  { value: 'branches_manager', label: 'مدير فروع' },
  { value: 'general_manager', label: 'مدير عام' },
  { value: 'admin', label: 'أدمن' },
]

function roleLabel(role?: string | null) {
  return ROLE_OPTIONS.find(r => r.value === role)?.label || role || 'دليفري'
}

function roleTone(role?: string | null) {
  if (['general_manager', 'admin'].includes(String(role || ''))) return 'bg-purple-100 text-purple-700'
  if (['operations_manager', 'branches_manager'].includes(String(role || ''))) return 'bg-sky-100 text-sky-700'
  if (['branch_manager', 'shift_manager'].includes(String(role || ''))) return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function generatePIN() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function generateUsername(name: string) {
  return (name || '').trim().replace(/\s+/g, ' ') || 'حساب جديد'
}

function formatDateTime(dt?: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function csvCell(value: unknown) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim()
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(fileName: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) {
    toast.error('لا توجد بيانات للتصدير')
    return
  }
  const headers = Object.keys(rows[0])
  const csv = ['\ufeff' + headers.map(csvCell).join(','), ...rows.map(row => headers.map(h => csvCell(row[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export default function RiderAccounts() {
  const navigate = useNavigate()

  const [rows, setRows] = useState<StaffAccountRow[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [filterBranch, setFilterBranch] = useState('all')
  const [filterRole, setFilterRole] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showPins, setShowPins] = useState(false)
  const [generatedPins, setGeneratedPins] = useState<Record<string, string>>({})

  const [modalType, setModalType] = useState<'create_staff' | 'create_for_row' | 'edit' | 'reset_pin' | 'status' | null>(null)
  const [selected, setSelected] = useState<StaffAccountRow | null>(null)
  const [formName, setFormName] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formRole, setFormRole] = useState('rider')
  const [formBranchId, setFormBranchId] = useState('')
  const [formPin, setFormPin] = useState('')
  const [formStatus, setFormStatus] = useState('active')

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('staff_accounts_full_view')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('person_name', { ascending: true })

      if (error) throw error
      setRows((data || []) as StaffAccountRow[])

      const { data: branchRows } = await supabase
        .from('branches')
        .select('id,name,display_name')
        .order('name')

      setBranches((branchRows || [])
        .map((b: any) => ({
          id: b.id,
          name: canonicalBranchName(b.display_name || b.name) || b.display_name || b.name || 'فرع غير محدد',
        }))
        .filter((b: any) => CANONICAL_BRANCHES.includes(b.name))
        .filter((b: any, idx: number, arr: any[]) => arr.findIndex(x => x.name === b.name) === idx)
      )
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'فشل تحميل صفحة الحسابات. تأكد من تشغيل SQL 46')
    } finally {
      setLoading(false)
    }
  }

  function openCreateStaff() {
    setSelected(null)
    setFormName('')
    setFormUsername('')
    setFormRole('branch_manager')
    setFormBranchId('')
    setFormPin(generatePIN())
    setFormStatus('active')
    setModalType('create_staff')
  }

  function openCreateForRow(row: StaffAccountRow) {
    setSelected(row)
    setFormName(row.person_name)
    setFormUsername(generateUsername(row.person_name))
    setFormRole(row.role || 'rider')
    setFormBranchId(row.branch_id || '')
    setFormPin(generatePIN())
    setFormStatus('active')
    setModalType('create_for_row')
  }

  function openEdit(row: StaffAccountRow) {
    setSelected(row)
    setFormName(row.display_name || row.person_name)
    setFormUsername(row.username || row.person_name)
    setFormRole(row.role || 'rider')
    setFormBranchId(row.branch_id || '')
    setFormPin('')
    setFormStatus(row.account_status || 'active')
    setModalType('edit')
  }

  function openResetPin(row: StaffAccountRow) {
    setSelected(row)
    setFormPin(generatePIN())
    setModalType('reset_pin')
  }

  function openStatus(row: StaffAccountRow) {
    setSelected(row)
    setFormStatus(row.account_status === 'active' ? 'inactive' : 'active')
    setModalType('status')
  }

  async function saveAccount(options?: { resetOnly?: boolean; statusOnly?: boolean }) {
    const pin = formPin.replace(/\D/g, '').slice(0, 4)
    if (!options?.statusOnly && !options?.resetOnly && !formUsername.trim()) {
      toast.error('اسم الدخول مطلوب')
      return
    }
    if ((pin || options?.resetOnly) && pin.length !== 4) {
      toast.error('PIN يجب أن يكون 4 أرقام بالضبط')
      return
    }

    const accountId = selected?.account_id || null
    const riderId = selected?.rider_id || null
    const displayName = formName.trim() || selected?.person_name || formUsername.trim()

    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('admin_save_staff_account', {
        p_account_id: accountId,
        p_rider_id: riderId,
        p_display_name: displayName,
        p_username: options?.resetOnly || options?.statusOnly ? (selected?.username || formUsername || displayName) : formUsername.trim(),
        p_role: options?.resetOnly || options?.statusOnly ? (selected?.role || formRole || 'rider') : formRole,
        p_branch_id: formBranchId || selected?.branch_id || null,
        p_new_pin: pin || null,
        p_status: options?.statusOnly ? formStatus : (formStatus || 'active'),
        p_force_change: !!pin,
        p_reason: options?.resetOnly ? 'إعادة تعيين PIN من صفحة كل الحسابات'
          : options?.statusOnly ? 'تعديل حالة الحساب من صفحة كل الحسابات'
          : 'حفظ حساب من صفحة كل الحسابات',
      })

      if (error) throw error
      const result: any = Array.isArray(data) ? data[0] : data
      if (result?.success === false) throw new Error(result?.message || result?.error || 'فشل حفظ الحساب')

      if (pin && result?.account_id) {
        setGeneratedPins(prev => ({ ...prev, [String(result.account_id)]: pin }))
        if (selected?.rider_id) setGeneratedPins(prev => ({ ...prev, [String(selected.rider_id)]: pin }))
      }

      toast.success(pin ? `تم الحفظ بنجاح — PIN الجديد: ${pin}` : 'تم حفظ الحساب بنجاح')
      setModalType(null)
      setSelected(null)
      setFormPin('')
      await loadAll()
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'فشل حفظ الحساب')
    } finally {
      setSaving(false)
    }
  }

  async function bulkCreateRiderAccounts() {
    const missing = filtered.filter(r => r.account_scope === 'rider' && !r.account_id)
    if (!missing.length) {
      toast.info('كل الدليفري الظاهرين لديهم حسابات')
      return
    }

    setBulkLoading(true)
    let done = 0
    const pins: Record<string, string> = {}

    for (const row of missing) {
      const pin = generatePIN()
      try {
        const { data, error } = await supabase.rpc('admin_save_staff_account', {
          p_account_id: null,
          p_rider_id: row.rider_id,
          p_display_name: row.person_name,
          p_username: generateUsername(row.person_name),
          p_role: 'rider',
          p_branch_id: row.branch_id || null,
          p_new_pin: pin,
          p_status: 'active',
          p_force_change: true,
          p_reason: 'إنشاء حسابات دليفري تلقائي من صفحة كل الحسابات',
        })
        if (error) throw error
        const result: any = Array.isArray(data) ? data[0] : data
        if (result?.success === false) throw new Error(result?.message || 'failed')
        if (result?.account_id) pins[String(result.account_id)] = pin
        if (row.rider_id) pins[String(row.rider_id)] = pin
        done++
      } catch (e) {
        console.error('skip', row.person_name, e)
      }
    }

    setGeneratedPins(prev => ({ ...prev, ...pins }))
    setBulkLoading(false)
    toast.success(`تم إنشاء ${done} حساب دليفري`)
    await loadAll()
  }

  const filtered = useMemo(() => rows.filter(r => {
    const role = r.role || 'rider'
    const status = r.account_status || 'no_account'
    if (filterBranch !== 'all' && r.branch_id !== filterBranch && canonicalBranchName(r.branch_name) !== filterBranch) return false
    if (filterRole !== 'all' && role !== filterRole) return false
    if (filterStatus === 'active' && status !== 'active') return false
    if (filterStatus === 'inactive' && status === 'active') return false
    if (filterStatus === 'no_account' && r.account_id) return false
    if (filterStatus === 'locked' && !r.locked_until) return false
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      const haystack = [
        r.person_name,
        r.display_name,
        r.username,
        r.branch_name,
        roleLabel(role),
        r.account_scope,
      ].join(' ').toLowerCase()
      if (!haystack.includes(s)) return false
    }
    return true
  }), [rows, search, filterBranch, filterRole, filterStatus])

  const stats = {
    totalPeople: rows.length,
    accounts: rows.filter(r => r.account_id).length,
    managers: rows.filter(r => ['admin','general_manager','operations_manager','branches_manager','branch_manager','shift_manager'].includes(String(r.role || ''))).length,
    riders: rows.filter(r => r.account_scope === 'rider').length,
    noAccount: rows.filter(r => !r.account_id).length,
    active: rows.filter(r => r.account_status === 'active').length,
  }

  function exportAccounts() {
    downloadCsv(`dawaa-all-accounts-${new Date().toISOString().slice(0,10)}.csv`, filtered.map(r => ({
      الاسم: r.person_name,
      Username: r.username || '',
      الدور: roleLabel(r.role),
      الفرع: r.branch_name || '',
      الحالة: r.account_status || 'بدون حساب',
      نوع_الحساب: r.account_scope === 'rider' ? 'دليفري' : 'إدارة/موظف',
      آخر_دخول: formatDateTime(r.last_login_at),
      PIN_جديد_ظاهر_مرة_واحدة: generatedPins[String(r.account_id || r.rider_id || r.row_id)] || '',
    })))
  }

  return (
    <div className="min-h-screen bg-[#F3F7F8]" dir="rtl">
      <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <button onClick={() => navigate('/admin')} className="rounded-xl bg-white/10 p-2 hover:bg-white/20">
            <ArrowLeft size={20} />
          </button>
          <img src="/logo.png" className="h-10 w-10 rounded-xl bg-white object-contain p-1" alt="دواء" />
          <div className="flex-1">
            <h1 className="text-xl font-black">كل حسابات الفريق</h1>
            <p className="text-xs text-teal-100">الدليفري · مدير الفرع · مدير التشغيل · مدير الفروع · المدير العام · الأدمن</p>
          </div>
          <button onClick={() => void loadAll()} disabled={loading} className="rounded-xl bg-white/10 p-2 hover:bg-white/20 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <section className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          {[
            { label: 'إجمالي الأشخاص', val: stats.totalPeople, icon: <Users size={18}/>, tone: 'text-[#008E92]' },
            { label: 'حسابات موجودة', val: stats.accounts, icon: <UserCheck size={18}/>, tone: 'text-emerald-600' },
            { label: 'إدارة ومديرين', val: stats.managers, icon: <ShieldCheck size={18}/>, tone: 'text-purple-600' },
            { label: 'دليفري', val: stats.riders, icon: <Users size={18}/>, tone: 'text-sky-600' },
            { label: 'بدون حساب', val: stats.noAccount, icon: <UserX size={18}/>, tone: 'text-amber-600' },
            { label: 'نشط', val: stats.active, icon: <LockKeyhole size={18}/>, tone: 'text-emerald-600' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-slate-400">{s.icon}<span className={`text-2xl font-black ${s.tone}`}>{s.val}</span></div>
              <p className="text-xs font-black text-slate-500">{s.label}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-6 text-amber-800">
          ملاحظة أمنية: لا يمكن عرض PIN الحالي بعد تشفيره. يظهر PIN الجديد مرة واحدة فقط بعد الإنشاء أو إعادة التعيين.
        </section>

        <section className="flex flex-wrap gap-2">
          <button onClick={openCreateStaff} className="flex items-center gap-2 rounded-xl bg-[#008E92] px-4 py-2 text-sm font-black text-white hover:bg-[#05777B]">
            <UserPlus size={14} />
            إضافة حساب مدير/موظف
          </button>
          <button onClick={() => void bulkCreateRiderAccounts()} disabled={bulkLoading || filtered.filter(r => r.account_scope === 'rider' && !r.account_id).length === 0}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 disabled:opacity-50">
            <UserPlus size={14} />
            {bulkLoading ? 'جاري الإنشاء...' : 'إنشاء حسابات الدليفري الناقصة'}
          </button>
          <button onClick={exportAccounts} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">
            <Download size={14} />
            تصدير CSV
          </button>
          <button onClick={() => setShowPins(!showPins)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">
            {showPins ? <EyeOff size={14} /> : <Eye size={14} />}
            {showPins ? 'إخفاء PINs الجديدة' : 'إظهار PINs الجديدة'}
          </button>
        </section>

        <section className="grid gap-2 lg:grid-cols-4">
          <div className="relative lg:col-span-1">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو username أو الدور..." className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-8 pl-3 text-sm focus:border-[#008E92] focus:outline-none" />
          </div>
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
            <option value="all">كل الفروع</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
            <option value="all">كل الأدوار</option>
            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
            <option value="all">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
            <option value="no_account">بدون حساب</option>
            <option value="locked">مقفول</option>
          </select>
        </section>

        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center font-black text-slate-400">جاري تحميل كل الحسابات...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center font-black text-slate-400">لا توجد نتائج</div>
        ) : (
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-[#061827] text-right text-white">
                  <tr>
                    <th className="px-4 py-3 font-black">الاسم</th>
                    <th className="px-4 py-3 font-black">Username</th>
                    <th className="px-4 py-3 font-black">الدور</th>
                    <th className="px-4 py-3 font-black">PIN</th>
                    <th className="px-4 py-3 font-black">الفرع</th>
                    <th className="px-4 py-3 font-black text-center">الحالة</th>
                    <th className="px-4 py-3 font-black text-center">آخر دخول</th>
                    <th className="px-4 py-3 font-black text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const pinKey = String(r.account_id || r.rider_id || r.row_id)
                    return (
                      <tr key={r.row_id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-black text-[#061827]">{r.person_name}</p>
                          <p className="text-xs font-bold text-slate-400">{r.account_scope === 'rider' ? 'دليفري' : 'إدارة/موظف'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{r.username || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-black ${roleTone(r.role)}`}>{roleLabel(r.role)}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-black text-[#008E92]">
                          {r.account_id ? (showPins ? (generatedPins[pinKey] || 'PIN مشفر') : '••••') : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-500">{r.branch_name || 'كل الفروع / غير محدد'}</td>
                        <td className="px-4 py-3 text-center">
                          {!r.account_id ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">بدون حساب</span>
                          ) : r.account_status === 'active' ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">نشط</span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-500">غير نشط</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">{formatDateTime(r.last_login_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {!r.account_id ? (
                              <button onClick={() => openCreateForRow(r)} className="rounded-lg bg-[#008E92]/10 px-3 py-1.5 text-xs font-black text-[#008E92]">إنشاء</button>
                            ) : (
                              <>
                                <button onClick={() => openEdit(r)} title="تعديل" className="rounded-lg bg-sky-50 p-1.5 text-sky-600"><Edit3 size={14}/></button>
                                <button onClick={() => openResetPin(r)} title="PIN جديد" className="rounded-lg bg-amber-50 p-1.5 text-amber-600"><Key size={14}/></button>
                                <button onClick={() => openStatus(r)} title={r.account_status === 'active' ? 'إيقاف' : 'تفعيل'} className={`rounded-lg p-1.5 ${r.account_status === 'active' ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600'}`}>
                                  {r.account_status === 'active' ? <ToggleRight size={14}/> : <ToggleLeft size={14}/>}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <Modal
        open={['create_staff','create_for_row','edit'].includes(String(modalType))}
        title={modalType === 'edit' ? `تعديل حساب — ${selected?.person_name}` : modalType === 'create_for_row' ? `إنشاء حساب — ${selected?.person_name}` : 'إضافة حساب مدير/موظف'}
        onClose={() => { setModalType(null); setSelected(null) }}
      >
        <div className="space-y-4" dir="rtl">
          {modalType === 'create_staff' && (
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700">الاسم الظاهر</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} className="w-full rounded-xl border-2 border-slate-200 p-3 font-black focus:border-[#008E92] focus:outline-none" placeholder="مثال: د/ وائل أو المدير العام" />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-black text-slate-700">Username</label>
            <input value={formUsername} onChange={e => setFormUsername(e.target.value.replace(/\s+/g, ' '))} className="w-full rounded-xl border-2 border-slate-200 p-3 font-black focus:border-[#008E92] focus:outline-none" placeholder="اسم الدخول" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700">الدور</label>
              <select value={formRole} onChange={e => setFormRole(e.target.value)} className="w-full rounded-xl border-2 border-slate-200 p-3 font-black focus:border-[#008E92] focus:outline-none">
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700">الفرع</label>
              <select value={formBranchId} onChange={e => setFormBranchId(e.target.value)} className="w-full rounded-xl border-2 border-slate-200 p-3 font-black focus:border-[#008E92] focus:outline-none">
                <option value="">كل الفروع / غير محدد</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700">PIN جديد</label>
              <input value={formPin} onChange={e => setFormPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="w-full rounded-xl border-2 border-slate-200 p-3 text-center font-mono text-xl font-black focus:border-[#008E92] focus:outline-none" placeholder="4 أرقام" maxLength={4} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700">الحالة</label>
              <select value={formStatus} onChange={e => setFormStatus(e.target.value)} className="w-full rounded-xl border-2 border-slate-200 p-3 font-black focus:border-[#008E92] focus:outline-none">
                <option value="active">نشط</option>
                <option value="inactive">غير نشط</option>
              </select>
            </div>
          </div>

          <button onClick={() => void saveAccount()} disabled={saving} className="w-full rounded-xl bg-[#008E92] py-3 font-black text-white disabled:opacity-50">
            {saving ? 'جاري الحفظ...' : 'حفظ الحساب'}
          </button>
        </div>
      </Modal>

      <Modal
        open={modalType === 'reset_pin'}
        title={`إعادة تعيين PIN — ${selected?.person_name}`}
        onClose={() => { setModalType(null); setSelected(null) }}
      >
        <div className="space-y-4" dir="rtl">
          <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">سيظهر الرقم الجديد مرة واحدة فقط بعد الحفظ.</p>
          <input value={formPin} onChange={e => setFormPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="w-full rounded-xl border-2 border-slate-200 p-3 text-center font-mono text-2xl font-black focus:border-[#008E92] focus:outline-none" />
          <button onClick={() => void saveAccount({ resetOnly: true })} disabled={saving} className="w-full rounded-xl bg-amber-500 py-3 font-black text-white disabled:opacity-50">
            تعيين PIN جديد
          </button>
        </div>
      </Modal>

      <Modal
        open={modalType === 'status'}
        title={`${formStatus === 'active' ? 'تفعيل' : 'إيقاف'} الحساب`}
        onClose={() => { setModalType(null); setSelected(null) }}
      >
        <div className="space-y-4" dir="rtl">
          <p className="text-sm font-bold text-slate-600">هل تريد {formStatus === 'active' ? 'تفعيل' : 'إيقاف'} حساب: <b>{selected?.person_name}</b>؟</p>
          <button onClick={() => void saveAccount({ statusOnly: true })} disabled={saving} className={`w-full rounded-xl py-3 font-black text-white disabled:opacity-50 ${formStatus === 'active' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            تأكيد
          </button>
        </div>
      </Modal>
    </div>
  )
}
