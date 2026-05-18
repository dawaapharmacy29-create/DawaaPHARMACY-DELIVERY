import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import { useSuppliersWithBalances } from '@/hooks/useSupabaseData';
import StatusBadge from '@/components/features/StatusBadge';
import { useAddPayment } from '@/hooks/useSupabaseData';
import { useState } from 'react';
import { BarChart2, AlertTriangle, Search, Plus } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function SupplierBalances() {
  const { data: suppliers = [], isLoading } = useSuppliersWithBalances();
  const addPayment = useAddPayment();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('الكل');
  const [showPayModal, setShowPayModal] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'cash', payment_date: new Date().toISOString().split('T')[0], notes: '' });

  const totalDebt = suppliers.reduce((s, sup) => s + Math.max(0, sup.balance || 0), 0);
  const withDebt = suppliers.filter(s => (s.balance || 0) > 0).length;
  const maxDebt = suppliers.reduce((max, s) => (s.balance || 0) > max ? (s.balance || 0) : max, 0);
  const cashCount = suppliers.filter(s => s.payment_type === 'كاش').length;

  const filtered = suppliers.filter(s => {
    const matchSearch = s.name.includes(search);
    const matchFilter = filter === 'الكل'
      || (filter === 'بمديونية' && (s.balance || 0) > 0)
      || (filter === 'مديونية كبيرة' && (s.balance || 0) > 100000)
      || (filter === 'آجل' && s.payment_type === 'آجل')
      || (filter === 'كاش' && s.payment_type === 'كاش');
    return matchSearch && matchFilter;
  });

  const handlePayment = async (supplierId: string) => {
    if (!payForm.amount) return;
    await addPayment.mutateAsync({ supplier_id: supplierId, amount: Number(payForm.amount), payment_method: payForm.payment_method, payment_date: payForm.payment_date, notes: payForm.notes });
    setShowPayModal(null);
    setPayForm({ amount: '', payment_method: 'cash', payment_date: new Date().toISOString().split('T')[0], notes: '' });
  };

  return (
    <AppLayout title="أرصدة الموردين">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="إجمالي المديونية" value={fmt(totalDebt)} icon={<BarChart2 size={18} className="text-amber-500" />} iconBg="bg-amber-100" valueColor="text-amber-700" />
        <StatCard label="موردين بمديونية" value={withDebt} icon={<AlertTriangle size={18} className="text-red-500" />} iconBg="bg-red-100" valueColor="text-red-600" />
        <StatCard label="أكبر مديونية" value={fmt(maxDebt)} icon={<AlertTriangle size={18} className="text-purple-600" />} iconBg="bg-purple-100" />
        <StatCard label="موردين كاش" value={cashCount} icon={<BarChart2 size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {['الكل', 'بمديونية', 'مديونية كبيرة', 'آجل', 'كاش'].map((f, i) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 text-sm ${i > 0 ? 'border-r border-gray-200' : ''} ${filter === f ? 'bg-emerald-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{f}</button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم المورد..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['المورد', 'النوع', 'إجمالي المشتريات', 'إجمالي المدفوع', 'المرتجعات', 'الصافي المتبقي', 'عدد الفواتير', 'آخر دفعة', 'إجراءات'].map(h => (
                    <th key={h} className="px-3 py-3 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-gray-400 text-sm">لا توجد بيانات</td></tr>
                ) : filtered.map(sup => (
                  <tr key={sup.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-bold text-gray-900">{sup.name}</td>
                    <td className="px-3 py-3"><StatusBadge status={sup.payment_type} /></td>
                    <td className="px-3 py-3 text-gray-700">{fmt(sup.totalPurchases || 0)}</td>
                    <td className="px-3 py-3 text-emerald-700">{fmt(sup.totalPaid || 0)}</td>
                    <td className="px-3 py-3 text-gray-600">{fmt(sup.totalReturns || 0)}</td>
                    <td className="px-3 py-3">
                      <span className={`font-bold px-2 py-0.5 rounded-md text-xs ${(sup.balance || 0) > 100000 ? 'bg-red-100 text-red-700' : (sup.balance || 0) > 0 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {fmt(sup.balance || 0)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">{sup.totalInvoices || 0}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{sup.lastPayment !== '-' ? new Date(sup.lastPayment).toLocaleDateString('ar-EG') : '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setShowPayModal(sup.id)} className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded px-2 py-1 hover:bg-emerald-100 flex items-center gap-1">
                          <Plus size={11} /> دفعة
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
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => handlePayment(showPayModal)} disabled={addPayment.isPending} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
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
