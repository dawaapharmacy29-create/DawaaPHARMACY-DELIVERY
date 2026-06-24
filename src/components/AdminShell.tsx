import { ReactNode, useMemo } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

type AdminShellProps = {
  children: ReactNode
}

const groups = [
  {
    title: 'مركز القيادة',
    links: [
      { to: '/admin', label: 'داشبورد التشغيل' },
      { to: '/admin/executive', label: 'لوحة الإدارة العليا' },
      { to: '/admin/ops', label: 'غرفة العمليات' },
      { to: '/admin/reports', label: 'مركز التقارير' },
    ],
  },
  {
    title: 'المناديب',
    links: [
      { to: '/admin/riders', label: 'بيانات المناديب' },
      { to: '/admin/performance', label: 'تحليل أداء المناديب' },
      { to: '/admin/rider-schedules', label: 'مواعيد المناديب' },
      { to: '/admin/rider-accounts', label: 'حسابات وأجهزة الدخول' },
      { to: '/admin/rider-actions', label: 'إجراءات وملاحظات' },
    ],
  },
  {
    title: 'الأوردرات والمطابقة',
    links: [
      { to: '/admin/reconciliation', label: 'مطابقة الفواتير' },
      { to: '/admin/duplicate-invoices', label: 'الفواتير المكررة' },
      { to: '/admin/trips', label: 'المشاوير' },
      { to: '/admin/trips-without-invoice', label: 'مشاوير بدون فاتورة' },
      { to: '/admin/invoice-notebook', label: 'دفتر الفواتير' },
    ],
  },
  {
    title: 'العملاء والتحليل',
    links: [
      { to: '/admin/customer-analytics', label: 'تحليل العملاء الشهري' },
      { to: '/admin/customer-import', label: 'استيراد وتحديث العملاء' },
      { to: '/admin/route-planner', label: 'تحليل المناطق والمسارات' },
    ],
  },
  {
    title: 'الرقابة والماليات',
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

  return (
    <div className="min-h-screen bg-[#F3F7F8]" dir="rtl">
      <aside className="hidden w-72 shrink-0 overflow-y-auto rounded-[28px] border border-white/70 bg-white p-4 shadow-sm lg:fixed lg:right-3 lg:top-3 lg:block lg:h-[calc(100vh-24px)]">
        <div className="mb-4 rounded-3xl bg-[#EAF8F8] p-4">
          <p className="text-xs font-black text-[#008E92]">Dawaa Delivery</p>
          <h2 className="mt-1 text-xl font-black text-[#061827]">لوحة الإدارة</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">تشغيل، متابعة، وتحليل من مكان واحد.</p>
        </div>
        <nav className="space-y-4 pb-10">
          {groups.map(group => (
            <section key={group.title}>
              <p className="mb-2 px-2 text-xs font-black text-slate-400">{group.title}</p>
              <div className="space-y-1">
                {group.links.map(link => (
                  <NavLink key={link.to} to={link.to} end={link.to === '/admin'} className={({ isActive }) => `block rounded-2xl px-3 py-2.5 text-sm font-black transition ${isActive || currentPath === link.to ? 'bg-[#008E92] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-[#008E92]'}`}>
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </aside>

      <div className="mx-auto w-full max-w-[1800px] p-3 lg:mr-[312px] lg:pr-3">
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
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
