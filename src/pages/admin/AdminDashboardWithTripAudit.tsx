import AdminDashboard from './AdminDashboard'
import DashboardTripCustomerInsights from '../../components/DashboardTripCustomerInsights'

export default function AdminDashboardWithTripAudit() {
  return (
    <div className="space-y-5" dir="rtl">
      <AdminDashboard />
      <DashboardTripCustomerInsights />
    </div>
  )
}
