import { ReactNode, useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  ChevronLeft,
  ChevronsUpDown,
  ClipboardList,
  LayoutDashboard,
  MapPinned,
  Menu,
  PackageSearch,
  Search,
  Truck,
  Users,
  X,
} from 'lucide-react'

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
  icon: typeof LayoutDashboard
  links: AdminNavLink[]
}

const groups: AdminNavGroup[] = [
  {
    title: 'الرئيسية',
    hint: 'القرار السريع وملخص الدورة',
    icon: LayoutDashboard,
    links: [
      { to: '/admin', label: 'لوحة الإدارة' },
      { to: '/admin/executive', label: 'ملخص الإدارة' },
    ],
  },
  {
    title: 'التشغيل والمراجعة',
    hint: 'الأوردرات والمشاوير والحالات المعلقة',
    icon: PackageSearch,
    links: [
      { to: '/admin/review-center', label: 'مركز مراجعة الدورة' },
      { to: '/admin/reconciliation', label: 'مطابقة الأوردرات' },
      { to: '/admin/trips', label: 'مراجعة المشاوير' },
      { to: '/admin/duplicate-invoices', label: 'الأوردرات المكررة' },
      { to: '/admin/trips-without-invoice', label: 'حالات بدون فاتورة' },
    ],
  },
  {
    title: 'الفريق والأداء',
    hint: 'الفريق والجداول والحسابات والمستحقات',
    icon: Users,
    links: [
      { to: '/admin/riders', label: 'فريق الدليفري' },
      { to: '/admin/rider-schedules', label: 'الجداول والمواعيد' },
      { to: '/admin/rider-accounts', label: 'الحسابات والأجهزة' },
      { to: '/admin/performance', label: 'أداء الدليفري' },
      { to: '/admin/hourly-analytics', label: 'الأداء حسب الساعة' },
      { to: '/admin/rider-actions', label: 'طلبات وقرارات الدليفري' },
      { to: '/admin/penalty-incentive', label: 'سجل الخصومات والمكافآت' },
      { to: '/admin/rider-compensation', label: 'مستحقات الدليفري' },
    ],
  },
  {
    title: 'العملاء والمناطق',
    hint: 'العملاء والمناطق والتحليل',
    icon: MapPinned,
    links: [
      { to: '/admin/customer-center', label: 'مركز العملاء والمناطق' },
      { to: '/admin/customer-analytics', label: 'تحليل العملاء' },
      { to: '/admin/customer-import', label: 'تحديث بيانات العملاء' },
      { to: '/admin/route-planner', label: 'المناطق والمسارات' },
    ],
  },
  {
    title: 'التقارير والإدارة',
    hint: 'التقارير والرقابة والماليات',
    icon: BarChart3,
    links: [
      { to: '/admin/reports-center', label: 'مركز التقارير والإدارة' },
      { to: '/admin/reports', label: 'تقارير الدورة' },
      { to: '/admin/cycles', label: 'أرشيف الدورات' },
      { to: '/admin/fraud-alerts', label: 'مراجعة الحالات غير الطبيعية' },
      { to: '/admin/cash-flow', label: 'ملخص مستحقات الدورة' },
      { to: '/admin/branch', label: 'لوحة مدير الفرع' },
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
    return groups.find(group => group.links.some(link => link.to === currentPath))?.title || 'الرئيسية'
  }, [currentPath])
  const currentLink = useMemo(() => allLinks.find(link => link.to === currentPath), [currentPath])
  const currentGroup = useMemo(() => groups.find(group => group.links.some(link => link.to === currentPath)), [currentPath])

  const [openGroups, setOpenGroups] = useState<string[]>(() => ['الرئيسية', 'التشغيل والمراجعة'])
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setOpenGroups(current => current.includes(activeGroupTitle) ? current : [...current, activeGroupTitle])
  }, [activeGroupTitle])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return groups
    return groups
      .map(group => ({
        ...group,
        links: group.links.filter(link => `${link.label} ${group.title} ${group.hint}`.toLowerCase().includes(query)),
      }))
      .filter(group => group.links.length > 0)
  }, [searchQuery])

  useEffect(() => {
    if (searchQuery.trim()) setOpenGroups(filteredGroups.map(group => group.title))
  }, [searchQuery, filteredGroups])

  function toggleGroup(title: string) {
    setOpenGroups(current => current.includes(title)
      ? current.filter(groupTitle => groupTitle !== title)
      : [...current, title]
    )
  }

  function toggleAllGroups() {
    setOpenGroups(current => current.length === groups.length ? [activeGroupTitle] : groups.map(group => group.title))
  }

  const sidebarContent = (
    <>
      <div className="relative overflow-hidden rounded-[26px] border border-[#008E92]/10 bg-gradient-to-br from-[#EAF8F8] via-white to-[#F4FBFB] p-4 shadow-sm">
        <div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-[#008E92]/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-black text-[#008E92] shadow-sm">
              <Truck size={13} /> Dawaa Delivery
            </div>
            <h2 className="mt-3 text-2xl font-black text-[#061827]">إدارة الدليفري</h2>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">قرار سريع، تشغيل واضح، وتقارير منظمة بدون تكدس.</p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#008E92] text-white shadow-lg shadow-[#008E92]/20">
            <ClipboardList size={22} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="ابحث عن صفحة..."
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pr-10 pl-9 text-sm font-bold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#008E92] focus:bg-white"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="مسح البحث">
              <X size={15} />
            </button>
          )}
        </label>
        <button type="button" onClick={toggleAllGroups} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-[#008E92]/30 hover:text-[#008E92]" title="فتح أو طي كل الأقسام">
          <ChevronsUpDown size={17} />
        </button>
      </div>

      <nav className="mt-3 space-y-2 pb-16">
        {filteredGroups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
            <Search className="mx-auto text-slate-300" size={24} />
            <p className="mt-2 text-sm font-black text-slate-500">لا توجد صفحة بهذا الاسم</p>
          </div>
        ) : filteredGroups.map(group => {
          const GroupIcon = group.icon
          const isOpen = openGroups.includes(group.title)
          const isActiveGroup = group.title === activeGroupTitle
          return (
            <section key={group.title} className={`overflow-hidden rounded-3xl border transition-all ${isActiveGroup ? 'border-[#008E92]/25 bg-[#F1FBFB] shadow-sm' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-right transition hover:bg-white/70"
                aria-expanded={isOpen}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition ${isActiveGroup ? 'bg-[#008E92] text-white shadow-md shadow-[#008E92]/20' : 'bg-slate-100 text-slate-500'}`}>
                    <GroupIcon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-black ${isActiveGroup ? 'text-[#007C80]' : 'text-[#061827]'}`}>{group.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-bold text-slate-400">{group.hint}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${isActiveGroup ? 'bg-[#D8F3F3] text-[#007C80]' : 'bg-slate-100 text-slate-400'}`}>{group.links.length}</span>
                  <ChevronLeft className={`transition-transform duration-200 ${isOpen ? '-rotate-90 text-[#008E92]' : 'text-slate-400'}`} size={18} />
                </span>
              </button>

              {isOpen && (
                <div className="space-y-1 border-t border-slate-100/80 px-2 pb-2 pt-2">
                  {group.links.map(link => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.to === '/admin'}
                      className={({ isActive }) => {
                        const active = isActive || currentPath === link.to
                        return `group flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-black transition-all ${active ? 'bg-[#008E92] text-white shadow-md shadow-[#008E92]/15' : 'text-slate-600 hover:bg-white hover:text-[#008E92] hover:shadow-sm'}`
                      }}
                    >
                      <span className="truncate">{link.label}</span>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                    </NavLink>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </nav>

      <div className="pointer-events-none sticky bottom-0 -mx-4 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-2 pt-8 text-center text-[11px] font-black text-slate-400">
        {allLinks.length} صفحة إدارة منظمة داخل {groups.length} أقسام
      </div>
    </>
  )

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F3F7F8]" dir="rtl">
      <aside className="hidden w-[296px] shrink-0 overflow-y-auto rounded-[30px] border border-white/70 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] lg:fixed lg:right-3 lg:top-3 lg:z-30 lg:block lg:h-[calc(100vh-24px)]">
        {sidebarContent}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" aria-label="إغلاق القائمة" />
          <aside className="absolute right-0 top-0 h-full w-[88%] max-w-[360px] overflow-y-auto bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-black text-slate-500">القائمة الرئيسية</p>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                <X size={19} />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="w-full min-w-0 p-3 lg:mr-[320px] lg:w-[calc(100%-320px)] lg:max-w-none lg:pr-3">
        <div className="sticky top-2 z-40 mb-3 flex items-center justify-between rounded-3xl border border-white/80 bg-white/90 p-2 shadow-sm backdrop-blur lg:hidden">
          <button type="button" onClick={() => setMobileMenuOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-[#008E92] px-4 py-2.5 text-sm font-black text-white shadow-sm">
            <Menu size={18} /> القائمة
          </button>
          <div className="min-w-0 text-left">
            <p className="truncate text-xs font-black text-slate-400">القسم الحالي</p>
            <p className="truncate text-sm font-black text-[#061827]">{activeGroupTitle}</p>
          </div>
        </div>

        <header className="mb-4 hidden items-center justify-between gap-4 rounded-[1.8rem] border border-slate-200 bg-white px-5 py-4 shadow-sm lg:flex">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#E7F7F7] px-3 py-1 text-[11px] font-black text-[#007C80]">{currentGroup?.title || 'الإدارة'}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500">إدارة الدليفري</span>
            </div>
            <h1 className="mt-2 truncate text-xl font-black text-[#061827]">{currentLink?.label || 'لوحة الإدارة'}</h1>
            <p className="mt-1 text-xs font-bold text-slate-400">{currentGroup?.hint || 'متابعة وتشغيل الدليفري'}</p>
          </div>
          <button type="button" onClick={() => navigate('/admin')} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-600 transition hover:border-[#008E92]/30 hover:text-[#008E92]">
            الرئيسية
          </button>
        </header>

        <main className="min-w-0 overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
