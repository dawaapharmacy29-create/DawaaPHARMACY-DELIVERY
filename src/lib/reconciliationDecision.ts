/**
 * A file upload is incomplete evidence, never an administrative rejection.
 * Keep explicit human decisions separate from observations of B-Connect data.
 */
export type ReconciliationDecision = {
  matchStatus: 'pending' | 'invoice_not_found'
  finalCountStatus: 'pending_reconciliation' | 'excluded_invoice_not_found'
  countExclusionReason: string | null
  needsReview: boolean
  isCountable: false
}

export function isConfirmedAdminExclusion(order: {
  count_exclusion_reason?: string | null
}): boolean {
  return order.count_exclusion_reason === 'marked_not_found_by_admin'
}

export function preserveHumanDecision(order: {
  count_exclusion_reason?: string | null
  bconnect_match_status?: string | null
}): boolean {
  return isConfirmedAdminExclusion(order) || order.bconnect_match_status === 'manually_approved'
}

export function classifyMissingSystemInvoice(): ReconciliationDecision {
  return {
    matchStatus: 'pending',
    finalCountStatus: 'pending_reconciliation',
    countExclusionReason: null,
    needsReview: true,
    isCountable: false,
  }
}

/** A single matching number across two branches is not a unique invoice. */
export function hasUnambiguousInvoiceSource<T extends { invoice_number: string; branch_name: string }>(
  matches: readonly T[],
  normalizeBranch: (value: string) => string,
): boolean {
  if (matches.length !== 1) return false
  return Boolean(matches[0].invoice_number && normalizeBranch(matches[0].branch_name))
}
