import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatusBadge from '@/components/features/StatusBadge';
import { users } from '@/data/mockData';
import { UserCog, Search, Plus } from 'lucide-react';
import { toast } from 'sonner';

const roleColors: Record<string, string> = {
  'مدير عام': 'bg-red-100 text-red-700',
  'مدير فرع': 'bg-blue-100 text-blue-700',
  'محاسب': 'bg-purple-100 text-purple-700',
  'مسؤول مشتريات': 'bg-emerald-100 text-emerald-700',
  'مراجع فواتير': 'bg-orange-100 text-orange-700',
  'مشاهد': 'bg-gray-100 text-gray-600',
};

const roleDescriptions: Record<string, string> = {
  'مدير عام': 'صلاحيات كاملة على كل النظام',
  'مدير فرع': 'إدارة فرع محدد وفواتيره',
  'محاسب': 'المدفوعات والتقارير والمطابقة',
  'مسؤول مشتريات': 'إدخال الفواتير والمرتجعات',
  'مراجع فواتير': 'مراجعة واعتماد الفواتير فقط',
  'مشاهد': 'عرض فقط بدون تعديل',
};

export default function UsersPermissions() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'مسؤول مشتريات', branch: 'فرع زكريا' });

  const filtered = users.filter(u => u.name.includes(search) || u.email.includes(search));

  return (
    <AppLayout title="المستخدمين والصلاحيات">
      {/* Role cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {Object.entries(roleDescriptions).map(([role, desc]) => (
          <div key={role} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-1.5 ${roleColors[role]}`}>{role}</span>
            <p className="text-xs text-gray-500">{desc}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600">
          <Plus size={14} /> إضافة مستخدم
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['المستخدم', 'البريد الإلكتروني', 'الدور الوظيفي', 'الفرع', 'الحالة', 'تاريخ الإضافة', 'إجراءات'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold flex-shrink-0">
                        {user.name[0]}
                      </div>
                      <span className="font-medium text-gray-800">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[user.role] || 'bg-gray-100 text-gray-600'}`}>{user.role}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.branch}</td>
                  <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{user.addedDate}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => toast.info(`تعديل بيانات ${user.name}`)} className="text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-50">تعديل</button>
                      <button
                        onClick={() => toast.info(user.status === 'نشط' ? `تم إيقاف ${user.name}` : `تم تفعيل ${user.name}`)}
                        className={`text-xs border rounded px-2 py-1 ${user.status === 'نشط' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
                      >
                        {user.status === 'نشط' ? 'إيقاف' : 'تفعيل'}
                      </button>
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
            <h2 className="text-lg font-bold text-right mb-4">إضافة مستخدم جديد</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">الاسم</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="الاسم الكامل" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">البريد الإلكتروني</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="name@dawaa.com" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">الدور الوظيفي</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  {Object.keys(roleDescriptions).map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1">الفرع</label>
                <select value={form.branch} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
                  {['كل الفروع', 'فرع زكريا', 'فرع بيسيلة', 'فرع المنشية', 'فرع الفاروق'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { toast.success('تم إضافة المستخدم وإرسال دعوة على البريد'); setShowModal(false); }} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium">إضافة وإرسال دعوة</button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
