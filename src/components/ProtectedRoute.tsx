import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DatabaseNotReady from '@/components/DatabaseNotReady';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, authError, retryAuth } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white text-sm">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return <DatabaseNotReady reason={authError} onRetry={retryAuth} />;
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
