import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import StatusBadge from '@/components/features/StatusBadge';
import { useDeadStock, useBranches } from '@/hooks/useSupabaseData';
import { Package, AlertTriangle, Search, Download, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function DeadStock() {
  const { data: items = [], isLoading } = useDeadStock();
  const { data: branches = [] } = useBranches();
  const [filterBranch, setFilterBranch] = useState('الكل');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [search, setSearch] = useState('');

  const filtered = items.filter(item => {
    const matchBranch = filterBranch === 'الكل' || item.branchName === filterBranch;
    const matchStatus = filterStatus === 'الكل' || item.status === filterStatus;
    const matchSearch = item.name.includes(search) || item.code.includes(search);
    return matchBranch && matchStatus && matchSearch;
  });

  const totalValue = items.reduce((s, i) => s + (i.current_stock * i.unit_price), 0);
  const raked = items.filter(i => i.status === 'راكد').length;
  const nearExpiry = items.filter(i => i.status === 'قريب الانتهاء').length;
  const expired = items.filter(i => i.status === 'منتهي الصلاحية').length;

  return (
    <AppLayout title="الراكد والإكسير">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="إجمالي قيمة الراكد" value={fmt(totalValue)} icon={<Package size={18} className="text-orange-500" />} iconBg="bg-orange-100" valueColor="text-orange-600" />
        <StatCard label="منتهي الصلاحية" value={expired} icon={<AlertTriangle size={18} className="text-red-500" />} iconBg="bg-red-100" valueColor="text-red-600" />
        <StatCard label="قريب الانتهاء" value={nearExpiry} icon={<AlertTriangle size={18} className="text-amber-500" />} iconBg="bg-amber-100" valueColor="text-amber-600" />
        <StatCard label="راكد" value={raked} icon={<Package size={18} className="text-blue-500" />} iconBg="bg-blue-100" />
      </div>

      <div className="flex gap-3 mb-5 items-center">
        <button onClick={() => toast.info('جارٍ التصدير...')} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50">
          <Download size={14} /> تصدير
        </button>
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الصنف أو الكود..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          <option>الكل</option>
          {branches.map(b => <option key={b.id}>{b.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          {['الكل', 'راكد', 'قريب الانتهاء', 'منتهي الصلاحية'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['كود الصنف', 'اسم الصنف', 'الفرع', 'الكمية', 'القيمة', 'الصلاحية', 'أيام بدون بيع', 'المورد', 'الحالة', 'الإجراء المقترح', 'إجراءات'].map(h => (
                    <th key={h} className="px-3 py-3 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="py-10 text-center text-gray-400 text-sm">لا توجد أصناف راكدة</td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 font-mono text-xs text-gray-600">{item.code}</td>
                    <td className="px-3 py-3 font-medium text-gray-800">{item.name}</td>
                    <td className="px-3 py-3 text-gray-600">{item.branchName}</td>
                    <td className="px-3 py-3 text-gray-800 font-semibold">{item.current_stock}</td>
                    <td className="px-3 py-3 text-gray-800">{fmt(item.current_stock * item.unit_price)}</td>
                    <td className="px-3 py-3 text-gray-600">{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('ar-EG') : '—'}</td>
                    <td className="px-3 py-3">
                      <span className={`font-bold ${(item.days_since_sale || 0) > 90 ? 'text-red-600' : (item.days_since_sale || 0) > 60 ? 'text-amber-600' : 'text-gray-700'}`}>
                        {item.days_since_sale || 0} يوم
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-600">{item.supplierName}</td>
                    <td className="px-3 py-3"><StatusBadge status={item.status} /></td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-32">{item.suggested_action || '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => toast.success('تم إنشاء طلب الإرجاع')} className="text-xs border border-gray-200 text-gray-600 rounded px-2 py-1 hover:bg-gray-50 flex items-center gap-1">
                          <RefreshCw size={11} /> إرجاع
                        </button>
                        <button onClick={() => toast.success('تم إنشاء طلب التحويل')} className="text-xs border border-blue-200 text-blue-600 rounded px-2 py-1 hover:bg-blue-50 flex items-center gap-1">
                          <ArrowLeftRight size={11} /> تحويل
                        </button>
                      </div>
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
