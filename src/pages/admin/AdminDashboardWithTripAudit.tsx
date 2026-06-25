import AdminDashboard from './AdminDashboard'
import DashboardTripCustomerInsights from '../../components/DashboardTripCustomerInsights'
import CycleArchiveOverview from '../../components/CycleArchiveOverview'

export default function AdminDashboardWithTripAudit() {
  return (
    <>
      <div className="space-y-5" dir="rtl">
        <AdminDashboard />
        <DashboardTripCustomerInsights />
        <CycleArchiveOverview />
      </div>
    </>
  )
}
