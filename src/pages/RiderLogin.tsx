import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Lock, User } from 'lucide-react'
import { setRiderSession } from '../lib/auth'
import { getOrCreateDeviceId, getDeviceLabel } from '../lib/deviceBinding'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

type Step = 'login' | 'change_pin'

export default function RiderLogin() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('login')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [showNewPin, setShowNewPin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingRiderId, setPendingRiderId] = useState<string | null>(null)
  const [pendingRiderName, setPendingRiderName] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !pin.trim()) {
      setError('ادخل username والـ PIN')
      return
    }
    setLoading(true)
    setError('')
    try {
      // ─── RPC مباشر بدون Supabase Auth ───────────────────────────────
      // نحضّر device info
      const deviceId    = getOrCreateDeviceId()
      const deviceLabel = getDeviceLabel()
      // نحوّل username: عربي كما هو، لاتيني uppercase
      const rawUsername = username.trim()
      const cleanUname  = /[\u0600-\u06FF]/.test(rawUsername) ? rawUsername : rawUsername.toUpperCase()

      // نجرب الـ signature الجديدة مع device أولاً، ثم القديمة كـ fallback
      let data: any = null
      let rpcError: any = null;

      ({ data, error: rpcError } = await supabase.rpc('rider_pin_login', {
        p_username: cleanUname,
        p_pin: pin.trim(),
        p_ip: null,
        p_ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        p_device_id: deviceId,
        p_device_label: deviceLabel,
      }))

      // Fallback: لو الـ RPC ما بتدعمش device params بعد
      if (rpcError && (rpcError.message?.includes('argument') || rpcError.message?.includes('parameter') || rpcError.code === 'PGRST202')) {
        ;({ data, error: rpcError } = await supabase.rpc('rider_pin_login', {
          p_username: cleanUname,
          p_pin: pin.trim(),
          p_ip: null,
          p_ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }))
      }


      if (rpcError) {
        setError(rpcError.message || 'حصلت مشكلة في الاتصال. كلم الأدمن.')
        return
      }

      // تعامل مع data كـ object أو array
      const result = Array.isArray(data) ? data[0] : data

      if (!result) {
        setError('حصلت مشكلة في الاتصال. كلم الأدمن.')
        return
      }

      if (result.success !== true) {
        const errMap: Record<string, string> = {
          username_not_found: 'username مش موجود أو الحساب غير نشط',
          account_not_found:  'الحساب مش مفعّل. كلم الأدمن.',
          wrong_pin:          `PIN غلط${result?.attempts_left !== undefined ? ` — باقيلك ${result.attempts_left} محاولة` : ''}`,
          account_locked:     'الحساب متقفل مؤقتاً بعد محاولات كتير. استنى 15 دقيقة.',
          pin_disabled:       'PIN غير مفعّل لهذا الحساب. كلم الأدمن.',
          account_inactive:   'الحساب غير نشط. كلم الأدمن.',
        }
        const rawErr = result?.error || ''
        const errorMsg = (rawErr && errMap[rawErr]) ? errMap[rawErr] : (result?.message || result?.error || 'اسم المستخدم أو كلمة السر مش صح')
        setError(errorMsg)
        return
      }

      // ─── تسجيل دخول ناجح ───────────────────────────────────────────
      // احفظ الجلسة الكاملة
      localStorage.setItem('dawaa_rider_session', JSON.stringify({
        account_id: result.account_id || '',
        rider_id: result.rider_id,
        username: result.username || cleanUname,
        rider_name: result.rider_name,
        branch_id: result.branch_id || '',
        branch_name: result.branch_name || '',
        role: result.role || 'rider',
        must_change_pin: !!result.must_change_pin,
        session_token: result.session_token || '',
        logged_in_at: new Date().toISOString(),
      }))

      // backward compat
      setRiderSession({
        account_id: result.account_id,
        rider_id: result.rider_id,
        username: result.username || cleanUname,
        rider_name: result.rider_name,
        branch_id: result.branch_id,
        branch_name: result.branch_name,
        role: result.role || 'rider',
        must_change_pin: !!result.must_change_pin,
        session_token: result.session_token || ''
      })

      if (result.must_change_pin) {
        setPendingRiderId(result.rider_id)
        setPendingRiderName(result.rider_name)
        setStep('change_pin')
        return
      }

      toast.success(`أهلاً ${result.rider_name} 👋`)
      navigate('/rider')
    } catch (err: any) {
      setError('حصلت مشكلة في تسجيل الدخول. كلم الأدمن.')
    } finally {
      setLoading(false)
    }
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault()
    if (newPin.length < 4) { setError('الـ PIN لازم 4 أرقام على الأقل'); return }
    if (newPin !== confirmPin) { setError('الـ PIN التاني مش متطابق'); return }
    if (newPin === pin) { setError('الـ PIN الجديد لازم يختلف عن القديم'); return }
    setLoading(true)
    setError('')
    try {
      // جرب الـ RPC أولاً
      const { data } = await supabase.rpc('rider_change_pin', {
        p_rider_id: pendingRiderId,
        p_new_pin:  newPin,
        p_token: (() => { try { return JSON.parse(localStorage.getItem('dawaa_rider_session') || '{}').session_token || null } catch { return null } })()
      })

      if (data?.success === false) {
        // Fallback: update مباشر
        await supabase.from('riders').update({
          pin: newPin,
          must_change_pin: false,
          pin_changed_at: new Date().toISOString()
        }).eq('id', pendingRiderId)
      }

      // حدّث must_change_pin في الجلسة
      try {
        const raw = localStorage.getItem('dawaa_rider_session')
        if (raw) {
          const s = JSON.parse(raw)
          s.must_change_pin = false
          localStorage.setItem('dawaa_rider_session', JSON.stringify(s))
        }
      } catch {}

      toast.success('تم تغيير الـ PIN بنجاح ✅')
      navigate('/rider')
    } catch (err) {
      setError('معرفتش أغير الـ PIN. كلم الأدمن.')
    } finally {
      setLoading(false)
    }
  }

  // ===== CHANGE PIN SCREEN =====
  if (step === 'change_pin') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#061827] to-[#0a2540] p-4" dir="rtl">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
              <Lock size={32} className="text-amber-600" />
            </div>
            <h1 className="text-2xl font-black text-[#061827]">غيّر الـ PIN</h1>
            <p className="mt-1 text-sm text-slate-500">
              أهلاً {pendingRiderName}، لازم تغير الـ PIN الافتراضي
            </p>
          </div>

          <form onSubmit={handleChangePin} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700">PIN جديد (4-6 أرقام)</label>
              <div className="relative">
                <input
                  type={showNewPin ? 'text' : 'password'}
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-2xl border-2 border-slate-200 p-3 pr-4 text-center text-2xl font-black tracking-[0.5em] focus:border-[#008E92] focus:outline-none"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••"
                  autoFocus
                />
                <button type="button" onClick={() => setShowNewPin(!showNewPin)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showNewPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-slate-700">تأكيد PIN الجديد</label>
              <input
                type={showNewPin ? 'text' : 'password'}
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-2xl border-2 border-slate-200 p-3 text-center text-2xl font-black tracking-[0.5em] focus:border-[#008E92] focus:outline-none"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3">
                <AlertCircle size={16} className="text-rose-500 flex-shrink-0" />
                <p className="text-sm font-bold text-rose-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || newPin.length < 4}
              className="w-full rounded-2xl bg-[#008E92] py-4 font-black text-white hover:bg-[#05777B] disabled:opacity-50"
            >
              {loading ? 'جاري الحفظ...' : 'حفظ PIN الجديد'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ===== LOGIN SCREEN =====
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#061827] to-[#0a2540] p-4" dir="rtl">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <img src="/dawaa-logo.jpeg" className="mx-auto h-20 w-20 rounded-3xl bg-white object-contain p-2 shadow-2xl" alt="دواء" />
          <h1 className="mt-4 text-3xl font-black text-white">دخول الدليفري</h1>
          <p className="mt-1 text-sm text-teal-200">صيدليات دواء — نظام إدارة الدليفري</p>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Username */}
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700">Username</label>
              <div className="relative">
                <User size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full rounded-2xl border-2 border-slate-200 py-3 pr-10 pl-4 font-bold focus:border-[#008E92] focus:outline-none"
                  placeholder="ادخل username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                />
              </div>
            </div>

            {/* PIN */}
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700">PIN</label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-2xl border-2 border-slate-200 py-3 pr-4 pl-10 text-center text-2xl font-black tracking-[0.5em] focus:border-[#008E92] focus:outline-none"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••"
                />
                <button type="button" onClick={() => setShowPin(!showPin)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3">
                <AlertCircle size={16} className="text-rose-500 flex-shrink-0" />
                <p className="text-sm font-bold text-rose-700">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username.trim() || pin.length < 4}
              className="w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white shadow-lg hover:bg-[#05777B] disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  جاري الدخول...
                </span>
              ) : 'دخول'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            نسيت الـ PIN؟ كلم مسؤول الفرع
          </p>
        </div>
      </div>
    </div>
  )
}
