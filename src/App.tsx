import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import NotFound from '@/pages/NotFound';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Invoices = lazy(() => import('@/pages/Invoices'));
const PendingReview = lazy(() => import('@/pages/PendingReview'));
const ControlledMedicines = lazy(() => import('@/pages/ControlledMedicines'));
const DeadStock = lazy(() => import('@/pages/DeadStock'));
const Expenses = lazy(() => import('@/pages/Expenses'));
const Returns = lazy(() => import('@/pages/Returns'));
const Suppliers = lazy(() => import('@/pages/Suppliers'));
const SupplierBalances = lazy(() => import('@/pages/SupplierBalances'));
const Reconciliation = lazy(() => import('@/pages/Reconciliation'));
const Reports = lazy(() => import('@/pages/Reports'));
const OperationsLog = lazy(() => import('@/pages/OperationsLog'));
const UsersPermissions = lazy(() => import('@/pages/UsersPermissions'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

function protectedPage(page: React.ReactNode) {
  return <ProtectedRoute>{page}</ProtectedRoute>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="p-6 text-right">جاري التحميل...</div>}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={protectedPage(<Dashboard />)} />
              <Route path="/invoices" element={protectedPage(<Invoices />)} />
              <Route path="/pending-review" element={protectedPage(<PendingReview />)} />
              <Route path="/controlled-medicines" element={protectedPage(<ControlledMedicines />)} />
              <Route path="/dead-stock" element={protectedPage(<DeadStock />)} />
              <Route path="/expenses" element={protectedPage(<Expenses />)} />
              <Route path="/returns" element={protectedPage(<Returns />)} />
              <Route path="/suppliers" element={protectedPage(<Suppliers />)} />
              <Route path="/supplier-balances" element={protectedPage(<SupplierBalances />)} />
              <Route path="/reconciliation" element={protectedPage(<Reconciliation />)} />
              <Route path="/reports" element={protectedPage(<Reports />)} />
              <Route path="/operations-log" element={protectedPage(<OperationsLog />)} />
              <Route path="/users" element={protectedPage(<UsersPermissions />)} />
              <Route path="/settings" element={protectedPage(<SettingsPage />)} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Toaster position="top-center" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
