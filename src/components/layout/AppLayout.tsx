import Sidebar from './Sidebar';
import { Bell, RefreshCw } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Sidebar />
      <div className="mr-56 min-h-screen">
        {/* Top header bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">أ</div>
              <div>
                <div className="text-sm font-medium text-gray-800">أحمد علي</div>
                <div className="text-xs text-gray-500">مدير عام</div>
              </div>
            </div>
            <button className="relative p-2 text-gray-500 hover:text-gray-700">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">3</span>
            </button>
          </div>
          <div className="text-right">
            <span className="text-gray-500 text-sm">صيدليات دواء — نظام المشتريات</span>
          </div>
        </div>

        {/* Page content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
