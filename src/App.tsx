import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import Dashboard from '@/pages/Dashboard';
import Invoices from '@/pages/Invoices';
import PendingReview from '@/pages/PendingReview';
import ControlledMedicines from '@/pages/ControlledMedicines';
import DeadStock from '@/pages/DeadStock';
import Expenses from '@/pages/Expenses';
import Returns from '@/pages/Returns';
import Suppliers from '@/pages/Suppliers';
import SupplierBalances from '@/pages/SupplierBalances';
import Reconciliation from '@/pages/Reconciliation';
import Reports from '@/pages/Reports';
import OperationsLog from '@/pages/OperationsLog';
import UsersPermissions from '@/pages/UsersPermissions';
import SettingsPage from '@/pages/SettingsPage';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
            <Route path="/pending-review" element={<ProtectedRoute><PendingReview /></ProtectedRoute>} />
            <Route path="/controlled-medicines" element={<ProtectedRoute><ControlledMedicines /></ProtectedRoute>} />
            <Route path="/dead-stock" element={<ProtectedRoute><DeadStock /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
            <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
            <Route path="/supplier-balances" element={<ProtectedRoute><SupplierBalances /></ProtectedRoute>} />
            <Route path="/reconciliation" element={<ProtectedRoute><Reconciliation /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/operations-log" element={<ProtectedRoute><OperationsLog /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute><UsersPermissions /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster position="top-center" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
