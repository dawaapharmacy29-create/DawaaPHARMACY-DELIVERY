import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'

// ── Lazy load all pages (dramatically reduces initial bundle size) ──────────
const Login          = lazy(() => import('./pages/Login'))
const RiderLogin     = lazy(() => import('./pages/RiderLogin'))
const Health         = lazy(() => import('./pages/Health'))
const SafeAdmin      = lazy(() => import('./pages/SafeAdmin'))
// ⚠️ Only RiderDashboard exists — do not import V2/V3/Legacy variants
const RiderDashboard = lazy(() => import('./pages/rider/RiderDashboard'))

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const ExecutiveDashboard = lazy(() => import('./pages/admin/ExecutiveDashboard'))
const RiderSchedules = lazy(() => import('./pages/admin/RiderSchedules'))
const Riders         = lazy(() => import('./pages/admin/Riders'))
const Performance    = lazy(() => import('./pages/admin/Performance'))
const DuplicateInvoices   = lazy(() => import('./pages/admin/DuplicateInvoices'))
const Reconciliation      = lazy(() => import('./pages/admin/Reconciliation'))
const Trips               = lazy(() => import('./pages/admin/Trips'))
const TripsWithoutInvoice = lazy(() => import('./pages/admin/TripsWithoutInvoice'))
const RiderAccounts       = lazy(() => import('./pages/admin/RiderAccounts'))
const RiderActions        = lazy(() => import('./pages/admin/RiderActions'))
const RiderImpersonationPreview = lazy(() => import('./pages/admin/RiderImpersonationPreview'))
const BranchManagerDashboard = lazy(() => import('./pages/admin/BranchManagerDashboard'))
const CustomerImport = lazy(() => import('./pages/admin/CustomerImport'))
const CustomerAnalytics = lazy(() => import('./pages/admin/CustomerAnalytics'))
const RiderPerformanceDetail = lazy(() => import('./pages/admin/RiderPerformanceDetail'))
const OperationsBoard = lazy(() => import('./pages/admin/OperationsBoard'))
const CashFlowDashboard = lazy(() => import('./pages/admin/CashFlowDashboard'))
const FraudAlerts = lazy(() => import('./pages/admin/FraudAlerts'))
const InvoiceNotebook = lazy(() => import('./pages/admin/InvoiceNotebook'))
const RoutePlanner = lazy(() => import('./pages/admin/RoutePlanner'))
const ReportsCenter = lazy(() => import('./pages/admin/ReportsCenter'))

// ── Page loader skeleton ─────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8]" dir="rtl">
      <div className="text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent mx-auto" />
        <p className="mt-3 text-sm font-bold text-slate-400">جاري التحميل...</p>
      </div>
    </div>
  )
}

const adminGroups = [
  {
    title: 'مركز القيادة',
    items: [
      { to: '/admin', label: 'داشبورد التشغيل', icon: '📊' },
      { to: '/admin/executive', label: 'لوحة الإدارة العليا', icon: '👑' },
      { to: '/admin/ops', label: 'غرفة العمليات', icon: '🚦' },
      { to: '/admin/reports', label: 'مركز التقارير', icon: '📄' },
    ],
  },
  {
    title: 'المناديب',
    items: [
      { to: '/admin/riders', label: 'بيانات المناديب', icon: '🛵' },
      { to: '/admin/performance', label: 'تحليل أداء المناديب', icon: '📈' },
      { to: '/admin/rider-schedules', label: 'مواعيد المناديب', icon: '🗓️' },
      { to: '/admin/rider-accounts', label: 'حسابات وأجهزة الدخول', icon: '🔐' },
      { to: '/admin/rider-actions', label: 'إجراءات وملاحظات', icon: '⚠️' },
    ],
  },
  {
    title: 'الأوردرات والمطابقة',
    items: [
      { to: '/admin/reconciliation', label: 'مطابقة الفواتير', icon: '✅' },
      { to: '/admin/duplicate-invoices', label: 'الفواتير المكررة', icon: '🧾' },
      { to: '/admin/trips', label: 'المشاوير', icon: '📍' },
      { to: '/admin/trips-without-invoice', label: 'مشاوير بدون فاتورة', icon: '🚫' },
      { to: '/admin/invoice-notebook', label: 'دفتر الفواتير', icon: '📒' },
    ],
  },
  {
    title: 'العملاء والتحليل',
    items: [
      { to: '/admin/customer-analytics', label: 'تحليل العملاء الشهري', icon: '👥' },
      { to: '/admin/customer-import', label: 'استيراد وتحديث العملاء', icon: '⬆️' },
      { to: '/admin/route-planner', label: 'تحليل المناطق والمسارات', icon: '🗺️' },
    ],
  },
  {
    title: 'الرقابة والماليات',
    items: [
      { to: '/admin/fraud-alerts', label: 'تنبيهات التلاعب', icon: '🛡️' },
      { to: '/admin/cash-flow', label: 'الملخص المالي', icon: '💰' },
      { to: '/admin/branch', label: 'مدير الفرع', icon: '🏪' },
    ],
  },
]

function AdminShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isRiderPreview = location.pathname === '/admin/rider-preview'
  if (isRiderPreview) return <>{children}</>

  return (
    <div className="min-h-screen bg-[#EEF6F7]" dir="rtl">
      <aside className="no-print fixed right-0 top-0 z-40 hidden h-screen w-[292px] overflow-y-auto border-l border-white/40 bg-[#062B31] p-4 text-white shadow-2xl lg:block">
        <div className="mb-5 rounded-[28px] bg-white/10 p-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" className="h-12 w-12 rounded-2xl bg-white object-contain p-1" alt="Dawaa" />
            <div>
              <p className="text-xs font-black text-teal-100">Dawaa Delivery</p>
              <h2 className="text-lg font-black">مركز التحكم</h2>
            </div>
          </div>
          <p className="mt-3 text-xs font-bold leading-6 text-teal-50/80">قائمة ثابتة للوصول السريع لكل صفحات المناديب، العملاء، المطابقة، والتحليلات.</p>
        </div>

        <nav className="space-y-4 pb-8">
          {adminGroups.map((group) => (
            <section key={group.title}>
              <p className="mb-2 px-2 text-[11px] font-black text-teal-200/80">{group.title}</p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin'}
                    className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-black transition ${isActive ? 'bg-white text-[#063B40] shadow-lg' : 'text-teal-50 hover:bg-white/10'}`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </aside>

      <div className="lg:mr-[292px]">
        <div className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
          <button onClick={() => navigate('/admin')} className="rounded-2xl bg-[#062B31] px-4 py-2 text-sm font-black text-white">الرئيسية</button>
          <select value={location.pathname} onChange={(e) => navigate(e.target.value)} className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
            {adminGroups.flatMap((g) => g.items).map((item) => <option key={item.to} value={item.to}>{item.label}</option>)}
          </select>
        </div>
        {children}
      </div>
    </div>
  )
}

function AdminPage({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  return <ProtectedRoute pageKey={pageKey}><AdminShell>{children}</AdminShell></ProtectedRoute>
}

function AdminQuickPreviewButton() {
  const location = useLocation()
  const navigate = useNavigate()
  if (!location.pathname.startsWith('/admin') || location.pathname === '/admin/rider-preview') return null
  return (
    <button
      type="button"
      onClick={() => navigate('/admin/rider-preview')}
      className="fixed bottom-5 left-5 z-[90] rounded-3xl bg-[#008E92] px-5 py-4 text-sm font-black text-white shadow-2xl shadow-teal-950/20 transition hover:-translate-y-1 hover:bg-[#00777b]"
      dir="rtl"
    >
      تجربة كالدليفري
    </button>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster richColors position="top-center" dir="rtl" />
        <AdminQuickPreviewButton />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/health"      element={<Health />} />
            <Route path="/safe-admin"  element={<SafeAdmin />} />
            <Route path="/login"       element={<Login />} />
            <Route path="/rider-login" element={<RiderLogin />} />

            {/* Protected — Rider */}
            <Route path="/rider" element={<ProtectedRoute pageKey="rider"><RiderDashboard /></ProtectedRoute>} />

            {/* Protected — Admin */}
            <Route path="/admin"                       element={<AdminPage pageKey="dashboard"><AdminDashboard /></AdminPage>} />
            <Route path="/admin/executive"             element={<AdminPage pageKey="dashboard"><ExecutiveDashboard /></AdminPage>} />
            <Route path="/admin/rider-schedules"       element={<AdminPage pageKey="rider_schedules"><RiderSchedules /></AdminPage>} />
            <Route path="/admin/riders"                element={<AdminPage pageKey="riders"><Riders /></AdminPage>} />
            <Route path="/admin/rider-accounts"        element={<AdminPage pageKey="rider_accounts"><RiderAccounts /></AdminPage>} />
            <Route path="/admin/rider-preview"         element={<ProtectedRoute pageKey="riders"><RiderImpersonationPreview /></ProtectedRoute>} />
            <Route path="/admin/performance"           element={<AdminPage pageKey="performance"><Performance /></AdminPage>} />
            <Route path="/admin/riders/:riderId/performance" element={<AdminPage pageKey="performance"><RiderPerformanceDetail /></AdminPage>} />
            <Route path="/admin/duplicate-invoices"    element={<AdminPage pageKey="duplicate_invoices"><DuplicateInvoices /></AdminPage>} />
            <Route path="/admin/reconciliation"        element={<AdminPage pageKey="reconciliation"><Reconciliation /></AdminPage>} />
            <Route path="/admin/trips"                 element={<AdminPage pageKey="trips"><Trips /></AdminPage>} />
            <Route path="/admin/branch"                element={<AdminPage pageKey="branch_dashboard"><BranchManagerDashboard /></AdminPage>} />
            <Route path="/admin/rider-actions"         element={<AdminPage pageKey="rider_actions"><RiderActions /></AdminPage>} />
            <Route path="/admin/trips-without-invoice" element={<AdminPage pageKey="trips_without_invoice"><TripsWithoutInvoice /></AdminPage>} />
            <Route path="/admin/customer-import"       element={<AdminPage pageKey="customer_import"><CustomerImport /></AdminPage>} />
            <Route path="/admin/customer-analytics"    element={<AdminPage pageKey="customer_analytics"><CustomerAnalytics /></AdminPage>} />
            <Route path="/admin/ops"                   element={<AdminPage pageKey="dashboard"><OperationsBoard /></AdminPage>} />
            <Route path="/admin/cash-flow"             element={<AdminPage pageKey="dashboard"><CashFlowDashboard /></AdminPage>} />
            <Route path="/admin/fraud-alerts"          element={<AdminPage pageKey="dashboard"><FraudAlerts /></AdminPage>} />
            <Route path="/admin/invoice-notebook"      element={<AdminPage pageKey="dashboard"><InvoiceNotebook /></AdminPage>} />
            <Route path="/admin/route-planner"         element={<AdminPage pageKey="dashboard"><RoutePlanner /></AdminPage>} />
            <Route path="/admin/reports"               element={<AdminPage pageKey="dashboard"><ReportsCenter /></AdminPage>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
