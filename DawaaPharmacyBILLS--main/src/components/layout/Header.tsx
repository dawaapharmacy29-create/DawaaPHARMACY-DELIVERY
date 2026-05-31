import { Bell, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { user } = useAuth();

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="text-sm text-gray-500">
          صيدليات دواء — نظام المشتريات
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {user && (
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {(user.displayName || 'م')[0]}
            </div>
            <div className="text-right">
              <div className="text-xs font-medium text-gray-800">{user.displayName}</div>
              <div className="text-xs text-gray-400">{user.role}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
