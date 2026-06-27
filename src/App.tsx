import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import AdminShell from './components/AdminShell'
import type { PageKey } from './lib/permissions'

const Login = lazy(() => import('./pages/Login'))
const RiderLogin = lazy(() => import('./pages/RiderLogin'))
const Health = lazy(() => import('./pages/Health'))
const SafeAdmin = lazy(() => import('./pages/SafeAdmin'))
const RiderDashboard = lazy(() => import('./pages/rider/RiderDashboard'))

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboardWithTripAudit'))
const ExecutiveDashboard = lazy(() => import('./pages/admin/ExecutiveDashboard'))
const RiderSchedules = lazy(() => import('./pages/admin/RiderSchedules'))
const Riders = lazy(() => import('./pages/admin/Riders'))
const Performance = lazy(() => import('./pages/admin/Performance'))
const DuplicateInvoices = lazy(() => import('./pages/admin/DuplicateInvoices'))
const Reconciliation = lazy(() => import('./pages/admin/Reconciliation'))
const Trips = lazy(() => import('./pages/admin/Trips'))
const TripsWithoutInvoice = lazy(() => import('./pages/admin/TripsWithoutInvoice'))
const RiderAccounts = lazy(() => import('./pages/admin/RiderAccounts'))
const RiderActions = lazy(() => import('./pages/admin/RiderActions'))
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
const CycleArchiveLite = lazy(() => import('./pages/admin/CycleArchiveLite'))

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8]" dir="rtl">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent" />
        <p className="mt-3 text-sm font-bold text-slate-400">جاري التحميل...</p>
      </div>
    </div>
  )
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

function AdminRoute({ pageKey, children }: { pageKey: PageKey; children: ReactNode }) {
  return (
    <ProtectedRoute pageKey={pageKey}>
      <AdminShell>{children}</AdminShell>
    </ProtectedRoute>
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
            <Route path="/health" element={<Health />} />
            <Route path="/safe-admin" element={<SafeAdmin />} />
            <Route path="/login" element={<Login />} />
            <Route path="/rider-login" element={<RiderLogin />} />

            <Route path="/rider" element={<ProtectedRoute pageKey="rider"><RiderDashboard /></ProtectedRoute>} />

            <Route path="/admin" element={<AdminRoute pageKey="dashboard"><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/executive" element={<AdminRoute pageKey="dashboard"><ExecutiveDashboard /></AdminRoute>} />
            <Route path="/admin/ops" element={<AdminRoute pageKey="dashboard"><OperationsBoard /></AdminRoute>} />
            <Route path="/admin/reports" element={<AdminRoute pageKey="dashboard"><ReportsCenter /></AdminRoute>} />
            <Route path="/admin/cycles" element={<AdminRoute pageKey="dashboard"><CycleArchiveLite /></AdminRoute>} />

            <Route path="/admin/riders" element={<AdminRoute pageKey="riders"><Riders /></AdminRoute>} />
            <Route path="/admin/performance" element={<AdminRoute pageKey="performance"><Performance /></AdminRoute>} />
            <Route path="/admin/riders/:riderId/performance" element={<AdminRoute pageKey="performance"><RiderPerformanceDetail /></AdminRoute>} />
            <Route path="/admin/rider-schedules" element={<AdminRoute pageKey="rider_schedules"><RiderSchedules /></AdminRoute>} />
            <Route path="/admin/rider-accounts" element={<AdminRoute pageKey="rider_accounts"><RiderAccounts /></AdminRoute>} />
            <Route path="/admin/rider-actions" element={<AdminRoute pageKey="rider_actions"><RiderActions /></AdminRoute>} />
            <Route path="/admin/rider-preview" element={<ProtectedRoute pageKey="riders"><RiderImpersonationPreview /></ProtectedRoute>} />

            <Route path="/admin/reconciliation" element={<AdminRoute pageKey="reconciliation"><Reconciliation /></AdminRoute>} />
            <Route path="/admin/duplicate-invoices" element={<AdminRoute pageKey="duplicate_invoices"><DuplicateInvoices /></AdminRoute>} />
            <Route path="/admin/trips" element={<AdminRoute pageKey="trips"><Trips /></AdminRoute>} />
            <Route path="/admin/trips-without-invoice" element={<AdminRoute pageKey="trips_without_invoice"><TripsWithoutInvoice /></AdminRoute>} />
            <Route path="/admin/invoice-notebook" element={<AdminRoute pageKey="dashboard"><InvoiceNotebook /></AdminRoute>} />

            <Route path="/admin/customer-analytics" element={<AdminRoute pageKey="customer_analytics"><CustomerAnalytics /></AdminRoute>} />
            <Route path="/admin/customer-import" element={<AdminRoute pageKey="customer_import"><CustomerImport /></AdminRoute>} />
            <Route path="/admin/route-planner" element={<AdminRoute pageKey="dashboard"><RoutePlanner /></AdminRoute>} />

            <Route path="/admin/fraud-alerts" element={<AdminRoute pageKey="dashboard"><FraudAlerts /></AdminRoute>} />
            <Route path="/admin/cash-flow" element={<AdminRoute pageKey="dashboard"><CashFlowDashboard /></AdminRoute>} />
            <Route path="/admin/branch" element={<AdminRoute pageKey="branch_dashboard"><BranchManagerDashboard /></AdminRoute>} />

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
