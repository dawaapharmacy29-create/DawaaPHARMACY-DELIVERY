import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import StatusBadge from '@/components/features/StatusBadge';
import { useInvoices, useAddInvoice, useSuppliers, useBranches } from '@/hooks/useSupabaseData';
import { FileText, Clock, CreditCard, DollarSign, Search, Download, Upload, Plus, Eye, Banknote } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function Invoices() {
  const { data: invoices = [], isLoading } = useInvoices();
  const { data: suppliers = [] } = useSuppliers();
  const { data: branches = [] } = useBranches();
  const addInvoice = useAddInvoice();

  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('الكل');
  const [filterReview, setFilterReview] = useState('الكل');
  const [filterPayment, setFilterPayment] = useState('الكل');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    invoice_no: '', supplier_id: '', branch_id: '',
    date: new Date().toISOString().split('T')[0],
    value: '', payment_type: 'آجل', notes: '',
  });

  const filtered = invoices.filter(inv => {
    const matchSearch = inv.invoice_no.includes(search) || inv.supplierName?.includes(search);
    const matchBranch = filterBranch === 'الكل' || inv.branchName === filterBranch;
    const matchReview = filterReview === 'الكل' || inv.review_status === filterReview;
    const matchPayment = filterPayment === 'الكل' || inv.payment_type === filterPayment;
    return matchSearch && matchBranch && matchReview && matchPayment;
  });

  const totalValue = invoices.reduce((s, i) => s + (i.value || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + ((i.value || 0) - (i.remaining || 0)), 0);
  const pendingReview = invoices.filter(i => i.review_status === 'انتظار مراجعة').length;

  const handleAdd = async () => {
    if (!form.invoice_no || !form.supplier_id || !form.branch_id || !form.value) {
      return;
    }
    await addInvoice.mutateAsync({
      invoice_no: form.invoice_no,
      supplier_id: form.supplier_id,
      branch_id: form.branch_id,
      date: form.date,
      value: Number(form.value),
      payment_type: form.payment_type as any,
      notes: form.notes,
    });
    setShowModal(false);
    setForm({ invoice_no: '', supplier_id: '', branch_id: '', date: new Date().toISOString().split('T')[0], value: '', payment_type: 'آجل', notes: '' });
  };

  return (
    <AppLayout title="فواتير الشراء">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="إجمالي الفواتير" value={invoices.length} icon={<FileText size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
        <StatCard label="إجمالي القيمة" value={fmt(totalValue)} icon={<DollarSign size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <StatCard label="إجمالي المدفوع" value={fmt(totalPaid)} icon={<CreditCard size={18} className="text-purple-600" />} iconBg="bg-purple-100" />
        <StatCard label="انتظار المراجعة" value={pendingReview} icon={<Clock size={18} className="text-amber-500" />} iconBg="bg-amber-100" />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50">
          <Download size={14} /> تصدير
        </button>
        <button className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50">
          <Upload size={14} /> استيراد
        </button>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600 mr-auto">
          <Plus size={14} /> إضافة فاتورة
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث برقم الفاتورة أو المورد..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
            <option>الكل</option>
            {branches.map(b => <option key={b.id}>{b.name}</option>)}
          </select>
          <select value={filterReview} onChange={e => setFilterReview(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
            {['الكل', 'معتمد', 'انتظار مراجعة', 'يحتاج تعديل', 'مرفوض'].map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
            {['الكل', 'آجل', 'كاش', 'جزئي'].map(p => <option key={p}>{p}</option>)}
          </select>
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
                  {['رقم الفاتورة', 'المورد', 'التاريخ', 'القيمة', 'المرتجع', 'المتبقي', 'الدفع', 'حالة الدفع', 'المراجعة', 'إجراءات'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="py-10 text-center text-gray-400 text-sm">لا توجد فواتير مطابقة</td></tr>
                ) : filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{inv.invoice_no}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800">{inv.supplierName}</div>
                      <div className="text-xs text-gray-400">{inv.branchName}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{new Date(inv.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{fmt(inv.value)}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.returned > 0 ? fmt(inv.returned) : '—'}</td>
                    <td className="px-4 py-3 text-gray-800">{fmt(inv.remaining)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.payment_type} /></td>
                    <td className="px-4 py-3"><StatusBadge status={inv.payment_status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={inv.review_status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 flex items-center gap-1"><Eye size={12} />عرض</button>
                        {inv.payment_status !== 'مدفوع بالكامل' && (
                          <button className="text-xs border border-emerald-200 text-emerald-700 rounded px-2 py-1 hover:bg-emerald-50 flex items-center gap-1"><Banknote size={12} />دفعة</button>
                        )}
                      </div>
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
            <h2 className="text-lg font-bold text-right mb-4">إضافة فاتورة جديدة</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">رقم الفاتورة *</label>
                <input value={form.invoice_no} onChange={e => setForm(p => ({ ...p, invoice_no: e.target.value }))} placeholder="INV-2026-008" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
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
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">التاريخ</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">القيمة (ج.م) *</label>
                <input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">نوع الدفع</label>
                <select value={form.payment_type} onChange={e => setForm(p => ({ ...p, payment_type: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  {['آجل', 'كاش', 'جزئي'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleAdd}
                disabled={addInvoice.isPending}
                className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
              >
                {addInvoice.isPending ? 'جارٍ الحفظ...' : 'حفظ الفاتورة'}
              </button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
