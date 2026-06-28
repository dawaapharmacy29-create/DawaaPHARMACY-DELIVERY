import { ReactNode, useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

type AdminShellProps = {
  children: ReactNode
}

type AdminNavLink = {
  to: string
  label: string
}

type AdminNavGroup = {
  title: string
  hint: string
  links: AdminNavLink[]
}

const groups: AdminNavGroup[] = [
  {
    title: 'مركز القيادة',
    hint: 'الصفحات الرئيسية والمتابعة العامة',
    links: [
      { to: '/admin', label: 'داشبورد التشغيل' },
      { to: '/admin/executive', label: 'لوحة الإدارة العليا' },
      { to: '/admin/ops', label: 'غرفة العمليات' },
      { to: '/admin/reports', label: 'مركز التقارير' },
      { to: '/admin/cycles', label: 'أرشيف الدورات' },
    ],
  },
  {
    title: 'الموارد البشرية والمناديب',
    hint: 'البيانات والمواعيد والحسابات',
    links: [
      { to: '/admin/riders', label: 'بيانات المناديب' },
      { to: '/admin/rider-schedules', label: 'مواعيد المناديب' },
      { to: '/admin/rider-accounts', label: 'حسابات وأجهزة الدخول' },
      { to: '/admin/performance', label: 'تحليل أداء المناديب' },
      { to: '/admin/rider-monthly-reports', label: 'تقارير وحوافز الدليفري' },
      { to: '/admin/rider-actions', label: 'إجراءات وملاحظات' },
    ],
  },
  {
    title: 'الأوردرات والمطابقة',
    hint: 'الفواتير والمراجعة المالية',
    links: [
      { to: '/admin/reconciliation', label: 'مطابقة الفواتير' },
      { to: '/admin/duplicate-invoices', label: 'الفواتير المكررة' },
      { to: '/admin/invoice-notebook', label: 'دفتر الفواتير' },
    ],
  },
  {
    title: 'المشاوير والتشغيل',
    hint: 'مراجعة المشاوير والتحرك اليومي',
    links: [
      { to: '/admin/trips', label: 'المشاوير' },
      { to: '/admin/trips-without-invoice', label: 'مشاوير بدون فاتورة' },
      { to: '/admin/route-planner', label: 'تحليل المناطق والمسارات' },
    ],
  },
  {
    title: 'العملاء والتحليل',
    hint: 'العملاء والمتابعة والتحديث',
    links: [
      { to: '/admin/customer-analytics', label: 'تحليل العملاء الشهري' },
      { to: '/admin/customer-import', label: 'استيراد وتحديث العملاء' },
    ],
  },
  {
    title: 'الرقابة والماليات',
    hint: 'التلاعب والكاش والإدارة',
    links: [
      { to: '/admin/fraud-alerts', label: 'تنبيهات التلاعب' },
      { to: '/admin/cash-flow', label: 'التدفق النقدي الشهري' },
      { to: '/admin/branch', label: 'مدير الفرع' },
    ],
  },
]

const allLinks = groups.flatMap(group => group.links)

export default function AdminShell({ children }: AdminShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = useMemo(() => {
    const exact = allLinks.find(link => link.to === location.pathname)
    if (exact) return exact.to
    const parent = allLinks.find(link => location.pathname.startsWith(`${link.to}/`))
    return parent?.to || '/admin'
  }, [location.pathname])
  const activeGroupTitle = useMemo(() => {
    return groups.find(group => group.links.some(link => link.to === currentPath))?.title || 'مركز القيادة'
  }, [currentPath])
  const [openGroups, setOpenGroups] = useState<string[]>(() => ['مركز القيادة'])

  useEffect(() => {
    setOpenGroups(current => current.includes(activeGroupTitle) ? current : [...current, activeGroupTitle])
  }, [activeGroupTitle])

  function toggleGroup(title: string) {
    setOpenGroups(current => current.includes(title)
      ? current.filter(groupTitle => groupTitle !== title)
      : [...current, title]
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F3F7F8]" dir="rtl">
      <aside className="hidden w-72 shrink-0 overflow-y-auto rounded-[28px] border border-white/70 bg-white p-4 shadow-sm lg:fixed lg:right-3 lg:top-3 lg:block lg:h-[calc(100vh-24px)]">
        <div className="mb-4 rounded-3xl bg-[#EAF8F8] p-4">
          <p className="text-xs font-black text-[#008E92]">Dawaa Delivery</p>
          <h2 className="mt-1 text-xl font-black text-[#061827]">لوحة الإدارة</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">تشغيل، متابعة، وتحليل من مكان واحد.</p>
        </div>
        <nav className="space-y-2 pb-16">
          {groups.map(group => {
            const isOpen = openGroups.includes(group.title)
            const isActiveGroup = group.title === activeGroupTitle
            return (
              <section key={group.title} className={`rounded-2xl border transition ${isActiveGroup ? 'border-[#008E92]/20 bg-[#F1FBFB]' : 'border-slate-100 bg-white'}`}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-right transition hover:bg-slate-50"
                  aria-expanded={isOpen}
                >
                  <span className="min-w-0">
                    <span className={`block text-sm font-black ${isActiveGroup ? 'text-[#008E92]' : 'text-[#061827]'}`}>{group.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-bold text-slate-400">{group.hint}</span>
                  </span>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-lg font-black transition ${isOpen ? 'rotate-90 bg-[#008E92] text-white' : 'bg-slate-100 text-slate-500'}`}>‹</span>
                </button>
                {isOpen && (
                  <div className="space-y-1 px-2 pb-2">
                    {group.links.map(link => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.to === '/admin'}
                        className={({ isActive }) => `block rounded-2xl px-3 py-2.5 text-sm font-black transition ${isActive || currentPath === link.to ? 'bg-[#008E92] text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-[#008E92]'}`}
                      >
                        {link.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </nav>
        <div className="pointer-events-none sticky bottom-0 -mx-4 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-2 pt-8 text-center text-[11px] font-black text-slate-400">
          افتح المجموعة المطلوبة فقط لعرض الصفحات ↑ ↓
        </div>
      </aside>

      <div className="w-full min-w-0 p-3 lg:mr-[312px] lg:w-[calc(100%-312px)] lg:max-w-none lg:pr-3">
        <div className="lg:hidden">
          <label className="mb-1 block text-xs font-black text-slate-500">انتقال سريع لصفحات الإدارة</label>
          <select value={currentPath} onChange={event => navigate(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm outline-none focus:border-[#008E92]">
            {groups.map(group => (
              <optgroup key={group.title} label={group.title}>
                {group.links.map(link => <option key={link.to} value={link.to}>{link.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <main className="min-w-0 overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
