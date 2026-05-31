import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const adminRoles = ['admin', 'super_admin', 'مدير عام'];
const managerRoles = ['shift_manager', 'مدير شيفت'];
const riderRoles = ['rider', 'مندوب'];

export function isAdminRole(role?: string) {
  return adminRoles.includes(role || '');
}

export function isManagerRole(role?: string) {
  return managerRoles.includes(role || '');
}

export function isRiderRole(role?: string) {
  return riderRoles.includes(role || '');
}

export function defaultPathForRole(role?: string) {
  if (isRiderRole(role)) return '/delivery/rider';
  return '/delivery';
}

export default function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: string[];
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#081826] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <img src="/brand/dawaa-logo.jpeg" alt="Dawaa Delivery" className="w-24 h-24 object-contain mx-auto mb-4 rounded-2xl bg-white p-2" />
          <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white text-sm">جاري تحميل Dawaa Delivery...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={defaultPathForRole(user.role)} replace />;
  }

  return <>{children}</>;
}

export const ADMIN_DELIVERY_ROLES = [...adminRoles, ...managerRoles];
export const RIDER_DELIVERY_ROLES = [...riderRoles, ...adminRoles, ...managerRoles];
