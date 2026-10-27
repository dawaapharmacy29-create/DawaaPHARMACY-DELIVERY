/**
 * Only a DB-returned row in the requested final state can close a manager
 * approval. The request itself succeeding (HTTP 2xx) is not sufficient:
 * RLS or a concurrent manager can cause a conditional update of zero rows.
 */
export function confirmedTripDecisions<T extends { id: string; status: string; review_status: string }>(
  rows: T[] | null | undefined,
  requestedIds: string[],
  expectedStatus: string,
): T[] {
  const requested = new Set(requestedIds)
  const seen = new Set<string>()
  return (rows || []).filter(row => {
    const id = String(row.id)
    if (!requested.has(id) || seen.has(id) || row.status !== expectedStatus || row.review_status !== expectedStatus) return false
    seen.add(id)
    return true
  })
}
