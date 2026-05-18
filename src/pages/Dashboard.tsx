import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import { dashboardStats } from '@/data/mockData';
import { FileText, DollarSign, CreditCard, RefreshCw, TrendingUp, Clock, AlertTriangle, GitCompare, X, Eye, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

const alerts = [
  { id: 1, type: 'warning', message: 'فواتير في انتظار المراجعة: يوجد 3 فواتير جديدة تنتظر المراجعة والاعتماد', action: 'عرض', path: '/pending-review' },
  { id: 2, type: 'caution', message: 'فرع بيسيلة اقترب من حد الشراء: فرع بيسيلة وصل لـ 85% من حد الشراء الشهري', action: null, path: null },
  { id: 3, type: 'warning', message: 'مرتجع معلق: مرتجع من دار الشفاء للأدوية يحتاج مراجعة', action: 'عرض', path: '/returns' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [dismissedAlerts, setDismissedAlerts] = useState<number[]>([]);
  const today = new Date().toLocaleDateString('ar-EG');

  const visibleAlerts = alerts.filter(a => !dismissedAlerts.includes(a.id));

  return (
    <AppLayout title="لوحة التحكم" subtitle={`الفترة: 30/04/2026 — 17/05/2026`}>
      {/* Alerts */}
      <div className="space-y-2 mb-6">
        {visibleAlerts.map(alert => (
          <div
            key={alert.id}
            className={`flex items-center justify-between px-4 py-3 rounded-lg border text-sm ${
              alert.type === 'warning' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'
            }`}
          >
            <div className="flex items-center gap-2 flex-1">
              <AlertTriangle size={16} className="flex-shrink-0" />
              <span>{alert.message}</span>
            </div>
            <div className="flex items-center gap-2 mr-4">
              {alert.action && (
                <button
                  onClick={() => alert.path && navigate(alert.path)}
                  className="text-emerald-600 hover:text-emerald-800 font-medium text-xs border border-emerald-300 rounded px-2 py-0.5"
                >
                  {alert.action}
                </button>
              )}
              <button onClick={() => setDismissedAlerts(p => [...p, alert.id])} className="opacity-60 hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Stats Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <StatCard label="إجمالي الفواتير" value="7" icon={<FileText size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
        <StatCard label="إجمالي المشتريات" value={fmt(dashboardStats.totalPurchases)} icon={<TrendingUp size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <StatCard label="إجمالي المدفوعات" value={fmt(dashboardStats.totalPaid)} icon={<CreditCard size={18} className="text-purple-600" />} iconBg="bg-purple-100" />
        <StatCard label="إجمالي المصروفات" value={fmt(dashboardStats.totalExpenses)} icon={<DollarSign size={18} className="text-yellow-600" />} iconBg="bg-yellow-100" />
        <StatCard label="إجمالي المرتجعات" value={fmt(dashboardStats.totalReturns)} icon={<RefreshCw size={18} className="text-red-500" />} iconBg="bg-red-100" />
      </div>

      {/* Stats Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="كشوف غير مطابقة" value="1" icon={<GitCompare size={18} className="text-pink-500" />} iconBg="bg-pink-100" />
        <StatCard label="موردين بمديونية قديمة" value="2" icon={<AlertTriangle size={18} className="text-orange-500" />} iconBg="bg-orange-100" />
        <StatCard label="إجمالي مديونية الموردين" value={fmt(dashboardStats.totalSupplierDebt)} icon={<BookOpen size={18} className="text-indigo-500" />} iconBg="bg-indigo-100" />
        <StatCard label="انتظار المراجعة" value="3" icon={<Clock size={18} className="text-amber-500" />} iconBg="bg-amber-100" />
        <StatCard label="صافي المشتريات" value={fmt(dashboardStats.netPurchases)} icon={<TrendingUp size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" valueColor="text-emerald-700" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-800 mb-4 text-right">الإجراءات السريعة</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'إضافة فاتورة', color: 'bg-emerald-500 hover:bg-emerald-600', path: '/invoices' },
            { label: 'مراجعة الفواتير', color: 'bg-blue-500 hover:bg-blue-600', path: '/pending-review' },
            { label: 'تسجيل دفعة', color: 'bg-purple-500 hover:bg-purple-600', path: '/supplier-balances' },
            { label: 'مطابقة الكشف', color: 'bg-orange-500 hover:bg-orange-600', path: '/reconciliation' },
          ].map(action => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className={`${action.color} text-white text-sm font-medium py-3 rounded-lg transition-colors`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

function BookOpen({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
