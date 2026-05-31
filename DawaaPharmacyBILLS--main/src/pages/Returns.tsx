import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import StatusBadge from '@/components/features/StatusBadge';
import { useReturns, useAddReturn, useSuppliers, useBranches } from '@/hooks/useSupabaseData';
import { RefreshCw, CheckCircle, Clock, Search, Plus } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function Returns() {
  const { data: returns = [], isLoading } = useReturns();
  const addReturn = useAddReturn();
  const { data: suppliers = [] } = useSuppliers();
  const { data: branches = [] } = useBranches();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [filterBranch, setFilterBranch] = useState('الكل');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    return_no: `RET-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`,
    supplier_id: '', branch_id: '', medicine_code: '', medicine_name: '',
    quantity: '', value: '', reason: 'قريب الانتهاء',
    date: new Date().toISOString().split('T')[0],
  });

  const filtered = returns.filter(r => {
    const matchSearch = r.supplierName?.includes(search) || r.medicine_name?.includes(search);
    const matchStatus = filterStatus === 'الكل' || r.status === filterStatus;
    const matchBranch = filterBranch === 'الكل' || r.branchName === filterBranch;
    return matchSearch && matchStatus && matchBranch;
  });

  const totalValue = returns.reduce((s, r) => s + (r.value || 0), 0);
  const approved = returns.filter(r => r.status === 'معتمد').length;
  const pending = returns.filter(r => r.status === 'معلق').length;

  const handleAdd = async () => {
    if (!form.supplier_id || !form.branch_id || !form.medicine_name || !form.quantity || !form.value) return;
    await addReturn.mutateAsync({
      return_no: form.return_no,
      supplier_id: form.supplier_id,
      branch_id: form.branch_id,
      medicine_code: form.medicine_code,
      medicine_name: form.medicine_name,
      quantity: Number(form.quantity),
      value: Number(form.value),
      reason: form.reason,
      date: form.date,
    });
    setShowModal(false);
    setForm({
      return_no: `RET-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`,
      supplier_id: '', branch_id: '', medicine_code: '', medicine_name: '',
      quantity: '', value: '', reason: 'قريب الانتهاء',
      date: new Date().toISOString().split('T')[0],
    });
  };

  return (
    <AppLayout title="المرتجعات">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="إجمالي المرتجعات" value={fmt(totalValue)} icon={<RefreshCw size={18} className="text-red-500" />} iconBg="bg-red-100" valueColor="text-red-600" />
        <StatCard label="معتمدة" value={approved} icon={<CheckCircle size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <StatCard label="معلقة" value={pending} icon={<Clock size={18} className="text-amber-500" />} iconBg="bg-amber-100" />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالمورد أو الصنف..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          <option>الكل</option>
          {branches.map(b => <option key={b.id}>{b.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          {['الكل', 'معتمد', 'معلق', 'تحت المراجعة'].map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600">
          <Plus size={14} /> إضافة مرتجع
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
                  {['التاريخ', 'رقم المرتجع', 'المورد', 'الفرع', 'الصنف', 'الكمية', 'القيمة', 'السبب', 'الحالة', 'إجراءات'].map(h => (
                    <th key={h} className="px-3 py-3 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="py-10 text-center text-gray-400 text-sm">لا توجد مرتجعات</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 text-gray-500 text-xs">{new Date(r.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-3 py-3 font-medium text-gray-800">{r.return_no}</td>
                    <td className="px-3 py-3 text-gray-700">{r.supplierName}</td>
                    <td className="px-3 py-3 text-gray-500">{r.branchName}</td>
                    <td className="px-3 py-3 text-gray-700">{r.medicine_name}</td>
                    <td className="px-3 py-3 text-gray-800 font-semibold">{r.quantity}</td>
                    <td className="px-3 py-3 text-gray-800">{fmt(r.value)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{r.reason}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-3">
                      <button className="text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-50">عرض</button>
                    </td>
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
            <h2 className="text-lg font-bold text-right mb-4">إضافة مرتجع جديد</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">المورد *</label>
                <select value={form.supplier_id} onChange={e => setForm(p => ({ ...p, supplier_id: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  <option value="">اختر المورد</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">الفرع *</label>
                <select value={form.branch_id} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  <option value="">اختر الفرع</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">اسم الصنف *</label>
                <input value={form.medicine_name} onChange={e => setForm(p => ({ ...p, medicine_name: e.target.value }))} placeholder="اسم الدواء" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 text-right mb-1">الكمية *</label>
                  <input type="number" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 text-right mb-1">القيمة (ج.م) *</label>
                  <input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">السبب</label>
                <select value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  {['قريب الانتهاء', 'راكد', 'فرق سعر', 'تالف', 'خطأ توريد'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">التاريخ</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleAdd} disabled={addReturn.isPending} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {addReturn.isPending ? 'جارٍ الحفظ...' : 'حفظ المرتجع'}
              </button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
