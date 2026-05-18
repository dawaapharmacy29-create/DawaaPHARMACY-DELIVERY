import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import StatusBadge from '@/components/features/StatusBadge';
import { useSuppliersWithBalances, useAddSupplier, useAddPayment, useBranches } from '@/hooks/useSupabaseData';
import { Users, AlertTriangle, TrendingUp, Search, Plus, List, LayoutGrid } from 'lucide-react';
import { useState as useModalState } from 'react';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function Suppliers() {
  const { data: suppliers = [], isLoading } = useSuppliersWithBalances();
  const addSupplier = useAddSupplier();
  const addPayment = useAddPayment();

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState('الكل');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', representative: '', phone: '', payment_type: 'آجل', credit_days: '' });
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'cash', payment_date: new Date().toISOString().split('T')[0], notes: '' });

  const filteredSuppliers = suppliers.filter(s => {
    const matchSearch = s.name.includes(search) || s.representative?.includes(search);
    const matchFilter = filter === 'الكل' || s.payment_type === filter;
    return matchSearch && matchFilter;
  });

  const totalDebt = suppliers.reduce((s, sup) => s + (sup.balance || 0), 0);
  const totalPurchases = suppliers.reduce((s, sup) => s + (sup.totalPurchases || 0), 0);
  const withDebt = suppliers.filter(s => s.hasOldDebt).length;

  const handleAddSupplier = async () => {
    if (!form.name) return;
    await addSupplier.mutateAsync({ ...form, credit_days: form.credit_days ? Number(form.credit_days) : undefined });
    setShowAddModal(false);
    setForm({ name: '', representative: '', phone: '', payment_type: 'آجل', credit_days: '' });
  };

  const handleAddPayment = async (supplierId: string) => {
    if (!payForm.amount) return;
    await addPayment.mutateAsync({ supplier_id: supplierId, amount: Number(payForm.amount), payment_method: payForm.payment_method, payment_date: payForm.payment_date, notes: payForm.notes });
    setShowPayModal(null);
    setPayForm({ amount: '', payment_method: 'cash', payment_date: new Date().toISOString().split('T')[0], notes: '' });
  };

  return (
    <AppLayout title="الموردين">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="إجمالي الموردين" value={suppliers.length} icon={<Users size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
        <StatCard label="إجمالي المشتريات" value={fmt(totalPurchases)} icon={<TrendingUp size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <StatCard label="إجمالي المديونية" value={fmt(totalDebt)} icon={<AlertTriangle size={18} className="text-red-500" />} iconBg="bg-red-100" valueColor="text-red-600" />
        <StatCard label="موردين بمديونية" value={withDebt} icon={<AlertTriangle size={18} className="text-orange-500" />} iconBg="bg-orange-100" />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {['الكل', 'كاش', 'آجل', 'تقسيط'].map((f, i) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 text-sm ${i > 0 ? 'border-r border-gray-200' : ''} ${filter === f ? 'bg-emerald-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{f}</button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم المورد أو المندوب..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setView('list')} className={`p-2 ${view === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}><List size={16} className="text-gray-600" /></button>
          <button onClick={() => setView('grid')} className={`p-2 border-r border-gray-200 ${view === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}><LayoutGrid size={16} className="text-gray-600" /></button>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600">
          <Plus size={14} /> إضافة مورد
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-48" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredSuppliers.map(sup => (
            <div key={sup.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between mb-3">
                <StatusBadge status={sup.payment_type} />
                <div className="text-right">
                  <div className="font-bold text-gray-900">{sup.name}</div>
                  {sup.credit_days && <span className="text-xs text-blue-600">{sup.credit_days} يوم</span>}
                </div>
              </div>
              <div className="space-y-1 mb-3 text-sm">
                <div className="flex items-center gap-1.5 text-gray-600"><span>👤</span><span>{sup.representative}</span></div>
                <div className="flex items-center gap-1.5 text-gray-600"><span>📞</span><span dir="ltr">{sup.phone}</span></div>
              </div>
              <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-lg p-3 mb-3 text-center">
                <div><div className="text-xs text-gray-400">الفواتير</div><div className="font-bold text-gray-800">{sup.totalInvoices}</div></div>
                <div><div className="text-xs text-gray-400">المشتريات</div><div className="font-bold text-gray-800 text-xs">{fmt(sup.totalPurchases)}</div></div>
                <div><div className="text-xs text-gray-400">المدفوع</div><div className="font-bold text-gray-800 text-xs">{fmt(sup.totalPaid)}</div></div>
              </div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-gray-400">الرصيد المتبقي</div>
                <div className={`font-bold ${sup.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(sup.balance)}</div>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 text-xs border border-gray-200 rounded-lg py-2 hover:bg-gray-50 text-gray-600">عرض الحساب</button>
                <button onClick={() => setShowPayModal(sup.id)} className="flex-1 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg py-2 hover:bg-emerald-100">تسجيل دفعة</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-right mb-4">إضافة مورد جديد</h2>
            <div className="space-y-3">
              {[
                { label: 'اسم المورد *', key: 'name', ph: 'شركة ...' },
                { label: 'اسم المندوب', key: 'representative', ph: 'الاسم' },
                { label: 'رقم الهاتف', key: 'phone', ph: '01xxxxxxxxx' },
                { label: 'أيام الائتمان', key: 'credit_days', ph: '30' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 text-right mb-1">{f.label}</label>
                  <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">نوع الدفع</label>
                <select value={form.payment_type} onChange={e => setForm(p => ({ ...p, payment_type: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  {['كاش', 'آجل', 'تقسيط'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleAddSupplier} disabled={addSupplier.isPending} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {addSupplier.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => setShowAddModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPayModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-right mb-4">تسجيل دفعة</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">المبلغ (ج.م) *</label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">طريقة الدفع</label>
                <select value={payForm.payment_method} onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  <option value="cash">كاش</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="check">شيك</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">التاريخ</label>
                <input type="date" value={payForm.payment_date} onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">ملاحظات</label>
                <input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} placeholder="اختياري" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => handleAddPayment(showPayModal)} disabled={addPayment.isPending} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {addPayment.isPending ? 'جارٍ الحفظ...' : 'تسجيل الدفعة'}
              </button>
              <button onClick={() => setShowPayModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
