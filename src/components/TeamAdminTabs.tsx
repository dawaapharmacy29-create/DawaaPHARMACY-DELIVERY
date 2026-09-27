import { NavLink } from 'react-router-dom'
import { CalendarDays, KeyRound, Users, WalletCards } from 'lucide-react'

const items = [
  { to: '/admin/riders', label: 'مركز الفريق', icon: Users, end: true },
  { to: '/admin/riders/manage', label: 'بيانات الفريق', icon: Users },
  { to: '/admin/rider-schedules', label: 'الجداول', icon: CalendarDays },
  { to: '/admin/rider-accounts', label: 'الحسابات', icon: KeyRound },
  { to: '/admin/rider-compensation', label: 'المستحقات', icon: WalletCards },
]

export default function TeamAdminTabs() {
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" dir="rtl">
      {items.map(item => {
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
