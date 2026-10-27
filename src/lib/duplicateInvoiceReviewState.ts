export type FinalDuplicateDecision = 'approved' | 'rejected'

export function isDuplicateReviewPending(order: { duplicate_review_status?: unknown }): boolean {
  const status = String(order.duplicate_review_status || 'not_required')
  return status === 'pending' || status === 'not_required'
}

export function patchCommittedDuplicateOrders<T extends { id: string }>(
  orders: T[],
  decisions: ReadonlyMap<string, FinalDuplicateDecision>,
): T[] {
  return orders.map(order => {
    const status = decisions.get(String(order.id))
    if (!status) return order
    return {
      ...order,
      duplicate_review_status: status,
      needs_review: false,
      not_countable: status === 'rejected' ? true : (order as T & { not_countable?: boolean }).not_countable,
    } as T
  })
}
