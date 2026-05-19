import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { useUsers, useUpdateUser, useCreateUser } from '@/hooks/useSupabaseData';
import { useBranches } from '@/hooks/useSupabaseData';
import StatusBadge from '@/components/features/StatusBadge';
import { Search, Plus, X, Eye, EyeOff, UserPlus } from 'lucide-react';

const ROLES = ['مدير عام', 'مدير فرع', 'محاسب', 'مسؤول مشتريات', 'مراجع فواتير', 'مشاهد'];

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

interface NewUserForm {
  username: string;
  display_name: string;
  password: string;
  role: string;
  branch_id: string;
}

export default function UsersPermissions() {
  const { data: users = [], isLoading } = useUsers();
  const { data: branches = [] } = useBranches();
  const updateUser = useUpdateUser();
  const createUser = useCreateUser();

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<NewUserForm>({
    username: '',
    display_name: '',
    password: '',
    role: 'مشاهد',
    branch_id: '',
  });

  const filtered = users.filter(u =>
    (u.displayName || '').includes(search) || (u.username || '').includes(search)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim()) return;
    await createUser.mutateAsync({
      username: form.username.trim(),
      password: form.password,
      display_name: form.display_name.trim() || form.username.trim(),
      role: form.role,
      branch_id: form.branch_id || undefined,
    });
    setShowModal(false);
    setForm({ username: '', display_name: '', password: '', role: 'مشاهد', branch_id: '' });
    setShowPassword(false);
  };

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

      {/* Search + Add button */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو اسم المستخدم..."
            className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          مستخدم جديد
        </button>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['المستخدم', 'اسم الدخول', 'الدور الوظيفي', 'الفرع', 'الحالة', 'إجراءات'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">لا يوجد مستخدمون</td></tr>
                ) : filtered.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold flex-shrink-0">
                          {(user.displayName || 'م')[0]}
                        </div>
                        <span className="font-medium text-gray-800">{user.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{user.username || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[user.role] || 'bg-gray-100 text-gray-600'}`}>{user.role}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.branchName}</td>
                    <td className="px-4 py-3"><StatusBadge status={user.status || 'نشط'} /></td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => updateUser.mutate({ id: user.id, status: user.status === 'نشط' ? 'موقف' : 'نشط' })}
                        disabled={updateUser.isPending}
                        className={`text-xs border rounded px-2 py-1 disabled:opacity-50 ${user.status === 'نشط' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
                      >
                        {user.status === 'نشط' ? 'إيقاف' : 'تفعيل'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <UserPlus size={16} className="text-emerald-600" />
                </div>
                <h2 className="text-base font-bold text-gray-900">إنشاء مستخدم جديد</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Username */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">اسم المستخدم <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required
                  placeholder="مثال: ahmed.ali"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
                <p className="text-xs text-gray-400 mt-1">يُستخدم لتسجيل الدخول، لا يمكن تغييره لاحقاً</p>
              </div>

              {/* Display name */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="الاسم الذي سيظهر في النظام"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">كلمة المرور <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                    minLength={6}
                    placeholder="6 أحرف على الأقل"
                    className="w-full pr-3 pl-10 py-2.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">الدور الوظيفي <span className="text-red-500">*</span></label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {form.role && (
                  <p className="text-xs text-gray-400 mt-1">{roleDescriptions[form.role]}</p>
                )}
              </div>

              {/* Branch */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">الفرع</label>
                <select
                  value={form.branch_id}
                  onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
                >
                  <option value="">كل الفروع</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={createUser.isPending}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  {createUser.isPending ? 'جارٍ الإنشاء...' : 'إنشاء المستخدم'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
