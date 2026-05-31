import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import { useDashboardStats, useInvoices, useExpenses } from '@/hooks/useSupabaseData';
import { BarChart2, TrendingUp, TrendingDown, DollarSign, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { useState } from 'react';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('ar-EG');
const fmtFull = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';
const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];
const reportTabs = ['نظرة عامة', 'تقرير المشتريات', 'تقرير الموردين', 'تقرير الفروع', 'تقرير المصروفات'];

export default function Reports() {
  const { data: stats } = useDashboardStats();
  const { data: invoices = [] } = useInvoices();
  const { data: expenses = [] } = useExpenses();
  const [activeTab, setActiveTab] = useState('نظرة عامة');

  // Build monthly trend from real invoices
  const monthlyMap: Record<string, { month: string; purchases: number; paid: number; returns: number }> = {};
  invoices.forEach(inv => {
    const d = new Date(inv.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('ar-EG', { month: 'long' });
    if (!monthlyMap[key]) monthlyMap[key] = { month: label, purchases: 0, paid: 0, returns: 0 };
    monthlyMap[key].purchases += inv.value || 0;
    monthlyMap[key].paid += (inv.value || 0) - (inv.remaining || 0);
    monthlyMap[key].returns += inv.returned || 0;
  });
  const monthlyTrend = Object.values(monthlyMap).slice(-6);

  // Supplier distribution
  const supplierMap: Record<string, number> = {};
  invoices.forEach(inv => {
    const name = inv.supplierName || 'غير معروف';
    supplierMap[name] = (supplierMap[name] || 0) + (inv.value || 0);
  });
  const supplierDist = Object.entries(supplierMap).map(([name, value]) => ({ name, value }));

  return (
    <AppLayout title="التقارير">
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {reportTabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-emerald-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {tab}
          </button>
        ))}
        <div className="mr-auto flex items-center gap-2">
          <button onClick={() => toast.info('جارٍ تصدير PDF...')} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"><Download size={14} /> PDF</button>
          <button onClick={() => toast.info('جارٍ تصدير Excel...')} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"><Download size={14} /> Excel</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="إجمالي المشتريات" value={fmtFull(stats?.totalPurchases || 0)} icon={<TrendingUp size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <StatCard label="إجمالي المدفوعات" value={fmtFull(stats?.totalPaid || 0)} icon={<DollarSign size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
        <StatCard label="إجمالي المصروفات" value={fmtFull(stats?.totalExpenses || 0)} icon={<TrendingDown size={18} className="text-amber-500" />} iconBg="bg-amber-100" />
        <StatCard label="صافي المشتريات" value={fmtFull(stats?.netPurchases || 0)} icon={<BarChart2 size={18} className="text-purple-600" />} iconBg="bg-purple-100" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 text-right mb-4">الاتجاه الشهري</h3>
          {monthlyTrend.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-gray-400 text-sm">لا توجد بيانات كافية</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={v => fmt(v / 1000) + 'K'} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtFull(v)} />
                <Legend />
                <Bar dataKey="purchases" name="المشتريات" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="paid" name="المدفوع" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="returns" name="المرتجعات" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 text-right mb-4">توزيع المشتريات على الموردين</h3>
          {supplierDist.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-gray-400 text-sm">لا توجد بيانات</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={supplierDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                  label={({ name, percent }) => `${name.substring(0, 8)} ${(percent * 100).toFixed(0)}%`}>
                  {supplierDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtFull(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {monthlyTrend.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 md:col-span-2">
            <h3 className="font-bold text-gray-800 text-right mb-4">تطور المشتريات الشهري</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={v => fmt(v / 1000) + 'K'} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtFull(v)} />
                <Legend />
                <Line type="monotone" dataKey="purchases" name="المشتريات" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="paid" name="المدفوع" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
