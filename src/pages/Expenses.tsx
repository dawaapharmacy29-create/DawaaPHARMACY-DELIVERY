import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import StatusBadge from '@/components/features/StatusBadge';
import { expenses } from '@/data/mockData';
import { DollarSign, TrendingDown, Search, Download, Plus } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

const categories = ['إيجار', 'كهرباء', 'صيانة', 'إنترنت', 'مستلزمات'];
const catColors: Record<string, string> = {
  'إيجار': 'bg-blue-100 text-blue-700',
  'كهرباء': 'bg-yellow-100 text-yellow-700',
  'صيانة': 'bg-orange-100 text-orange-700',
  'إنترنت': 'bg-purple-100 text-purple-700',
  'مستلزمات': 'bg-emerald-100 text-emerald-700',
  'أخرى': 'bg-gray-100 text-gray-700',
};

export default function Expenses() {
  const [filterBranch, setFilterBranch] = useState('الكل');
  const [filterCat, setFilterCat] = useState('الكل');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ date: '', branch: 'فرع زكريا', category: 'إيجار', description: '', amount: '', paymentMethod: 'cash' });

  const filtered = expenses.filter(e => {
    const matchBranch = filterBranch === 'الكل' || e.branch === filterBranch;
    const matchCat = filterCat === 'الكل' || e.category === filterCat;
    const matchSearch = e.description.includes(search);
    return matchBranch && matchCat && matchSearch;
  });

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const topCategory = categories.reduce((best, cat) => {
    const sum = expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
    return sum > (expenses.filter(e => e.category === best).reduce((s, e) => s + e.amount, 0)) ? cat : best;
  }, 'إيجار');

  const catTotals = categories.map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)
  }));

  return (
    <AppLayout title="المصروفات">
      {/* Category summary */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {catTotals.map(c => (
          <div key={c.cat} className="bg-white rounded-xl border border-gray-100 p-3 text-right shadow-sm">
            <div className="text-xs text-gray-500 mb-1">{c.cat}</div>
            <div className="font-bold text-gray-800 text-sm">{fmt(c.total)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="إجمالي المصروفات" value={fmt(total)} icon={<DollarSign size={18} className="text-yellow-500" />} iconBg="bg-yellow-100" />
        <StatCard label="عدد المصروفات" value={expenses.length} icon={<TrendingDown size={18} className="text-blue-500" />} iconBg="bg-blue-100" />
        <StatCard label="أعلى فئة" value={topCategory} icon={<DollarSign size={18} className="text-orange-500" />} iconBg="bg-orange-100" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => toast.info('جارٍ التصدير...')} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"><Download size={14} /> تصدير</button>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600 mr-auto"><Plus size={14} /> إضافة مصروف</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالوصف أو الفرع..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          {['الكل', 'فرع زكريا', 'فرع بيسيلة', 'فرع المنشية'].map(b => <option key={b}>{b}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          {['الكل', ...categories].map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['التاريخ', 'الفرع', 'الفئة', 'الوصف', 'المبلغ', 'طريقة الدفع', 'المسؤول', 'الحالة'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(exp => (
                <tr key={exp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{exp.date}</td>
                  <td className="px-4 py-3 text-gray-700">{exp.branch}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColors[exp.category] || 'bg-gray-100 text-gray-600'}`}>{exp.category}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-800">{exp.description}</td>
                  <td className="px-4 py-3 font-bold text-gray-800">{fmt(exp.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{exp.paymentMethod === 'cash' ? 'نقدي' : 'تحويل بنكي'}</td>
                  <td className="px-4 py-3 text-gray-500">{exp.responsible || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={exp.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-right mb-4">إضافة مصروف جديد</h2>
            <div className="space-y-3">
              {[{ label: 'التاريخ', key: 'date', type: 'date' }, { label: 'الوصف', key: 'description', type: 'text' }, { label: 'المبلغ (ج.م)', key: 'amount', type: 'number' }].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 text-right mb-1">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">الفئة</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">الفرع</label>
                <select value={form.branch} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  {['فرع زكريا', 'فرع بيسيلة', 'فرع المنشية', 'فرع الفاروق'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { toast.success('تم إضافة المصروف'); setShowModal(false); }} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600">حفظ</button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
