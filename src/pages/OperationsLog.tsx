import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { operationsLog } from '@/data/mockData';
import { ClipboardList, Search, Download } from 'lucide-react';
import { toast } from 'sonner';

const deptColors: Record<string, string> = {
  'مشتريات': 'bg-emerald-100 text-emerald-700',
  'الفواتير': 'bg-blue-100 text-blue-700',
  'المدفوعات': 'bg-purple-100 text-purple-700',
  'المرتجعات': 'bg-orange-100 text-orange-700',
};

export default function OperationsLog() {
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('الكل');
  const [filterUser, setFilterUser] = useState('الكل');

  const users = [...new Set(operationsLog.map(o => o.user))];
  const depts = [...new Set(operationsLog.map(o => o.department))];

  const filtered = operationsLog.filter(o => {
    const matchSearch = o.operation.includes(search) || o.details.includes(search) || o.user.includes(search);
    const matchDept = filterDept === 'الكل' || o.department === filterDept;
    const matchUser = filterUser === 'الكل' || o.user === filterUser;
    return matchSearch && matchDept && matchUser;
  });

  return (
    <AppLayout title={`سجل العمليات (${operationsLog.length} عملية)`}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => toast.info('جارٍ التصدير...')} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50">
          <Download size={14} /> تصدير
        </button>
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في سجل العمليات..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          <option>كل المستخدمين</option>
          {users.map(u => <option key={u}>{u}</option>)}
        </select>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          <option>كل الأقسام</option>
          {depts.map(d => <option key={d}>{d}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['التاريخ والوقت', 'المستخدم', 'الدور', 'القسم', 'العملية', 'الفرع', 'التفاصيل'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 text-xs">{log.dateTime}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{log.user}</td>
                  <td className="px-4 py-3 text-gray-600">{log.role}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${deptColors[log.department] || 'bg-gray-100 text-gray-600'}`}>
                      {log.department}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-medium">{log.operation}</td>
                  <td className="px-4 py-3 text-gray-600">{log.branch}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            <ClipboardList size={32} className="mx-auto mb-2 opacity-40" />
            <p>لا توجد نتائج</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
