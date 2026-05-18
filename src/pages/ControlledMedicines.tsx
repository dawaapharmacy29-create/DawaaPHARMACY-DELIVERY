import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import StatusBadge from '@/components/features/StatusBadge';
import { useProducts, useBranches } from '@/hooks/useSupabaseData';
import { Link2, AlertTriangle, Search } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function ControlledMedicines() {
  const { data: products = [], isLoading } = useProducts();
  const { data: branches = [] } = useBranches();
  const [filterBranch, setFilterBranch] = useState('الكل');
  const [search, setSearch] = useState('');

  // Only controlled medicines categories
  const controlled = products.filter(p =>
    ['مخدرات', 'مهدئات', 'مسكنات قوية', 'أدوية خاضعة للرقابة'].includes(p.category)
  );

  const filtered = controlled.filter(m => {
    const matchBranch = filterBranch === 'الكل' || m.branchName === filterBranch;
    const matchSearch = m.name.includes(search) || m.code.includes(search);
    return matchBranch && matchSearch;
  });

  const totalValue = controlled.reduce((s, m) => s + (m.current_stock * m.unit_price), 0);
  const critical = controlled.filter(m => m.current_stock <= m.min_stock).length;
  const low = controlled.filter(m => m.current_stock > m.min_stock && m.current_stock <= m.min_stock * 1.5).length;

  return (
    <AppLayout title="أدوية الستة">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium">أدوية تحت الرقابة الخاصة</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="إجمالي الأصناف" value={controlled.length} icon={<Link2 size={18} className="text-purple-600" />} iconBg="bg-purple-100" />
        <StatCard label="حرج (تحت الحد الأدنى)" value={critical} icon={<AlertTriangle size={18} className="text-red-500" />} iconBg="bg-red-100" valueColor="text-red-600" />
        <StatCard label="منخفض" value={low} icon={<AlertTriangle size={18} className="text-amber-500" />} iconBg="bg-amber-100" valueColor="text-amber-600" />
        <StatCard label="إجمالي القيمة" value={fmt(totalValue)} icon={<Link2 size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الكود..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          <option>الكل</option>
          {branches.map(b => <option key={b.id}>{b.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
          لا توجد أدوية رقابية مسجلة
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filtered.map(med => {
            const isCritical = med.current_stock <= med.min_stock;
            const isLow = !isCritical && med.current_stock <= med.min_stock * 1.5;
            const stockPercent = Math.min(100, Math.round((med.current_stock / med.max_stock) * 100));

            return (
              <div key={med.id} className={`bg-white rounded-xl border shadow-sm p-4 ${isCritical ? 'border-red-200' : isLow ? 'border-amber-200' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isCritical ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {isCritical ? 'حرج' : 'طبيعي'}
                  </span>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">{med.name}</div>
                    <div className="text-xs text-gray-400">{med.code} • {med.category}</div>
                    <div className="text-xs text-gray-400">{med.branchName} • {med.supplierName}</div>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{med.current_stock} / {med.max_stock}</span>
                    <span>المخزون الحالي</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isCritical ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-emerald-500'}`}
                      style={{ width: `${stockPercent}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 text-right mt-1">الحد الأدنى: {med.min_stock}</div>
                  {isCritical && <div className="text-xs text-red-600 font-medium text-right">ناقص {med.min_stock - med.current_stock} وحدة</div>}
                </div>

                <div className="flex justify-between text-sm border-t border-gray-50 pt-2">
                  <div><span className="text-xs text-gray-400">إجمالي القيمة</span><br /><span className="font-bold text-gray-800">{fmt(med.current_stock * med.unit_price)}</span></div>
                  <div className="text-left"><span className="text-xs text-gray-400">سعر الوحدة</span><br /><span className="font-bold text-gray-800">{fmt(med.unit_price)}</span></div>
                </div>

                {isCritical && (
                  <button onClick={() => toast.success(`تم إرسال طلب شراء عاجل لـ ${med.name}`)} className="mt-3 w-full bg-red-50 border border-red-200 text-red-700 rounded-lg py-2 text-xs font-medium hover:bg-red-100">
                    طلب شراء عاجل
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
