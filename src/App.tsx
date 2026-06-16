import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'

// ── Lazy load all pages (dramatically reduces initial bundle size) ──────────
const Login          = lazy(() => import('./pages/Login'))
const RiderLogin     = lazy(() => import('./pages/RiderLogin'))
const Health         = lazy(() => import('./pages/Health'))
const SafeAdmin      = lazy(() => import('./pages/SafeAdmin'))
const RiderDashboard = lazy(() => import('./pages/rider/RiderDashboard'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const RiderSchedules = lazy(() => import('./pages/admin/RiderSchedules'))
const Riders         = lazy(() => import('./pages/admin/Riders'))
const Performance    = lazy(() => import('./pages/admin/Performance'))
const DuplicateInvoices   = lazy(() => import('./pages/admin/DuplicateInvoices'))
const Reconciliation      = lazy(() => import('./pages/admin/Reconciliation'))
const Trips               = lazy(() => import('./pages/admin/Trips'))
const TripsWithoutInvoice = lazy(() => import('./pages/admin/TripsWithoutInvoice'))
const RiderAccounts       = lazy(() => import('./pages/admin/RiderAccounts'))
const RiderActions        = lazy(() => import('./pages/admin/RiderActions'))
const BranchManagerDashboard = lazy(() => import('./pages/admin/BranchManagerDashboard'))
const CustomerImport = lazy(() => import('./pages/admin/CustomerImport'))
const CustomerAnalytics = lazy(() => import('./pages/admin/CustomerAnalytics'))
const RiderPerformanceDetail = lazy(() => import('./pages/admin/RiderPerformanceDetail'))

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

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster richColors position="top-center" dir="rtl" />
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
            <Route path="/admin"                       element={<ProtectedRoute pageKey="dashboard"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/rider-schedules"       element={<ProtectedRoute pageKey="rider_schedules"><RiderSchedules /></ProtectedRoute>} />
            <Route path="/admin/riders"                element={<ProtectedRoute pageKey="riders"><Riders /></ProtectedRoute>} />
            <Route path="/admin/rider-accounts"        element={<ProtectedRoute pageKey="rider_accounts"><RiderAccounts /></ProtectedRoute>} />
            <Route path="/admin/performance"           element={<ProtectedRoute pageKey="performance"><Performance /></ProtectedRoute>} />
            <Route path="/admin/riders/:riderId/performance" element={<ProtectedRoute pageKey="performance"><RiderPerformanceDetail /></ProtectedRoute>} />
            <Route path="/admin/duplicate-invoices"    element={<ProtectedRoute pageKey="duplicate_invoices"><DuplicateInvoices /></ProtectedRoute>} />
            <Route path="/admin/reconciliation"        element={<ProtectedRoute pageKey="reconciliation"><Reconciliation /></ProtectedRoute>} />
            <Route path="/admin/trips"                 element={<ProtectedRoute pageKey="trips"><Trips /></ProtectedRoute>} />
            <Route path="/admin/branch"                element={<ProtectedRoute pageKey="branch_dashboard"><BranchManagerDashboard /></ProtectedRoute>} />
            <Route path="/admin/rider-actions"         element={<ProtectedRoute pageKey="rider_actions"><RiderActions /></ProtectedRoute>} />
            <Route path="/admin/trips-without-invoice" element={<ProtectedRoute pageKey="trips_without_invoice"><TripsWithoutInvoice /></ProtectedRoute>} />
            <Route path="/admin/customer-import" element={<ProtectedRoute pageKey="customer_import"><CustomerImport /></ProtectedRoute>} />
            <Route path="/admin/customer-analytics" element={<ProtectedRoute pageKey="customer_analytics"><CustomerAnalytics /></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="/"  element={<Navigate to="/login" replace />} />
            <Route path="*"  element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
