import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, User, Lock } from 'lucide-react'
import { clearRiderSession, getUserProfile, loginUnified, loginWithPin, resolveAdminLogin, setRiderSession } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import PwaInstallPrompt from '../components/PwaInstallPrompt'

function normalizeUsername(value: string) {
  const trimmed = value.trim()
  // الأسماء العربية كما هي — اللاتينية → uppercase
  return /[\u0600-\u06FF]/.test(trimmed) ? trimmed : trimmed.toUpperCase()
}

function normalizePin(value: string) {
  return value.trim()
}

function friendlyRiderError(result: any) {
  const errMap: Record<string, string> = {
    username_not_found: 'اسم المستخدم غير موجود أو الحساب غير نشط',
    account_not_found: 'الحساب مش مفعّل. كلم الإدارة.',
    wrong_pin: 'PIN غير صحيح',
    account_locked: 'الحساب متقفل مؤقتًا بعد محاولات كتير. حاول بعد شوية.',
    pin_disabled: 'PIN غير مفعّل لهذا الحساب. كلم الإدارة.',
    account_inactive: 'الحساب غير نشط. كلم الإدارة.',
    device_not_approved: 'هذا الحساب مربوط بجهاز آخر. برجاء التواصل مع الإدارة لاعتماد الجهاز الجديد.',
  }
  const rawErr = result?.error || ''
  return rawErr && errMap[rawErr]
    ? errMap[rawErr]
    : (result?.message || result?.error || 'اسم المستخدم أو كلمة السر مش صح')
}

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Admins can use email/password or a short alias like: dr.moaz / 9493.
  // Riders use username/PIN from rider_accounts.
  const adminEmail = resolveAdminLogin(username)
  const looksLikeAdmin = !!adminEmail

  const handleRiderLogin = async () => {
    const riderUsername = normalizeUsername(username)
    const pin = normalizePin(password)

    if (pin.length < 4) {
      setError('الـ PIN لازم يكون 4 أرقام على الأقل')
      return
    }

    const result = await loginWithPin(riderUsername, pin)

    if (!result?.success || (!result.rider_id && !result.account_id)) {
      const errMsg = friendlyRiderError(result)
      setError(errMsg)
      // لو المشكلة في الـ device، نوضح الخطوة التالية
      if (result?.error === 'device_not_approved') {
        // نمسح الـ device binding المحلي عشان المحاولة التالية تكون من جهاز جديد
        localStorage.removeItem('dawaa_device_id_v1')
        localStorage.removeItem('dawaa_device_label_v1')
      }
      return
    }

    const role = result.role || 'rider'
    const isManagerRole = ['branch_manager', 'operations_manager', 'branches_manager', 'admin', 'general_manager', 'shift_manager'].includes(role)

    setRiderSession({
      account_id: result.account_id,
      rider_id: result.rider_id || '',
      username: result.username || riderUsername,
      rider_name: result.rider_name || (result as any).display_name || riderUsername,
      branch_id: result.branch_id,
      branch_name: result.branch_name,
      role,
      must_change_pin: !!result.must_change_pin,
      session_token: result.session_token,
    })

    toast.success(`أهلاً ${result.rider_name || (result as any).display_name || riderUsername} 👋`)
    navigate(isManagerRole ? (role === 'branch_manager' ? '/admin/branch' : '/admin') : '/rider', { replace: true })
  }

  const handleManagerPinLogin = async () => {
    const pin = normalizePin(password)
    const managerUsername = username.trim()
    const result = await loginWithPin(managerUsername, pin)

    if (!result?.success || !result.account_id) {
      const message = friendlyRiderError(result)
      throw new Error(typeof message === 'string' ? message : 'تعذر التحقق من حساب الإدارة بالـ PIN')
    }

    const role = result.role || ''
    const managerRoles = ['branch_manager', 'operations_manager', 'branches_manager', 'admin', 'general_manager', 'shift_manager', 'customer_service_manager']
    if (!managerRoles.includes(role)) {
      throw new Error('الحساب ليس حساب إدارة')
    }

    await supabase.auth.signOut().catch(() => undefined)
    setRiderSession({
      account_id: result.account_id,
      rider_id: result.rider_id || '',
      username: result.username || managerUsername,
      rider_name: result.rider_name || (result as any).display_name || managerUsername,
      branch_id: result.branch_id,
      branch_name: result.branch_name,
      role,
      must_change_pin: !!result.must_change_pin,
      session_token: result.session_token,
    })

    toast.success(`أهلاً ${result.rider_name || (result as any).display_name || managerUsername} 👋`)
    navigate(role === 'branch_manager' ? '/admin/branch' : '/admin', { replace: true })
  }

  const handleAdminLogin = async () => {
    const loginName = resolveAdminLogin(username) || username.trim()
    const authData = await loginUnified(loginName, password.trim())
    const userId = authData.user?.id
    if (!userId) throw new Error('no user id')

    const profile = await getUserProfile(userId)
    if (!profile) {
      await supabase.auth.signOut()
      setError('الحساب موجود بس مش مربوط. كلم الإدارة.')
      return
    }
    if (profile.status !== 'active') {
      await supabase.auth.signOut()
      setError('الحساب متوقف. كلم الإدارة.')
      return
    }

    // مهم جدًا: نمسح جلسة الدليفري/PIN القديمة حتى لا تمنع دخول الإدارة.
    clearRiderSession()

    toast.success(`أهلاً ${profile.display_name}`)
    navigate(profile.role === 'rider' ? '/rider' : (profile.role === 'branch_manager' ? '/admin/branch' : '/admin'), { replace: true })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('اكتب اسم المستخدم وكلمة السر الأول')
      return
    }

    setLoading(true)
    setError('')

    try {
      const pinCandidate = normalizePin(password)
      const shouldTryPinFirst = /^\d{4,6}$/.test(pinCandidate)

      if (looksLikeAdmin) {
        if (shouldTryPinFirst) {
          try {
            await handleAdminLogin()
          } catch {
            // على الموبايل الجديد قد لا تتوفر جلسة Supabase Auth أو قد يفشل مسار الإيميل.
            // في هذه الحالة نجرب نفس حساب الإدارة عبر rider_pin_login بشكل آمن.
            await handleManagerPinLogin()
          }
        } else {
          await handleAdminLogin()
        }
      } else if (shouldTryPinFirst) {
        // أرقام فقط = PIN → Rider login
        await handleRiderLogin()
      } else {
        // باقي الحالات = rider username/password-like fallback
        await handleRiderLogin()
      }
    } catch (err: any) {
      const msg = err?.message ?? ''
      if (msg.includes('PIN غير صحيح') || msg.includes('wrong_pin')) {
        setError('PIN غير صحيح')
      } else if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) {
        setError('اسم المستخدم أو كلمة السر مش صح')
      } else if (msg.includes('Email not confirmed')) {
        setError('الإيميل محتاج تأكيد. كلم الإدارة.')
      } else if (msg.includes('User not found')) {
        setError('المستخدم مش موجود')
      } else {
        setError(msg || 'حصلت مشكلة في تسجيل الدخول. كلم الإدارة.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <PwaInstallPrompt />
    <div className="min-h-screen bg-gradient-to-b from-[#061827] to-[#0a2540] p-4" dir="rtl">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] bg-white shadow-2xl md:grid-cols-[0.95fr_1.05fr]">

          <div className="hidden bg-gradient-to-br from-[#051827] to-[#0E5A5F] p-8 text-white md:flex md:flex-col md:justify-between">
            <div>
              <img src="/logo.png" alt="صيدليات دواء"
                className="h-24 w-24 rounded-3xl bg-white object-contain p-2 shadow-xl" />
              <h1 className="mt-8 text-4xl font-black">Dawaa Delivery</h1>
              <p className="mt-3 max-w-md text-lg text-teal-50">
                دفتر دليفري إلكتروني ذكي — أوردرات، مشاوير، حوافز، مطابقة فواتير.
              </p>
            </div>
            <div className="rounded-3xl bg-white/10 p-4 text-sm text-teal-50">
              الدليفري: اكتب username والـ PIN.<br />
              الإدارة: اكتب dr.moaz والـ PIN أو الإيميل وكلمة السر.
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mb-8 text-center">
              <img src="/logo.png" alt="صيدليات دواء"
                className="mx-auto h-24 w-24 rounded-3xl object-contain shadow-sm" />
              <h2 className="mt-4 text-3xl font-black text-[#061827]">
                {looksLikeAdmin ? 'دخول الإدارة' : 'دخول الدليفري'}
              </h2>
              <p className="mt-2 font-bold text-slate-500">
                {looksLikeAdmin ? 'اكتب dr.moaz أو د معاذ والـ PIN أو الإيميل وكلمة السر' : 'اكتب username والـ PIN'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="dawaa-label">
                  {looksLikeAdmin ? 'البريد الإلكتروني / اسم الإدارة' : 'Username'}
                </label>
                <div className="relative">
                  <User size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setError('') }}
                    className="dawaa-input pr-9 text-right"
                    placeholder={looksLikeAdmin ? 'مثال: dr.moaz أو د معاذ' : 'مثال: AHMD.ALBTL'}
                    disabled={loading}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>

              <div>
                <label className="dawaa-label">
                  {looksLikeAdmin ? 'PIN أو كلمة السر' : 'PIN (4-6 أرقام)'}
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => {
                      const next = looksLikeAdmin ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6)
                      setPassword(next)
                      setError('')
                    }}
                    className={`dawaa-input pr-9 pl-10 ${looksLikeAdmin ? 'text-right' : 'text-center text-2xl font-black tracking-[0.3em]'}`}
                    placeholder={looksLikeAdmin ? '••••••' : '••••'}
                    disabled={loading}
                    inputMode={looksLikeAdmin ? 'text' : 'numeric'}
                    maxLength={looksLikeAdmin ? undefined : 6}
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3">
                  <AlertCircle size={16} className="flex-shrink-0 text-rose-500" />
                  <p className="text-sm font-bold text-rose-700">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="dawaa-btn-primary w-full bg-[#008E92] hover:bg-[#05777B] disabled:opacity-60">
                {loading
                  ? <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      جاري الدخول...
                    </span>
                  : 'دخول 🚀'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs font-bold text-slate-400">
              الدليفري يدخل بالـ username والـ PIN. الإدارة تدخل بـ dr.moaz أو د معاذ أو الإيميل وكلمة السر.
            </p>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
