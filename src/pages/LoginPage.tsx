import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Building2, Lock, Eye, EyeOff, ArrowLeft, User, AtSign, Mail } from 'lucide-react';

type Step = 'login' | 'register-email' | 'register-otp' | 'register-password';

export default function LoginPage() {
  const { login, sendOtp, verifyOtpAndSetPassword } = useAuth();
  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(usernameInput, password);
    } catch (err: any) {
      toast.error(err.message || 'خطأ في تسجيل الدخول');
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendOtp(email);
      toast.success('تم إرسال رمز التحقق على بريدك الإلكتروني');
      setStep('register-otp');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
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
    setLoading(true);
    try {
      await verifyOtpAndSetPassword(email, otp, newPassword, displayName);
      toast.success('تم إنشاء الحساب بنجاح');
    } catch (err: any) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e293b] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/30">
            <Building2 size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">صيدليات دواء</h1>
          <p className="text-slate-400 text-sm mt-1">نظام المشتريات</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Login */}
          {step === 'login' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 text-center mb-6">تسجيل الدخول</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">اسم المستخدم</label>
                  <div className="relative">
                    <AtSign size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} required
                      placeholder="ADMIN"
                      className="w-full pr-10 pl-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 text-right"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
                  <div className="relative">
                    <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                      placeholder="••••••"
                      className="w-full pr-10 pl-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 text-right"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'جارٍ الدخول...' : 'دخول'}
                </button>
              </form>
              <div className="mt-4 text-center">
                <button onClick={() => setStep('register-email')} className="text-sm text-emerald-600 hover:underline">
                  إنشاء حساب جديد
                </button>
              </div>
            </>
          )}

          {/* Register - Email */}
          {step === 'register-email' && (
            <>
              <button onClick={() => setStep('login')} className="flex items-center gap-1 text-gray-500 text-sm mb-4 hover:text-gray-700">
                <ArrowLeft size={14} /> رجوع
              </button>
              <h2 className="text-xl font-bold text-gray-900 text-center mb-6">إنشاء حساب جديد</h2>
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                  <div className="relative">
                    <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)} required
                      placeholder="name@dawaa.com"
                      className="w-full pr-10 pl-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 text-right"
                    />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                  {loading ? 'جارٍ الإرسال...' : 'إرسال رمز التحقق'}
                </button>
              </form>
            </>
          )}

          {/* Register - OTP */}
          {step === 'register-otp' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 text-center mb-2">رمز التحقق</h2>
              <p className="text-sm text-gray-500 text-center mb-6">تم إرسال رمز التحقق إلى <strong>{email}</strong></p>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">رمز التحقق</label>
                  <input
                    type="text" value={otp} onChange={e => setOtp(e.target.value)} required maxLength={6}
                    placeholder="XXXX"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 text-center tracking-widest text-lg font-bold"
                  />
                </div>
                <button type="submit" className="w-full bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600">
                  التالي
                </button>
              </form>
              <div className="mt-3 text-center">
                <button onClick={() => setStep('register-email')} className="text-sm text-gray-500 hover:text-gray-700">تغيير البريد</button>
              </div>
            </>
          )}

          {/* Register - Password */}
          {step === 'register-password' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 text-center mb-6">إكمال التسجيل</h2>
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
                  <div className="relative">
                    <User size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} required
                      placeholder="الاسم الكامل"
                      className="w-full pr-10 pl-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 text-right"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
                  <input
                    type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6}
                    placeholder="6 أحرف على الأقل"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 text-right"
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                  {loading ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
