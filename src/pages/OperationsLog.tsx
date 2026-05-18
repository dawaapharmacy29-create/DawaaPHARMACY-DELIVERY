import AppLayout from '@/components/layout/AppLayout';
import { useAuditLogs } from '@/hooks/useSupabaseData';
import { Search } from 'lucide-react';
import { useState } from 'react';

export default function OperationsLog() {
  const { data: logs = [], isLoading } = useAuditLogs();
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('الكل');

  const depts = ['الكل', ...Array.from(new Set(logs.map(l => l.department).filter(Boolean)))];

  const filtered = logs.filter(l => {
    const matchSearch = l.user_name?.includes(search) || l.operation?.includes(search) || l.details?.includes(search);
    const matchDept = filterDept === 'الكل' || l.department === filterDept;
    return matchSearch && matchDept;
  });

  return (
    <AppLayout title={`سجل العمليات (${logs.length} عملية)`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في سجل العمليات..." className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300" />
        </div>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none">
          {depts.map(d => <option key={d}>{d}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : (
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
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">لا توجد عمليات</td></tr>
                ) : filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('ar-EG')}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{log.user_name}</td>
                    <td className="px-4 py-3 text-gray-600">{log.role}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.department === 'الفواتير' ? 'bg-blue-100 text-blue-700' :
                        log.department === 'المرتجعات' ? 'bg-red-100 text-red-700' :
                        log.department === 'المدفوعات' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{log.department}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{log.operation}</td>
                    <td className="px-4 py-3 text-gray-500">{log.branch}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{log.details}</td>
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
