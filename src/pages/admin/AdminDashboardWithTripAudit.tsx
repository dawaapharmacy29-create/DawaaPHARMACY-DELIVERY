import { lazy, Suspense, useEffect, useState } from 'react'
import AdminDashboardClassicReliable from './AdminDashboardClassicReliable'

const DashboardTripCustomerInsights = lazy(() => import('../../components/DashboardTripCustomerInsights'))
const CycleArchiveOverview = lazy(() => import('../../components/CycleArchiveOverview'))
const DashboardGrowthPanelReliable = lazy(() => import('../../components/DashboardGrowthPanelReliable'))
const RiderAppVersionStatus = lazy(() => import('../../components/RiderAppVersionStatus'))
const RiderOperationsHealth = lazy(() => import('../../components/RiderOperationsHealth'))
const LiveRiderLeaderboardPanel = lazy(() => import('../../components/LiveRiderLeaderboardPanel'))

function PanelSkeleton({ height = 'h-40' }: { height?: string }) {
  return <div className={`${height} animate-pulse rounded-[28px] border border-slate-100 bg-white shadow-sm`} />
}

export default function AdminDashboardWithTripAudit() {
  const [showSecondaryPanels, setShowSecondaryPanels] = useState(false)

  useEffect(() => {
    let timeoutId: number | undefined
    let idleId: number | undefined
    const win = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }

    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(() => setShowSecondaryPanels(true), { timeout: 900 })
    } else {
      timeoutId = window.setTimeout(() => setShowSecondaryPanels(true), 350)
    }

    return () => {
      if (idleId !== undefined && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idleId)
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [])

  return (
    <div className="space-y-6" dir="rtl">
      <AdminDashboardClassicReliable />

      {showSecondaryPanels ? (
        <Suspense fallback={<div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]"><PanelSkeleton /><PanelSkeleton /></div>}>
          <section className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
            <RiderAppVersionStatus />
            <LiveRiderLeaderboardPanel />
          </section>
          <RiderOperationsHealth />
          <DashboardTripCustomerInsights />
          <DashboardGrowthPanelReliable />
          <CycleArchiveOverview />
        </Suspense>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
          <PanelSkeleton />
          <PanelSkeleton />
        </div>
      )}
    </div>
  )
}
