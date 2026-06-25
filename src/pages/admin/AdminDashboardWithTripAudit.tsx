import AdminDashboard from './AdminDashboard'
import TripFraudWatch from '../../components/TripFraudWatch'

export default function AdminDashboardWithTripAudit() {
  return (
    <div className="space-y-5" dir="rtl">
      <AdminDashboard />
      <TripFraudWatch />
    </div>
  )
}
