type DrillParams = Record<string, string | number | boolean | null | undefined>

function withParams(path: string, params?: DrillParams) {
  const query = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

export const ordersUrl = (params?: DrillParams) => reconciliationUrl(params)
export const reconciliationUrl = (params?: DrillParams) => withParams('/admin/reconciliation', params)
export const ridersUrl = (params?: DrillParams) => withParams('/admin/riders', params)
export const riderPerformanceUrl = (riderId?: string | null, params?: DrillParams) =>
  riderId ? withParams(`/admin/riders/${riderId}/performance`, params) : withParams('/admin/performance', params)
export const duplicateInvoicesUrl = (params?: DrillParams) => withParams('/admin/duplicate-invoices', params)
export const tripsUrl = (params?: DrillParams) => withParams('/admin/trips', params)
export const customersUrl = (params?: DrillParams) => withParams('/admin/customer-analytics', params)
export const fraudAlertsUrl = (params?: DrillParams) => withParams('/admin/fraud-alerts', params)
export const branchUrl = (branchName?: string | null, params?: DrillParams) =>
  withParams('/admin/branch', { branch: branchName || undefined, ...(params || {}) })

export function clickableDrilldownClass(className = '') {
  return `cursor-pointer transition hover:-translate-y-0.5 hover:shadow-lg ${className}`.trim()
}
