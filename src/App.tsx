import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import NotFound from '@/pages/NotFound';

const DeliveryDashboard = lazy(() => import('@/pages/delivery/DeliveryDashboard'));
const RiderConsole = lazy(() => import('@/pages/delivery/RiderConsole'));
const DeliveryOrders = lazy(() => import('@/pages/delivery/DeliveryOrders'));
const DeliveryPayroll = lazy(() => import('@/pages/delivery/DeliveryPayroll'));
const DeliverySettings = lazy(() => import('@/pages/delivery/DeliverySettings'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function protectedPage(page: ReactNode) {
  return <ProtectedRoute>{page}</ProtectedRoute>;
}

function AppLoading() {
  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center" dir="rtl">
      <div className="text-center text-white">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm">جاري تحميل الواجهة...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<AppLoading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={protectedPage(<Navigate to="/delivery" replace />)} />
              <Route path="/delivery" element={protectedPage(<DeliveryDashboard />)} />
              <Route path="/delivery/rider" element={protectedPage(<RiderConsole />)} />
              <Route path="/delivery/orders" element={protectedPage(<DeliveryOrders />)} />
              <Route path="/delivery/payroll" element={protectedPage(<DeliveryPayroll />)} />
              <Route path="/delivery/settings" element={protectedPage(<DeliverySettings />)} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Toaster position="top-center" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
