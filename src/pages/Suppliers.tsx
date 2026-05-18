import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import StatusBadge from '@/components/features/StatusBadge';
import { suppliers } from '@/data/mockData';
import { Users, AlertTriangle, TrendingUp, Search, Plus, Eye, Banknote, List, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function Suppliers() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState('الكل');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const filteredSuppliers = suppliers.filter(s => {
    const matchSearch = s.name.includes(search) || s.representative.includes(search);
    const matchFilter = filter === 'الكل' || s.paymentType === filter;
    return matchSearch && matchFilter;
  });

  const totalDebt = suppliers.reduce((s, sup) => s + sup.balance, 0);
  const totalPurchases = suppliers.reduce((s, sup) => s + sup.totalPurchases, 0);
  const withDebt = suppliers.filter(s => s.hasOldDebt).length;

  return (
    <AppLayout title="الموردين">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="إجمالي الموردين" value={suppliers.length} icon={<Users size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
        <StatCard label="إجمالي المشتريات" value={fmt(totalPurchases)} icon={<TrendingUp size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <StatCard label="إجمالي المديونية" value={fmt(totalDebt)} icon={<AlertTriangle size={18} className="text-red-500" />} iconBg="bg-red-100" valueColor="text-red-600" />
        <StatCard label="موردين بمديونية" value={withDebt} icon={<AlertTriangle size={18} className="text-orange-500" />} iconBg="bg-orange-100" />
      </div>

      {/* Actions + Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setFilter('الكل')} className={`px-3 py-2 text-sm ${filter === 'الكل' ? 'bg-emerald-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>الكل</button>
          <button onClick={() => setFilter('كاش')} className={`px-3 py-2 text-sm border-r border-gray-200 ${filter === 'كاش' ? 'bg-emerald-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>كاش</button>
          <button onClick={() => setFilter('آجل')} className={`px-3 py-2 text-sm border-r border-gray-200 ${filter === 'آجل' ? 'bg-emerald-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>آجل</button>
          <button onClick={() => setFilter('تقسيط')} className={`px-3 py-2 text-sm border-r border-gray-200 ${filter === 'تقسيط' ? 'bg-emerald-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>تقسيط</button>
        </div>
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم المورد أو المندوب..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setView('list')} className={`p-2 ${view === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}><List size={16} className="text-gray-600" /></button>
          <button onClick={() => setView('grid')} className={`p-2 border-r border-gray-200 ${view === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}><LayoutGrid size={16} className="text-gray-600" /></button>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600">
          <Plus size={14} /> إضافة مورد
        </button>
      </div>

      {/* Cards View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filteredSuppliers.map(sup => (
          <div key={sup.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between mb-3">
              <StatusBadge status={sup.paymentType} />
              <div className="text-right">
                <div className="font-bold text-gray-900">{sup.name}</div>
                {sup.creditDays && <span className="text-xs text-blue-600">{sup.creditDays} يوم</span>}
              </div>
            </div>

            <div className="space-y-1 mb-3 text-sm">
              <div className="flex items-center gap-1.5 text-gray-600">
                <span>👤</span><span>{sup.representative}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-600">
                <span>📞</span><span dir="ltr">{sup.phone}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-lg p-3 mb-3 text-center">
              <div>
                <div className="text-xs text-gray-400">الفواتير</div>
                <div className="font-bold text-gray-800">{sup.totalInvoices}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">المشتريات</div>
                <div className="font-bold text-gray-800 text-xs">{fmt(sup.totalPurchases)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">المدفوع</div>
                <div className="font-bold text-gray-800 text-xs">{fmt(sup.totalPaid)}</div>
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-400">الرصيد المتبقي</div>
              <div className={`font-bold ${sup.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {fmt(sup.balance)}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => toast.info(`عرض حساب ${sup.name}`)} className="flex-1 text-xs border border-gray-200 rounded-lg py-2 hover:bg-gray-50 text-gray-600">عرض الحساب</button>
              <button onClick={() => toast.success(`تم تسجيل دفعة لـ ${sup.name}`)} className="flex-1 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg py-2 hover:bg-emerald-100">تسجيل دفعة</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-right mb-4">إضافة مورد جديد</h2>
            <div className="space-y-3">
              {[{ label: 'اسم المورد', ph: 'شركة ...' }, { label: 'اسم المندوب', ph: 'الاسم' }, { label: 'رقم الهاتف', ph: '01xxxxxxxxx' }].map(f => (
                <div key={f.label}>
                  <label className="block text-sm font-medium text-gray-700 text-right mb-1">{f.label}</label>
                  <input placeholder={f.ph} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">نوع الدفع</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  {['كاش', 'آجل', 'تقسيط'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { toast.success('تم إضافة المورد'); setShowModal(false); }} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium">حفظ</button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
