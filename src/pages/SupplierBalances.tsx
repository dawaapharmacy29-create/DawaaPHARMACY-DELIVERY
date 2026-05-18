import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import StatusBadge from '@/components/features/StatusBadge';
import { suppliers } from '@/data/mockData';
import { BookOpen, AlertTriangle, TrendingDown, Search, Plus } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function SupplierBalances() {
  const [filter, setFilter] = useState('الكل');
  const [search, setSearch] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [payAmount, setPayAmount] = useState('');

  const totalDebt = suppliers.reduce((s, sup) => s + sup.balance, 0);
  const maxDebt = Math.max(...suppliers.map(s => s.balance));
  const maxDebtSupplier = suppliers.find(s => s.balance === maxDebt);
  const withDebt = suppliers.filter(s => s.balance > 0).length;
  const cashSuppliers = suppliers.filter(s => s.paymentType === 'كاش' && s.balance === 0).length;

  const filtered = suppliers.filter(s => {
    const matchSearch = s.name.includes(search);
    if (filter === 'الكل') return matchSearch;
    if (filter === 'بمديونية') return s.balance > 0 && matchSearch;
    if (filter === 'مديونية كبيرة') return s.balance > 100000 && matchSearch;
    if (filter === 'آجل') return s.paymentType === 'آجل' && matchSearch;
    if (filter === 'كاش') return s.paymentType === 'كاش' && matchSearch;
    return matchSearch;
  });

  return (
    <AppLayout title="أرصدة الموردين">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="إجمالي المديونية" value={fmt(totalDebt)} icon={<BookOpen size={18} className="text-red-500" />} iconBg="bg-red-100" valueColor="text-red-600" />
        <StatCard label="موردين بمديونية" value={withDebt} icon={<AlertTriangle size={18} className="text-orange-500" />} iconBg="bg-orange-100" />
        <StatCard label="أكبر مديونية" value={fmt(maxDebt)} icon={<TrendingDown size={18} className="text-purple-500" />} iconBg="bg-purple-100" />
        <StatCard label="موردين كاش" value={cashSuppliers} icon={<BookOpen size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          {['الكل', 'بمديونية', 'مديونية كبيرة', 'آجل', 'كاش'].map((f, i) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 ${i > 0 ? 'border-r border-gray-200' : ''} ${filter === f ? 'bg-emerald-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{f}</button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم المورد..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['المورد', 'النوع', 'إجمالي المشتريات', 'إجمالي المدفوع', 'المرتجعات', 'الصافي المتبقي', 'عدد الفواتير', 'آخر دفعة', 'آخر مطابقة', 'إجراءات'].map(h => (
                  <th key={h} className="px-3 py-3 text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(sup => (
                <tr key={sup.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-semibold text-gray-900">{sup.name}</td>
                  <td className="px-3 py-3"><StatusBadge status={sup.paymentType} /></td>
                  <td className="px-3 py-3 text-gray-700">{fmt(sup.totalPurchases)}</td>
                  <td className="px-3 py-3 text-gray-700">{fmt(sup.totalPaid)}</td>
                  <td className="px-3 py-3 text-gray-600">{fmt(sup.totalReturns)}</td>
                  <td className="px-3 py-3">
                    <span className={`font-bold px-2 py-0.5 rounded-md text-sm ${sup.balance > 100000 ? 'bg-red-100 text-red-700' : sup.balance > 0 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {fmt(sup.balance)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-700">{sup.totalInvoices}</td>
                  <td className="px-3 py-3 text-gray-600">{sup.lastPayment}</td>
                  <td className="px-3 py-3 text-gray-600">{sup.lastReconciliation}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setSelectedSupplier(sup.name); setShowPayModal(true); }}
                        className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded px-2 py-1 hover:bg-emerald-100 flex items-center gap-1"
                      >
                        <Plus size={11} /> دفعة
                      </button>
                      <button
                        onClick={() => toast.info(`مطابقة كشف ${sup.name}`)}
                        className="text-xs border border-purple-200 text-purple-700 rounded px-2 py-1 hover:bg-purple-50"
                      >
                        مطابقة
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPayModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-right mb-1">تسجيل دفعة</h2>
            <p className="text-sm text-gray-500 text-right mb-4">{selectedSupplier}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">المبلغ (ج.م)</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">طريقة الدفع</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  <option>تحويل بنكي</option>
                  <option>نقدي</option>
                  <option>شيك</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">التاريخ</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { toast.success(`تم تسجيل دفعة ${payAmount} ج.م لـ ${selectedSupplier}`); setShowPayModal(false); setPayAmount(''); }} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium">تسجيل الدفعة</button>
              <button onClick={() => setShowPayModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
