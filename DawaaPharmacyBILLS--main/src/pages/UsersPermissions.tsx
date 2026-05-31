import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { useUsers, useUpdateUser } from '@/hooks/useSupabaseData';
import StatusBadge from '@/components/features/StatusBadge';
import { Search } from 'lucide-react';

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
  const { data: users = [], isLoading } = useUsers();
  const updateUser = useUpdateUser();
  const [search, setSearch] = useState('');

  const filtered = users.filter(u =>
    (u.displayName || '').includes(search) || u.email?.includes(search)
  );

  return (
    <AppLayout title="المستخدمين والصلاحيات">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {Object.entries(roleDescriptions).map(([role, desc]) => (
          <div key={role} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-1.5 ${roleColors[role]}`}>{role}</span>
            <p className="text-xs text-gray-500">{desc}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
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
                  {['المستخدم', 'البريد الإلكتروني', 'الدور الوظيفي', 'الفرع', 'الحالة', 'إجراءات'].map(h => (
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
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
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
    </AppLayout>
  );
}
