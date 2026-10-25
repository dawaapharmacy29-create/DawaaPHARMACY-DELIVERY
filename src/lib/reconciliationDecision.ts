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

export type InvoiceEvidence = {
  branch_name?: string | null
  customer_code?: string | null
  phone?: string | null
  invoice_amount?: number | null
}

export type InvoiceSourceRow = InvoiceEvidence & {
  invoice_number?: string | null
  net_total?: number | null
  gross_total?: number | null
}

export type InvoiceEvidenceConflict = {
  invoiceNumber: string
  branch: string
  reasons: string[]
  previousAmount: number | null
  incomingAmount: number | null
}

/** Detect changed source identity/amount before any import batch is persisted. */
export function findInvoiceEvidenceConflicts(
  incoming: readonly InvoiceSourceRow[],
  existing: readonly InvoiceSourceRow[],
  normalizeBranch: (value: string) => string,
): InvoiceEvidenceConflict[] {
  const key = (row: InvoiceSourceRow) => `${normalizeBranch(row.branch_name || '')}|${String(row.invoice_number || '').trim()}`
  const previous = new Map(existing.map(row => [key(row), row]))
  const conflicts: InvoiceEvidenceConflict[] = []

  for (const candidate of incoming) {
    const old = previous.get(key(candidate))
    if (!old) continue
    const reasons: string[] = []
    const oldCode = customerCode(old.customer_code)
    const newCode = customerCode(candidate.customer_code)
    if (oldCode && newCode && oldCode !== newCode) reasons.push('كود العميل مختلف')

    const oldAmount = Number(old.net_total ?? old.invoice_amount ?? old.gross_total ?? 0)
    const newAmount = Number(candidate.net_total ?? candidate.invoice_amount ?? candidate.gross_total ?? 0)
    if (oldAmount > 0 && newAmount > 0 && Number.isFinite(oldAmount) && Number.isFinite(newAmount)
      && Math.abs(oldAmount - newAmount) > 0.01) reasons.push('قيمة الفاتورة مختلفة')

    if (reasons.length) conflicts.push({
      invoiceNumber: String(candidate.invoice_number || ''),
      branch: normalizeBranch(candidate.branch_name || ''),
      reasons,
      previousAmount: oldAmount > 0 ? oldAmount : null,
      incomingAmount: newAmount > 0 ? newAmount : null,
    })
  }
  return conflicts
}

function customerCode(value: unknown): string {
  return String(value ?? '').replace(/[\s\-]/g, '').trim()
}

function phoneSuffix(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : ''
}

/**
 * Select a verified B-Connect source without treating the rider's home branch
 * as the invoice source. An ambiguous invoice number needs two independent
 * corroborating facts including customer identity; a name is never sufficient.
 */
export function selectVerifiedSystemInvoice<T extends InvoiceEvidence>(
  order: InvoiceEvidence,
  candidates: readonly T[],
  normalizeBranch: (value: string) => string,
): T | null {
  if (candidates.length === 0) return null
  const branch = normalizeBranch(order.branch_name || '')
  const code = customerCode(order.customer_code)
  const phone = phoneSuffix(order.phone)
  const amount = Number(order.invoice_amount || 0)

  const assessed = candidates.map(candidate => {
    const otherCode = customerCode(candidate.customer_code)
    const otherPhone = phoneSuffix(candidate.phone)
    const otherAmount = Number(candidate.invoice_amount || 0)
    const codeKnown = Boolean(code && otherCode)
    const phoneKnown = Boolean(phone && otherPhone)
    const amountKnown = amount > 0 && otherAmount > 0
    const codeEqual = codeKnown && code === otherCode
    const phoneEqual = phoneKnown && phone === otherPhone
    const amountEqual = amountKnown && Math.abs(amount - otherAmount) <= Math.max(5, amount * 0.01)
    const conflicting = (codeKnown && !codeEqual) || (phoneKnown && !phoneEqual) || (amountKnown && !amountEqual)
    const sameBranch = Boolean(branch && branch === normalizeBranch(candidate.branch_name || ''))
    return { candidate, sameBranch, codeEqual, phoneEqual, amountEqual, conflicting }
  }).filter(result => !result.conflicting)

  if (assessed.length === 0) return null
  if (candidates.length === 1) {
    const only = assessed[0]
    // A unique invoice in another branch needs corroboration, not a home-branch guess.
    return only.sameBranch || only.codeEqual || only.phoneEqual || only.amountEqual ? only.candidate : null
  }

  const proven = assessed.filter(result =>
    (result.codeEqual || result.phoneEqual) && result.amountEqual,
  )
  return proven.length === 1 ? proven[0].candidate : null
}
