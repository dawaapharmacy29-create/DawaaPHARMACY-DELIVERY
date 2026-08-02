export type AppRole =
  | 'rider'
  | 'shift_manager'
  | 'branch_manager'
  | 'customer_service_manager'
  | 'operations_manager'
  | 'branches_manager'
  | 'general_manager'
  | 'admin'

export type PageKey =
  | 'rider'
  | 'dashboard'
  | 'branch_dashboard'
  | 'riders'
  | 'rider_accounts'
  | 'rider_schedules'
  | 'performance'
  | 'duplicate_invoices'
  | 'reconciliation'
  | 'trips'
  | 'rider_actions'
  | 'trips_without_invoice'
  | 'customer_import'
  | 'customer_analytics'

const GENERAL_MANAGER_PAGES: PageKey[] = [
  'dashboard',
  'branch_dashboard',
  'riders',
  'rider_accounts',
  'rider_schedules',
  'performance',
  'duplicate_invoices',
  'reconciliation',
  'trips',
  'rider_actions',
  'trips_without_invoice',
  'customer_import',
  'customer_analytics',
]

const BRANCH_MANAGER_PAGES: PageKey[] = [
  'dashboard',
  'branch_dashboard',
  'riders',
  'rider_schedules',
  'performance',
  'duplicate_invoices',
  'reconciliation',
  'trips',
  'rider_actions',
  'trips_without_invoice',
  'customer_import',
  'customer_analytics',
]

const CUSTOMER_SERVICE_MANAGER_PAGES: PageKey[] = [
  'dashboard',
  'branch_dashboard',
  'riders',
  'performance',
  'trips',
  'rider_actions',
  'customer_analytics',
]

export function isManagerRole(role?: string | null) {
  return [
    'admin',
    'general_manager',
    'operations_manager',
    'branches_manager',
    'branch_manager',
    'shift_manager',
    'customer_service_manager',
  ].includes(String(role || ''))
}

export function canAccessPage(role?: string | null, pageKey?: PageKey) {
  const normalized = String(role || 'rider') as AppRole
  if (!pageKey) return true
  if (pageKey === 'rider') return normalized === 'rider'
  if (['admin', 'general_manager', 'operations_manager', 'branches_manager'].includes(normalized)) {
    return GENERAL_MANAGER_PAGES.includes(pageKey)
  }
  if (normalized === 'branch_manager' || normalized === 'shift_manager') {
    return BRANCH_MANAGER_PAGES.includes(pageKey)
  }
  if (normalized === 'customer_service_manager') {
    return CUSTOMER_SERVICE_MANAGER_PAGES.includes(pageKey)
  }
  return false
}

export function canManageBranch(role?: string | null, userBranchId?: string | null, targetBranchId?: string | null) {
  const normalized = String(role || 'rider')
  if (['admin', 'general_manager', 'operations_manager', 'branches_manager'].includes(normalized)) return true
  if (['branch_manager', 'shift_manager', 'customer_service_manager'].includes(normalized)) {
    return !!userBranchId && !!targetBranchId && userBranchId === targetBranchId
  }
  return false
}

export function isBranchScopedRole(role?: string | null) {
  return ['branch_manager', 'shift_manager', 'customer_service_manager'].includes(String(role || ''))
}
