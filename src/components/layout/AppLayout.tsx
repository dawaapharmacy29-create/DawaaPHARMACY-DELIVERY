import Sidebar from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Bell } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Sidebar />
      <div className="mr-56 min-h-screen">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {(user?.displayName || 'م')[0]}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-800">{user?.displayName || 'مستخدم'}</div>
                <div className="text-xs text-gray-500">{user?.role || ''}</div>
              </div>
            </div>
            <button className="relative p-2 text-gray-500 hover:text-gray-700">
              <Bell size={18} />
            </button>
          </div>
          <div className="text-right">
            <span className="text-gray-500 text-sm">صيدليات دواء — نظام المشتريات</span>
          </div>
        </div>
        <div className="p-6">
          <div className="mb-5">
            <h1 className="text-xl font-bold text-gray-900 text-right">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 text-right mt-0.5">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
