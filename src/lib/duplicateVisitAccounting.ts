/** Rider credit belongs to each verified visit, not to the commercial invoice. */
export function isRiderOrderCountable(order: Record<string, any>): boolean {
  const status = String(order.status || '').toLowerCase()
  if (['failed', 'cancelled', 'canceled'].includes(status) || order.deleted_at || order.not_countable || order.excluded_from_incentive) return false
  // A return pickup is payable only when the manager approved the actual
  // second visit; an ordinary returned invoice never earns a trip by itself.
  if (status === 'returned' && !(order.duplicate_review_status === 'approved' && order.duplicate_reason === 'return')) return false
  if (['rejected', 'pending'].includes(String(order.duplicate_review_status || '').toLowerCase())) return false
  return order.is_countable === true || String(order.final_count_status || '').startsWith('counted')
}

export function riderOrderEarning(order: Record<string, any>, riderRate: number): number {
  if (!isRiderOrderCountable(order)) return 0
  const saved = Number(order.order_earning)
  // Legacy rows default to zero, even when a rider has a non-zero agreed rate.
  if (Number.isFinite(saved) && saved > 0) return saved
  const rate = Number(order.order_rate) > 0 ? Number(order.order_rate) : Number(riderRate)
  const multiplier = Number(order.order_multiplier ?? 1)
  return Number.isFinite(rate) && rate > 0 && Number.isFinite(multiplier) && multiplier > 0
    ? rate * multiplier : 0
}

const normalizeInvoice = (value: unknown) => String(value ?? '').trim()
  .replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 0x660))
  .replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - 0x6f0))
  .replace(/\.0$/, '').replace(/[^0-9A-Za-z-]/g, '')

export function deliveryCommercialInvoiceKey(order: Record<string, any>): string | null {
  const invoice = normalizeInvoice(order.invoice_number || order.invoice_no)
  const branch = String(order.branch_id || order.branch_name || order.branch || '').trim().toLowerCase()
  // This is only a delivery-screen estimate. Exact BConnect sale identity also
  // includes invoice date, which legacy delivery records do not reliably hold.
  return invoice && branch ? `${branch}|${invoice}` : null
}

/** A duplicate visit must never add a second copy of an invoice to summaries.
 * Figures derived from delivery registrations remain indicative, not BConnect sales. */
export function uniqueDeliveryInvoiceValue(orders: readonly Record<string, any>[]): number {
  const seen = new Set<string>()
  let total = 0
  for (const order of orders) {
    if (order.deleted_at || ['failed', 'cancelled', 'canceled'].includes(String(order.status || '').toLowerCase())) continue
    const key = deliveryCommercialInvoiceKey(order)
    // Unknown identities are not safe to present as confirmed commercial value.
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    const amount = Number(order.matched_amount ?? order.invoice_amount ?? order.invoice_value ?? order.amount)
    if (Number.isFinite(amount)) total += amount
  }
  return total
}
