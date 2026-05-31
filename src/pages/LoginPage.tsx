import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, LogIn, User } from 'lucide-react';
import { toast } from 'sonner';
import { defaultPathForRole } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

const quickLogin = {
  username: 'admin',
  password: 'admin123',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent, override?: typeof quickLogin) => {
    e?.preventDefault();
    if (loading) return;

    const nextUsername = override?.username || username.trim();
    const nextPassword = override?.password || password;
    if (!nextUsername || !nextPassword) {
      toast.error('أدخل اسم المستخدم وكلمة المرور.');
      return;
    }

    setLoading(true);
    try {
      const profile = await login(nextUsername, nextPassword);
      toast.success('تم تسجيل الدخول بنجاح');
      navigate(defaultPathForRole(profile.role), { replace: true });
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ في الاتصال، حاول مرة أخرى.');
      setLoading(false);
    }
  };

  const handleQuickLogin = () => {
    setUsername(quickLogin.username);
    setPassword(quickLogin.password);
    void handleLogin(undefined, quickLogin);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#071824] text-white" dir="rtl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.22),_transparent_34%),linear-gradient(135deg,_#071824_0%,_#0d2b37_52%,_#063b3c_100%)]" />
      <div className="relative min-h-screen flex items-center justify-center px-4 py-8">
        <section className="w-full max-w-md">
          <div className="mb-6 text-center">
            <img
              src="/brand/dawaa-logo.jpeg"
              alt="دليفري صيدليات دواء"
              className="mx-auto h-28 w-28 rounded-3xl bg-white object-contain p-2 shadow-2xl shadow-emerald-500/20"
            />
            <p className="mt-4 text-sm font-semibold text-emerald-200">Dawaa Delivery</p>
            <h1 className="mt-1 text-3xl font-bold tracking-normal">دليفري صيدليات دواء</h1>
            <p className="mt-2 text-sm text-slate-300">نظام إدارة التوصيل والمشاوير</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/95 p-5 shadow-2xl backdrop-blur text-slate-900 sm:p-7">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">اسم المستخدم</label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoComplete="username"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pr-10 pl-3 text-right text-base outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    placeholder="admin"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">كلمة المرور</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    type={showPassword ? 'text' : 'password'}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pr-10 pl-11 text-right text-base outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    placeholder="admin123"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    disabled={loading}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-base font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <LogIn size={18} />
                {loading ? 'جاري الدخول...' : 'دخول'}
              </button>

              <button
                type="button"
                onClick={handleQuickLogin}
                disabled={loading}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                دخول سريع للاختبار admin / admin123
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
