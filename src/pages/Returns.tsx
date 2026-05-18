import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/features/StatCard';
import StatusBadge from '@/components/features/StatusBadge';
import { returns } from '@/data/mockData';
import { RefreshCw, CheckCircle, Clock, Search, Plus, Eye } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function Returns() {
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('الكل');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [showModal, setShowModal] = useState(false);

  const filtered = returns.filter(r => {
    const matchSearch = r.medicineName.includes(search) || r.supplier.includes(search);
    const matchBranch = filterBranch === 'الكل' || r.branch === filterBranch;
    const matchStatus = filterStatus === 'الكل' || r.status === filterStatus;
    return matchSearch && matchBranch && matchStatus;
  });

  const total = returns.reduce((s, r) => s + r.value, 0);
  const approved = returns.filter(r => r.status === 'معتمد').length;
  const pending = returns.filter(r => r.status === 'معلق').length;

  return (
    <AppLayout title="المرتجعات">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="إجمالي المرتجعات" value={fmt(total)} icon={<RefreshCw size={18} className="text-red-500" />} iconBg="bg-red-100" />
        <StatCard label="معتمدة" value={approved} icon={<CheckCircle size={18} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <StatCard label="معلقة" value={pending} icon={<Clock size={18} className="text-amber-500" />} iconBg="bg-amber-100" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => toast.info('جارٍ التصدير...')} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50">تصدير</button>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600 mr-auto"><Plus size={14} /> إضافة مرتجع</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالمورد أو الصنف..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          {['الكل', 'فرع زكريا', 'فرع بيسيلة', 'فرع المنشية'].map(b => <option key={b}>{b}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          {['الكل', 'معتمد', 'معلق', 'تحت المراجعة'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['التاريخ', 'رقم المرتجع', 'المورد', 'الفرع', 'الصنف', 'الكمية', 'القيمة', 'السبب', 'الحالة', 'إجراءات'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(ret => (
                <tr key={ret.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{ret.date}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{ret.returnNo}</td>
                  <td className="px-4 py-3 text-gray-700">{ret.supplier}</td>
                  <td className="px-4 py-3 text-gray-600">{ret.branch}</td>
                  <td className="px-4 py-3 text-gray-800">{ret.medicineName}</td>
                  <td className="px-4 py-3 text-gray-700">{ret.quantity}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{fmt(ret.value)}</td>
                  <td className="px-4 py-3 text-gray-600">{ret.reason}</td>
                  <td className="px-4 py-3"><StatusBadge status={ret.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => toast.info(`عرض مرتجع ${ret.returnNo}`)} className="text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 flex items-center gap-1"><Eye size={12} />عرض</button>
                      {ret.status !== 'معتمد' && (
                        <button onClick={() => toast.success('تم اعتماد المرتجع')} className="text-xs border border-emerald-200 text-emerald-700 rounded px-2 py-1 hover:bg-emerald-50">اعتماد</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-right mb-4">إضافة مرتجع جديد</h2>
            <div className="space-y-3">
              {[{ label: 'رقم المرتجع', type: 'text', ph: 'RET-2026-004' }, { label: 'اسم الصنف', type: 'text', ph: 'اسم الدواء' }, { label: 'الكمية', type: 'number', ph: '0' }, { label: 'القيمة (ج.م)', type: 'number', ph: '0' }].map(f => (
                <div key={f.label}>
                  <label className="block text-sm font-medium text-gray-700 text-right mb-1">{f.label}</label>
                  <input type={f.type} placeholder={f.ph} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">السبب</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  {['قريب الانتهاء', 'راكد', 'فرق سعر', 'تالف', 'خطأ توريد'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { toast.success('تم إضافة المرتجع'); setShowModal(false); }} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium">حفظ</button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
