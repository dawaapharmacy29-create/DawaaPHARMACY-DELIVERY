import AdminDashboardReliable from './AdminDashboardReliable'
import DashboardTripCustomerInsights from '../../components/DashboardTripCustomerInsights'
import CycleArchiveOverview from '../../components/CycleArchiveOverview'
import DashboardGrowthPanelReliable from '../../components/DashboardGrowthPanelReliable'

export default function AdminDashboardWithTripAudit() {
  return (
    <>
      <div className="space-y-5" dir="rtl">
        <AdminDashboardReliable />
        <DashboardTripCustomerInsights />
        <DashboardGrowthPanelReliable />
        <CycleArchiveOverview />
      </div>
    </>
  )
}
