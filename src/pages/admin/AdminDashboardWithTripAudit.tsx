import AdminDashboardReliable from './AdminDashboardReliable'
import DashboardTripCustomerInsights from '../../components/DashboardTripCustomerInsights'
import CycleArchiveOverview from '../../components/CycleArchiveOverview'
import DashboardGrowthPanelReliable from '../../components/DashboardGrowthPanelReliable'
import RiderAppVersionStatus from '../../components/RiderAppVersionStatus'
import RiderOperationsHealth from '../../components/RiderOperationsHealth'
import LiveRiderLeaderboard from '../../components/LiveRiderLeaderboard'

export default function AdminDashboardWithTripAudit() {
  return (
    <div className="space-y-5" dir="rtl">
      <AdminDashboardReliable />

      <section className="grid gap-5 xl:grid-cols-2">
        <RiderAppVersionStatus />
        <LiveRiderLeaderboard />
      </section>

      <RiderOperationsHealth />
      <DashboardTripCustomerInsights />
      <DashboardGrowthPanelReliable />
      <CycleArchiveOverview />
    </div>
  )
}
