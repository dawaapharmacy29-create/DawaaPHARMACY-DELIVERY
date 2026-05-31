import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useInvoices } from '@/hooks/useSupabaseData';
import {
  LayoutDashboard, FileText, Clock, Link2, Package, DollarSign,
  RefreshCw, Users, BookOpen, GitCompare, BarChart2, ClipboardList,
  UserCog, Settings, LogOut, Bike, Route, Calculator
} from 'lucide-react';

const navItems = [
  { label: 'الرئيسية', icon: LayoutDashboard, path: '/' },
  { label: 'فواتير الشراء', icon: FileText, path: '/invoices' },
  { label: 'انتظار المراجعة', icon: Clock, path: '/pending-review', badge: true },
  { label: 'أدوية الستة', icon: Link2, path: '/controlled-medicines' },
  { label: 'الراكد والإكسير', icon: Package, path: '/dead-stock' },
  { label: 'المصروفات', icon: DollarSign, path: '/expenses' },
  { label: 'المرتجعات', icon: RefreshCw, path: '/returns' },
  { label: 'الموردين', icon: Users, path: '/suppliers' },
  { label: 'أرصدة الموردين', icon: BookOpen, path: '/supplier-balances' },
  { label: 'مطابقة كشف المورد', icon: GitCompare, path: '/reconciliation' },
  { label: 'التقارير', icon: BarChart2, path: '/reports' },
  { label: 'الدليفري', icon: Bike, path: '/delivery' },
  { label: 'كونسول المندوب', icon: Route, path: '/delivery/rider' },
  { label: 'أوردرات الدليفري', icon: ClipboardList, path: '/delivery/orders' },
  { label: 'حساب الدليفري', icon: Calculator, path: '/delivery/payroll' },
  { label: 'سجل العمليات', icon: ClipboardList, path: '/operations-log' },
  { label: 'المستخدمين والصلاحيات', icon: UserCog, path: '/users' },
  { label: 'الإعدادات', icon: Settings, path: '/settings' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { data: invoices = [] } = useInvoices();
  const pendingCount = invoices.filter(i => i.review_status === 'انتظار مراجعة').length;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="fixed right-0 top-0 h-screen w-56 bg-[#1a2332] flex flex-col z-50 overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-2 p-4 border-b border-white/10">
        <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">د</span>
        </div>
        <div>
          <div className="text-white font-bold text-sm leading-tight">صيدليات دواء</div>
          <div className="text-gray-400 text-xs">نظام المشتريات</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          const badgeCount = item.badge ? pendingCount : 0;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-right transition-all duration-150 ${
                isActive ? 'bg-emerald-500 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="text-sm flex-1 text-right">{item.label}</span>
              {badgeCount > 0 && !isActive && (
                <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {(user?.displayName || 'م')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-medium truncate">{user?.displayName || 'مستخدم'}</div>
            <div className="text-gray-400 text-xs">{user?.role || ''}</div>
          </div>
          <button onClick={handleLogout} title="تسجيل الخروج" className="text-gray-400 hover:text-red-400 transition-colors flex-shrink-0">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
