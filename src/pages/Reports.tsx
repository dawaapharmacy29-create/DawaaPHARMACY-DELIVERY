import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import { monthlyTrend, supplierDistribution } from '@/data/mockData';
import { BarChart2, TrendingUp, TrendingDown, DollarSign, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('ar-EG');
const fmtFull = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

const reportTabs = ['نظرة عامة', 'تقرير المشتريات', 'تقرير الموردين', 'تقرير الفروع', 'تقرير المصروفات'];

const totalPurchases = 216000;
const totalExpenses = 12500;
const totalPaid = 172000;
const netPurchases = 156000;

export default function Reports() {
  const [activeTab, setActiveTab] = useState('نظرة عامة');
  const [fromDate, setFromDate] = useState('01/01/2026');
  const [toDate, setToDate] = useState('05/17/2026');

  return (
    <AppLayout title="التقارير">
      {/* Report Tabs */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {reportTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-emerald-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {tab}
          </button>
        ))}
        <div className="mr-auto flex items-center gap-2">
          <button onClick={() => toast.info('جارٍ تصدير PDF...')} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"><Download size={14} /> PDF تصدير</button>
          <button onClick={() => toast.info('جارٍ تصدير Excel...')} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"><Download size={14} /> Excel تصدير</button>
        </div>
      </div>

      {/* Date filters */}
      <div className="flex items-center gap-3 mb-6 bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <button className="text-gray-500 hover:text-gray-700">
          <BarChart2 size={16} />
        </button>
        <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        <span className="text-gray-400">—</span>
        <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        <span className="text-sm text-gray-500 mr-2">الفترة:</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="إجمالي المشتريات" value={fmtFull(totalPurchases)} icon={<TrendingUp size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <StatCard label="إجمالي المدفوعات" value={fmtFull(totalPaid)} icon={<DollarSign size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
        <StatCard label="إجمالي المصروفات" value={fmtFull(totalExpenses)} icon={<TrendingDown size={18} className="text-amber-500" />} iconBg="bg-amber-100" />
        <StatCard label="صافي المشتريات" value={fmtFull(netPurchases)} icon={<BarChart2 size={18} className="text-purple-600" />} iconBg="bg-purple-100" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 text-right mb-4">الاتجاه الشهري</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyTrend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
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
        </div>

        {/* Supplier Distribution */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 text-right mb-4">توزيع المشتريات على الموردين</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={supplierDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {supplierDistribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Line Chart - Trend */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 md:col-span-2">
          <h3 className="font-bold text-gray-800 text-right mb-4">تطور المديونية الشهري</h3>
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
      </div>
    </AppLayout>
  );
}
