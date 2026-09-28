import { NavLink } from 'react-router-dom'
import { useAdminAccess } from '../hooks/useAdminAccess'
import { ClipboardCheck, CopyCheck, FileQuestion, Gauge, GitCompareArrows, Route, ShieldCheck } from 'lucide-react'

const items = [
  { to: '/admin/review-center', label: 'مركز مراجعة الدورة', icon: Gauge, pageKey: 'dashboard', end: true },
  { to: '/admin/reconciliation', label: 'مطابقة الأوردرات', icon: GitCompareArrows, pageKey: 'reconciliation' },
  { to: '/admin/trips', label: 'مراجعة المشاوير', icon: Route, pageKey: 'trips' },
  { to: '/admin/duplicate-invoices', label: 'الأوردرات المكررة', icon: CopyCheck, pageKey: 'duplicate_invoices' },
  { to: '/admin/trips-without-invoice', label: 'مشاوير بدون فاتورة', icon: FileQuestion, pageKey: 'trips_without_invoice' },
  { to: '/admin/cycle-closing', label: 'إغلاق الدورة', icon: ClipboardCheck, pageKey: 'dashboard' },
  { to: '/admin/ops', label: 'متابعة التشغيل الحي', icon: ShieldCheck, pageKey: 'dashboard' },
]

export default function OperationsAdminTabs() {
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
