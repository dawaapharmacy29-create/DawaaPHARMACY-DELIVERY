import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import { useExpenses, useAddExpense, useBranches } from '@/hooks/useSupabaseData';
import StatusBadge from '@/components/features/StatusBadge';
import { DollarSign, Search, Plus, Download } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';
const categories = ['إيجار', 'كهرباء', 'صيانة', 'إنترنت', 'مستلزمات', 'أخرى'];

export default function Expenses() {
  const { data: expenses = [], isLoading } = useExpenses();
  const addExpense = useAddExpense();
  const { data: branches = [] } = useBranches();

  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('الكل');
  const [filterCategory, setFilterCategory] = useState('الكل');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    branch_id: '', category: 'إيجار', description: '',
    amount: '', payment_method: 'cash',
    date: new Date().toISOString().split('T')[0],
  });

  const filtered = expenses.filter(e => {
    const matchSearch = e.description?.includes(search);
    const matchBranch = filterBranch === 'الكل' || e.branchName === filterBranch;
    const matchCategory = filterCategory === 'الكل' || e.category === filterCategory;
    return matchSearch && matchBranch && matchCategory;
  });

  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const byCategory: Record<string, number> = {};
  expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
  const topCategory = Object.entries(byCategory).sort(([, a], [, b]) => b - a)[0]?.[0] || '-';

  const handleAdd = async () => {
    if (!form.branch_id || !form.description || !form.amount) return;
    await addExpense.mutateAsync({
      branch_id: form.branch_id,
      category: form.category,
      description: form.description,
      amount: Number(form.amount),
      payment_method: form.payment_method,
      date: form.date,
    });
    setShowModal(false);
    setForm({ branch_id: '', category: 'إيجار', description: '', amount: '', payment_method: 'cash', date: new Date().toISOString().split('T')[0] });
  };

  return (
    <AppLayout title="المصروفات">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="إجمالي المصروفات" value={fmt(total)} icon={<DollarSign size={18} className="text-amber-500" />} iconBg="bg-amber-100" valueColor="text-amber-700" />
        <StatCard label="عدد المصروفات" value={expenses.length} icon={<DollarSign size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
        <StatCard label="أعلى فئة" value={topCategory} icon={<DollarSign size={18} className="text-purple-600" />} iconBg="bg-purple-100" />
      </div>

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
          {Object.entries(byCategory).map(([cat, val]) => (
            <div key={cat} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
              <div className="text-xs text-gray-400 mb-1">{cat}</div>
              <div className="font-bold text-gray-800 text-sm">{fmt(val)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <button className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50">
          <Download size={14} /> تصدير
        </button>
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالوصف أو الفرع..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          <option>الكل</option>
          {branches.map(b => <option key={b.id}>{b.name}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          <option>الكل</option>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600">
          <Plus size={14} /> إضافة مصروف
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : (
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
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-gray-400 text-sm">لا توجد مصروفات</td></tr>
                ) : filtered.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(e.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-4 py-3 text-gray-600">{e.branchName}</td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{e.category}</td>
                    <td className="px-4 py-3 text-gray-700">{e.description}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{fmt(e.amount)}</td>
                    <td className="px-4 py-3 text-gray-500">{e.payment_method}</td>
                    <td className="px-4 py-3 text-gray-500">{e.responsible || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-right mb-4">إضافة مصروف جديد</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">الفرع *</label>
                <select value={form.branch_id} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  <option value="">اختر الفرع</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">الفئة</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">الوصف *</label>
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="وصف المصروف" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">المبلغ (ج.م) *</label>
                <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">طريقة الدفع</label>
                <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  <option value="cash">كاش</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="check">شيك</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">التاريخ</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleAdd} disabled={addExpense.isPending} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {addExpense.isPending ? 'جارٍ الحفظ...' : 'حفظ المصروف'}
              </button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
