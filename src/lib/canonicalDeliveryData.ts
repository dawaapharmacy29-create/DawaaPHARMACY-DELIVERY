import { fetchAllRows } from './fetchAllRows'
import { displayBranchName } from './branchUtils'
import { isDelivered, isFailed, isDuplicate, isMultiplier, isUncounted, num } from './deliveryAnalytics'

export type CanonicalDeliveryData = { orders: any[]; trips: any[]; riders: any[]; branches: any[] }

export async function loadCanonicalDeliveryData(from: string, to: string): Promise<CanonicalDeliveryData> {
  const [orders, trips, riders, branches] = await Promise.all([
    fetchAllRows<any>({ table: 'delivery_orders', filters: [{ column: 'delivery_date', operator: 'gte', value: from }, { column: 'delivery_date', operator: 'lte', value: to }], orderColumn: 'registered_at', ascending: false }),
    fetchAllRows<any>({ table: 'internal_trips', filters: [{ column: 'trip_date', operator: 'gte', value: from }, { column: 'trip_date', operator: 'lte', value: to }], orderColumn: 'registered_at', ascending: false }),
    fetchAllRows<any>({ table: 'riders', filters: [{ column: 'status', operator: 'eq', value: 'active' }], orderColumn: 'created_at', ascending: true }),
    fetchAllRows<any>({ table: 'branches', orderColumn: 'created_at', ascending: true }),
  ])
  return { orders, trips, riders, branches }
}

export function aggregateCanonicalRiders(data: CanonicalDeliveryData) {
  const branchMap = new Map(data.branches.map(branch => [branch.id, branch]))
  return data.riders.map(rider => {
    const orders = data.orders.filter(order => order.rider_id === rider.id)
    const trips = data.trips.filter(trip => trip.rider_id === rider.id)
    const delivered = orders.filter(isDelivered).length
    const failed = orders.filter(isFailed).length
    const duplicates = orders.filter(isDuplicate).length
    const multiplier = orders.filter(isMultiplier).length
    const uncounted = orders.filter(isUncounted).length
    const pending = orders.filter(order => ['pending', 'unmatched', 'not_found'].includes(String(order.bconnect_match_status || order.reconciliation_status || '').toLowerCase())).length
    const review = orders.filter(order => Boolean(order.needs_review) || ['technical_review', 'pending_review'].includes(String(order.review_status || order.duplicate_review_status || '').toLowerCase())).length
    const registered = orders.filter(order => Boolean(order.registered_at || order.created_at)).length
    const rewards = orders.reduce((sum, order) => sum + num(order.reward_amount || order.rewards_amount), 0)
    const penalties = orders.reduce((sum, order) => sum + num(order.penalty_amount || order.penalties_amount), 0)
    const riskRate = orders.length ? ((failed + duplicates + review) / orders.length) * 100 : 0
    const branch = branchMap.get(rider.branch_id)
    return {
      rider_id: rider.id,
      rider_name: rider.name || rider.username || 'غير محدد',
      branch_name: displayBranchName((branch as any)?.display_name || (branch as any)?.name || rider.branch_name || rider.branch_id),
      total_orders: orders.length,
      registered_orders: registered,
      delivered_orders: delivered,
      multiplier_orders: multiplier,
      duplicate_orders: duplicates,
      failed_orders: failed,
      pending_reconciliation_orders: pending,
      review_orders: review,
      uncounted_orders: uncounted,
      risk_rate: riskRate,
      accuracy_score: Math.max(0, 100 - riskRate),
      operation_rate: orders.length ? registered / orders.length * 100 : 0,
      delivery_rate: orders.length ? delivered / orders.length * 100 : 0,
      trips: trips.length,
      approvedTrips: trips.filter(trip => ['approved', 'completed', 'countable'].includes(String(trip.status || trip.review_status || '').toLowerCase())).length,
      rewards,
      penalties,
      netEarnings: rewards - penalties,
    }
  })
}
