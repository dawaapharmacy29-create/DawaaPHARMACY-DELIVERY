import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import StatusBadge from '@/components/features/StatusBadge';
import { medicines } from '@/data/mockData';
import { Link2, AlertTriangle, TrendingDown, Package, Search } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function ControlledMedicines() {
  const [filterBranch, setFilterBranch] = useState('الكل');
  const [search, setSearch] = useState('');

  const filtered = medicines.filter(m => {
    const matchBranch = filterBranch === 'الكل' || m.branch === filterBranch;
    const matchSearch = m.name.includes(search) || m.code.includes(search);
    return matchBranch && matchSearch;
  });

  const totalValue = medicines.reduce((s, m) => s + m.totalValue, 0);
  const critical = medicines.filter(m => m.status === 'حرج').length;
  const low = medicines.filter(m => m.status === 'منخفض').length;

  return (
    <AppLayout title="أدوية الستة">
      <div className="flex items-center gap-2 mb-1">
        <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">أدوية تحت الرقابة الخاصة</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 mt-4">
        <StatCard label="إجمالي الأصناف" value={medicines.length} icon={<Package size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
        <StatCard label="حرج (تحت الحد الأدنى)" value={critical} icon={<AlertTriangle size={18} className="text-red-500" />} iconBg="bg-red-100" valueColor="text-red-600" />
        <StatCard label="منخفض" value={low} icon={<TrendingDown size={18} className="text-amber-500" />} iconBg="bg-amber-100" valueColor="text-amber-600" />
        <StatCard label="إجمالي القيمة" value={fmt(totalValue)} icon={<Link2 size={18} className="text-purple-600" />} iconBg="bg-purple-100" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الصنف أو الكود..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          {['الكل', 'فرع زكريا', 'فرع بيسيلة', 'فرع المنشية'].map(b => <option key={b}>{b}</option>)}
        </select>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filtered.map(med => {
          const stockPercent = Math.round((med.currentStock / med.maxStock) * 100);
          const isCritical = med.status === 'حرج';
          const isLow = med.status === 'منخفض';

          return (
            <div key={med.id} className={`bg-white rounded-xl border shadow-sm p-4 ${isCritical ? 'border-red-200' : isLow ? 'border-amber-200' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between mb-2">
                <StatusBadge status={med.status} />
                <div className="text-right">
                  <div className="font-bold text-gray-900">{med.name}</div>
                  <div className="text-xs text-gray-400">{med.code} • {med.category} • {med.branch}</div>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>{med.currentStock} / {med.maxStock}</span>
                  <span>المخزون الحالي</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${isCritical ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(stockPercent, 100)}%` }}
                  />
                </div>
                {isCritical && (
                  <div className="text-xs text-red-500 mt-1 font-medium">ناقص {med.minStock - med.currentStock} وحدة</div>
                )}
              </div>

              <div className="flex items-center justify-between mt-3 text-sm">
                <div className="text-right">
                  <div className="text-xs text-gray-400">إجمالي القيمة</div>
                  <div className="font-semibold text-gray-800">{fmt(med.totalValue)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">سعر الوحدة</div>
                  <div className="font-semibold text-gray-800">{fmt(med.unitPrice)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">الحد الأدنى</div>
                  <div className="font-semibold text-gray-600">{med.minStock}</div>
                </div>
              </div>

              {(isCritical || isLow) && (
                <button
                  onClick={() => toast.success(`تم إرسال طلب شراء عاجل لـ ${med.name}`)}
                  className={`w-full mt-3 py-2 rounded-lg text-sm font-medium transition-colors ${isCritical ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200'}`}
                >
                  {isCritical ? 'طلب شراء عاجل' : 'طلب تجديد مخزون'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
}
