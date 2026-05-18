import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import { useDashboardStats, useInvoices, useBranches } from '@/hooks/useSupabaseData';
import { FileText, Clock, DollarSign, TrendingDown, RefreshCw, AlertTriangle } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading, refetch } = useDashboardStats();
  const { data: invoices } = useInvoices();
  const { data: branches } = useBranches();

  const pendingInvoices = invoices?.filter(i => i.review_status === 'انتظار مراجعة') || [];
  const needsEditInvoices = invoices?.filter(i => i.review_status === 'يحتاج تعديل') || [];

  return (
    <AppLayout title="لوحة التحكم">
      {/* Alerts */}
      <div className="space-y-2 mb-6">
        {pendingInvoices.length > 0 && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <button className="text-xs text-amber-700 underline">عرض</button>
            <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
              <AlertTriangle size={16} className="text-amber-500" />
              <span>فواتير في انتظار المراجعة: يوجد {pendingInvoices.length} فواتير جديدة تنتظر المراجعة والاعتماد</span>
            </div>
          </div>
        )}
        {needsEditInvoices.length > 0 && (
          <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <button className="text-xs text-orange-700 underline">عرض</button>
            <div className="flex items-center gap-2 text-orange-800 text-sm font-medium">
              <AlertTriangle size={16} className="text-orange-500" />
              <span>فواتير تحتاج تعديل: {needsEditInvoices.length} فواتير بحاجة لمراجعة</span>
            </div>
          </div>
        )}
      </div>

      {/* Top Stats */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-gray-500 text-sm hover:text-gray-700">
          <RefreshCw size={14} /> تحديث
        </button>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard label="إجمالي الفواتير" value={stats?.totalInvoices || 0} icon={<FileText size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
          <StatCard label="إجمالي المشتريات" value={fmt(stats?.totalPurchases || 0)} icon={<DollarSign size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
          <StatCard label="إجمالي المدفوعات" value={fmt(stats?.totalPaid || 0)} icon={<DollarSign size={18} className="text-purple-600" />} iconBg="bg-purple-100" />
          <StatCard label="إجمالي المصروفات" value={fmt(stats?.totalExpenses || 0)} icon={<TrendingDown size={18} className="text-amber-500" />} iconBg="bg-amber-100" />
          <StatCard label="إجمالي المرتجعات" value={fmt(stats?.totalReturns || 0)} icon={<RefreshCw size={18} className="text-red-500" />} iconBg="bg-red-100" />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="انتظار المراجعة" value={stats?.pendingReview || 0} icon={<Clock size={18} className="text-amber-600" />} iconBg="bg-amber-100" valueColor="text-amber-600" />
        <StatCard label="صافي المشتريات" value={fmt(stats?.netPurchases || 0)} icon={<DollarSign size={18} className="text-emerald-700" />} iconBg="bg-emerald-100" />
        <StatCard label="عدد الفروع" value={branches?.length || 0} icon={<FileText size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
      </div>

      {/* Recent Invoices */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-800 text-right mb-4">آخر الفواتير</h3>
        {!invoices || invoices.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">لا توجد فواتير بعد</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50">
                <tr>
                  {['رقم الفاتورة', 'المورد', 'الفرع', 'التاريخ', 'القيمة', 'الحالة'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.slice(0, 7).map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-800">{inv.invoice_no}</td>
                    <td className="px-3 py-2.5 text-gray-600">{inv.supplierName}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{inv.branchName}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{new Date(inv.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-800">{fmt(inv.value)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                        inv.review_status === 'معتمد' ? 'bg-emerald-100 text-emerald-700' :
                        inv.review_status === 'انتظار مراجعة' ? 'bg-amber-100 text-amber-700' :
                        inv.review_status === 'يحتاج تعديل' ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>{inv.review_status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
