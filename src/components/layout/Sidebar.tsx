import { Bell, Bike, Calculator, ClipboardList, LayoutDashboard, Route, Settings, ShieldAlert, Trophy, Wallet } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { label: 'لوحة الدليفري', icon: LayoutDashboard, path: '/delivery' },
  { label: 'شاشة المندوب', icon: Bike, path: '/delivery/rider' },
  { label: 'الأوردرات', icon: ClipboardList, path: '/delivery/orders' },
  { label: 'المشاوير', icon: Route, path: '/delivery/trips' },
  { label: 'الترتيب', icon: Trophy, path: '/delivery/leaderboard' },
  { label: 'الحوافز', icon: Calculator, path: '/delivery/incentives' },
  { label: 'المستحقات', icon: Wallet, path: '/delivery/payroll' },
  { label: 'التنبيهات', icon: Bell, path: '/delivery/notifications' },
  { label: 'الحوادث', icon: ShieldAlert, path: '/delivery/incidents' },
  { label: 'الإعدادات', icon: Settings, path: '/delivery/settings' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      <aside className="fixed right-0 top-0 z-50 hidden h-screen w-64 flex-col border-l border-white/10 bg-[#071824] lg:flex">
        <div className="border-b border-white/10 p-4">
          <img src="/brand/dawaa-logo.jpeg" alt="Dawaa Delivery" className="h-16 w-16 rounded-2xl bg-white object-contain p-1.5" />
          <div className="mt-3 text-lg font-bold text-white">Dawaa Delivery</div>
          <div className="text-sm text-emerald-100">نظام إدارة الدليفري والتوصيل</div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-bold transition ${
                  active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-5 border-t border-slate-200 bg-white px-2 py-2 shadow-2xl lg:hidden">
        {navItems.slice(0, 5).map(item => {
          const Icon = item.icon;
          const active = location.pathname === item.path;
          return (
            <button key={item.path} onClick={() => navigate(item.path)} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-bold ${active ? 'text-emerald-600' : 'text-slate-500'}`}>
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
