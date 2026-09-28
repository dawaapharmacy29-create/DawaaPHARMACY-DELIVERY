import { NavLink } from 'react-router-dom'
import { useAdminAccess } from '../hooks/useAdminAccess'
import { BarChart3, CalendarDays, ClipboardCheck, Gift, KeyRound, Users, WalletCards } from 'lucide-react'

const items = [
  { to: '/admin/riders', label: 'مركز الفريق', icon: Users, pageKey: 'riders', end: true },
  { to: '/admin/riders/manage', label: 'بيانات الفريق', icon: Users, pageKey: 'riders' },
  { to: '/admin/rider-schedules', label: 'الجداول', icon: CalendarDays, pageKey: 'rider_schedules' },
  { to: '/admin/rider-accounts', label: 'الحسابات والأجهزة', icon: KeyRound, pageKey: 'rider_accounts' },
  { to: '/admin/performance', label: 'أداء الدليفري', icon: BarChart3, pageKey: 'performance' },
  { to: '/admin/rider-actions', label: 'طلبات وقرارات الدليفري', icon: ClipboardCheck, pageKey: 'rider_actions' },
  { to: '/admin/penalty-incentive', label: 'سجل الخصومات والمكافآت', icon: Gift, pageKey: 'dashboard' },
  { to: '/admin/rider-compensation', label: 'مستحقات الدليفري', icon: WalletCards, pageKey: 'performance' },
]

export default function TeamAdminTabs() {
  const { ready, canAccess } = useAdminAccess()
  const visibleItems = ready ? items.filter(item => canAccess(item.pageKey as any)) : []
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" dir="rtl">
      {visibleItems.map(item => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${isActive ? 'bg-[#008E92] text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-teal-50 hover:text-[#008E92]'}`}
          >
            <Icon size={15} />
            {item.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
