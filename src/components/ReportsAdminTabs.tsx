import { NavLink } from 'react-router-dom'
import { useAdminAccess } from '../hooks/useAdminAccess'
import { Archive, BarChart3, Building2, FileText, ShieldAlert, WalletCards } from 'lucide-react'

const items = [
  { to: '/admin/reports-center', label: 'مركز التقارير والإدارة', icon: BarChart3, pageKey: 'dashboard', end: true },
  { to: '/admin/reports', label: 'تقرير الدليفري للدورة', icon: FileText, pageKey: 'dashboard' },
  { to: '/admin/cycles', label: 'أرشيف الدورات', icon: Archive, pageKey: 'dashboard' },
  { to: '/admin/fraud-alerts', label: 'مراجعة الحالات غير الطبيعية', icon: ShieldAlert, pageKey: 'dashboard' },
  { to: '/admin/cash-flow', label: 'ملخص مستحقات الدورة', icon: WalletCards, pageKey: 'dashboard' },
  { to: '/admin/branch', label: 'لوحة مدير الفرع', icon: Building2, pageKey: 'branch_dashboard' },
]

export default function ReportsAdminTabs() {
  const { ready, canAccess } = useAdminAccess()
  const visibleItems = ready ? items.filter(item => canAccess(item.pageKey as any)) : []
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" dir="rtl">
      {visibleItems.map(item => {
        const Icon = item.icon
        return <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${isActive ? 'bg-[#008E92] text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-teal-50 hover:text-[#008E92]'}`}>
          <Icon size={15}/>{item.label}
        </NavLink>
      })}
    </nav>
  )
}
