import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, ArrowLeft, User, AtSign, Mail, LogIn } from 'lucide-react';

type Step = 'login' | 'register-email' | 'register-otp' | 'register-password';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, authError, login, sendOtp, verifyOtpAndSetPassword } = useAuth();
  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [usernameInput, setUsernameInput] = useState('DR.MOAZ');
  const [password, setPassword] = useState('9493');
  const [otp, setOtp] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'rider') navigate('/delivery/rider', { replace: true });
    else navigate('/delivery', { replace: true });
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formLoading) return;
    setFormLoading(true);
    try {
      const profile = await login(usernameInput, password);
      toast.success(`أهلًا ${profile.displayName}`);
      navigate(profile.role === 'rider' ? '/delivery/rider' : '/delivery', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'خطأ في تسجيل الدخول');
    } finally {
      setFormLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await sendOtp(email);
      toast.success('تم إرسال رمز التحقق على بريدك الإلكتروني');
      setStep('register-otp');
    } catch (err: any) {
      toast.error(err.message || 'تعذر إرسال رمز التحقق');
    } finally {
      setFormLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) { toast.error('أدخل رمز التحقق كاملاً'); return; }
    setStep('register-password');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    setFormLoading(true);
    try {
      await verifyOtpAndSetPassword(email, otp, newPassword, displayName);
      toast.success('تم إنشاء الحساب بنجاح');
    } catch (err: any) {
      toast.error(err.message || 'تعذر إنشاء الحساب');
    } finally {
      setFormLoading(false);
    }
  };

  const busy = formLoading || authLoading;

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#075985_0,#0f172a_40%,#07111f_100%)] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(120deg, rgba(16,185,129,.25), transparent 30%, rgba(20,184,166,.16))' }} />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-7">
          <div className="mx-auto mb-4 h-28 w-28 rounded-3xl bg-white p-2 shadow-2xl shadow-emerald-500/20">
            <img src="/brand/dawaa-logo.jpeg" alt="صيدليات دواء" className="h-full w-full rounded-2xl object-contain" />
          </div>
          <div className="text-sm font-bold text-emerald-300">Dawaa Delivery</div>
          <h1 className="mt-1 text-3xl font-black text-white">دليفري صيدليات دواء</h1>
          <p className="mt-2 text-sm text-slate-300">نظام إدارة التوصيل والمشاوير والحوافز</p>
        </div>

        <div className="rounded-3xl border border-white/15 bg-white/95 p-7 shadow-2xl backdrop-blur">
          {authError && step === 'login' && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              {authError}
            </div>
          )}

          {step === 'login' && (
            <>
              <h2 className="mb-5 text-center text-2xl font-black text-slate-950">تسجيل الدخول</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">اسم المستخدم</label>
                  <div className="relative">
                    <AtSign size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={e => setUsernameInput(e.target.value)}
                      required
                      placeholder="DR.MOAZ"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-3 pr-10 text-right text-base font-bold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">كلمة المرور</label>
                  <div className="relative">
                    <Lock size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      placeholder="9493"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-right text-base font-bold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-base font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  <LogIn size={18} />
                  {busy ? 'جارٍ الدخول...' : 'دخول'}
                </button>
                <button
                  type="button"
                  onClick={() => { setUsernameInput('DR.MOAZ'); setPassword('9493'); }}
                  className="w-full rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100"
                >
                  ⚡ دخول سريع للاختبار (DR.MOAZ / 9493)
                </button>
              </form>
              <div className="mt-4 text-center">
                <button onClick={() => setStep('register-email')} className="text-sm font-bold text-emerald-700 hover:underline">
                  إنشاء حساب جديد
                </button>
              </div>
            </>
          )}

          {step === 'register-email' && (
            <>
              <button onClick={() => setStep('login')} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft size={14} /> رجوع
              </button>
              <h2 className="mb-6 text-center text-xl font-black text-slate-900">إنشاء حساب جديد</h2>
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">البريد الإلكتروني</label>
                  <div className="relative">
                    <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@dawaa.com" className="w-full rounded-2xl border border-slate-200 py-3 pl-3 pr-10 text-right text-sm outline-none focus:ring-4 focus:ring-emerald-100" />
                  </div>
                </div>
                <button type="submit" disabled={busy} className="w-full rounded-2xl bg-emerald-500 py-3 font-black text-white disabled:opacity-50">
                  {busy ? 'جارٍ الإرسال...' : 'إرسال رمز التحقق'}
                </button>
              </form>
            </>
          )}

          {step === 'register-otp' && (
            <>
              <h2 className="mb-2 text-center text-xl font-black text-slate-900">رمز التحقق</h2>
              <p className="mb-6 text-center text-sm text-slate-500">تم إرسال رمز التحقق إلى <strong>{email}</strong></p>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <input type="text" value={otp} onChange={e => setOtp(e.target.value)} required maxLength={6} placeholder="XXXX" className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-center text-lg font-black tracking-widest outline-none focus:ring-4 focus:ring-emerald-100" />
                <button type="submit" className="w-full rounded-2xl bg-emerald-500 py-3 font-black text-white">التالي</button>
              </form>
            </>
          )}

          {step === 'register-password' && (
            <>
              <h2 className="mb-6 text-center text-xl font-black text-slate-900">إكمال التسجيل</h2>
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="relative">
                  <User size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} required placeholder="الاسم الكامل" className="w-full rounded-2xl border border-slate-200 py-3 pl-3 pr-10 text-right text-sm outline-none focus:ring-4 focus:ring-emerald-100" />
                </div>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} placeholder="كلمة المرور" className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-right text-sm outline-none focus:ring-4 focus:ring-emerald-100" />
                <button type="submit" disabled={busy} className="w-full rounded-2xl bg-emerald-500 py-3 font-black text-white disabled:opacity-50">
                  {busy ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
