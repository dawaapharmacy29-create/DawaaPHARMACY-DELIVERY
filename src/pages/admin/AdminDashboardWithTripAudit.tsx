import AdminDashboardClassicReliable from './AdminDashboardClassicReliable'
import DashboardTripCustomerInsights from '../../components/DashboardTripCustomerInsights'
import CycleArchiveOverview from '../../components/CycleArchiveOverview'
import DashboardGrowthPanelReliable from '../../components/DashboardGrowthPanelReliable'
import RiderAppVersionStatus from '../../components/RiderAppVersionStatus'
import RiderOperationsHealth from '../../components/RiderOperationsHealth'
import LiveRiderLeaderboardPanel from '../../components/LiveRiderLeaderboardPanel'

export default function AdminDashboardWithTripAudit() {
  return (
    <div className="space-y-6" dir="rtl">
      <AdminDashboardClassicReliable />

      <section className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <RiderAppVersionStatus />
        <LiveRiderLeaderboardPanel />
      </section>

      <RiderOperationsHealth />
      <DashboardTripCustomerInsights />
      <DashboardGrowthPanelReliable />
      <CycleArchiveOverview />
    </div>
  )
}
