import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <Sidebar />
      <div className="min-h-screen lg:mr-64">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src="/brand/dawaa-logo.jpeg" alt="Dawaa Delivery" className="h-11 w-11 rounded-xl object-contain bg-white p-1 ring-1 ring-slate-200" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-950">Dawaa Delivery</div>
                <div className="truncate text-xs text-slate-500">دليفري صيدليات دواء</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden text-left sm:block">
                <div className="text-sm font-bold text-slate-800">{user?.displayName || 'مستخدم'}</div>
                <div className="text-xs text-slate-500">{user?.role || ''}</div>
              </div>
              <button onClick={handleLogout} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-red-600" aria-label="تسجيل الخروج">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6">
          <div className="mb-5">
            <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
