import { NavLink } from 'react-router-dom'
import { BarChart3, MapPinned, UploadCloud, UsersRound } from 'lucide-react'

const items = [
  { to: '/admin/customer-center', label: 'مركز العملاء والمناطق', icon: UsersRound, end: true },
  { to: '/admin/customer-analytics', label: 'تحليل العملاء', icon: BarChart3 },
  { to: '/admin/customer-import', label: 'تحديث بيانات العملاء', icon: UploadCloud },
  { to: '/admin/route-planner', label: 'المناطق والمسارات', icon: MapPinned },
]

export default function CustomerAdminTabs() {
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" dir="rtl">
      {items.map(item => {
        const Icon = item.icon
        return <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${isActive ? 'bg-[#008E92] text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-teal-50 hover:text-[#008E92]'}`}>
          <Icon size={15}/>{item.label}
        </NavLink>
      })}
    </nav>
  )
}
