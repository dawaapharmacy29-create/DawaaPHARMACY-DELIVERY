export interface UserProfile {
  id: string
  auth_user_id: string
  username: string
  email: string
  display_name: string
  role: 'admin' | 'shift_manager' | 'rider'
  status: 'active' | 'inactive' | 'suspended'
  branch_id: string | null
  created_at: string
  updated_at: string
}

export interface Branch {
  id: string
  name: string
  code: string
  address: string
  active: boolean
  delivery_order_multiplier_enabled: boolean
  default_order_rate?: number
  default_trip_rate?: number
  created_at: string
  updated_at: string
}

export interface Rider {
  id: string
  profile_id: string | null
  auth_user_id: string | null
  name: string
  username: string
  phone: string
  branch_id: string
  branch_name?: string | null
  level: 'junior' | 'mid' | 'senior'
  hourly_rate: number
  order_rate: number
  trip_rate: number
  monthly_incentive_base: number
  quarterly_incentive_base: number
  shift_start: string | null
  shift_end: string | null
  weekly_day_off: string | null
  status: 'active' | 'inactive' | 'suspended'
  notes: string | null
  pin: string | null
  pin_enabled: boolean
  pin_changed_at: string | null
  created_at: string
  updated_at: string
}

export interface RiderAccount {
  id: string
  rider_id: string | null
  username: string
  display_name: string | null
  role: 'rider' | 'admin' | 'shift_manager'
  status: 'active' | 'inactive' | 'suspended'
  temporary_pin_hash: string | null
  must_change_pin: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  customer_code: string
  customer_name: string
  phone: string
  address: string
  branch_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Attendance {
  id: string
  rider_id: string
  branch_id: string
  work_date: string
  shift_date?: string | null
  check_in_at: string | null
  check_out_at: string | null
  check_in_time?: string | null
  check_out_time?: string | null
  planned_shift_start: string | null
  planned_shift_end: string | null
  late_minutes: number
  early_leave_minutes: number
  total_minutes: number | null
  status: 'present' | 'late' | 'absent' | 'permission' | 'leave' | 'sick_leave' | 'incomplete' | 'missing_checkout' | 'needs_review'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DeliveryOrder {
  id: string
  rider_id: string
  branch_id: string
  customer_id: string | null
  delivery_date: string
  work_date?: string | null
  attendance_id?: string | null
  invoice_number: string
  invoice_amount: number | null
  customer_code_snapshot: string
  customer_name_snapshot: string
  customer_phone_snapshot: string
  customer_address_snapshot: string
  status: 'registered' | 'delivered' | 'failed' | 'cancelled' | 'needs_review'
  bconnect_match_status: 'pending' | 'matched' | 'invoice_not_found' | 'customer_mismatch' | 'branch_mismatch' | 'manually_approved'
  bconnect_invoice_id: string | null
  registered_at: string
  prepared_at?: string | null
  ready_at?: string | null
  dispatched_at?: string | null
  picked_up_at?: string | null
  arrived_at?: string | null
  dispatch_by?: string | null
  dispatch_by_name?: string | null
  picked_up_by?: string | null
  picked_up_by_name?: string | null
  dispatch_status?: 'not_ready' | 'ready' | 'dispatched' | 'picked_up' | 'delivered' | 'failed' | string | null
  dispatch_notes?: string | null
  pickup_notes?: string | null
  delivery_duration_minutes?: number | null
  delivered_at: string | null
  failed_reason: string | null
  notes: string | null
  source: string
  is_duplicate_invoice: boolean
  duplicate_reason: string | null
  duplicate_note: string | null
  original_order_id: string | null
  duplicate_review_status: 'not_required' | 'pending' | 'approved' | 'rejected'
  duplicate_reviewed_by: string | null
  duplicate_reviewed_at: string | null
  needs_review: boolean
  review_reason: string | null
  order_multiplier: number
  order_rate: number
  order_earning: number
  multiplier_reason: string | null
  matched_at: string | null
  matched_amount: number
  reconciliation_notes: string | null
  created_at: string
  updated_at: string
}

export interface InternalTrip {
  id: string
  rider_id: string
  branch_id: string
  trip_date: string
  trip_type: 'branch_to_branch' | 'warehouse' | 'supplies' | 'pharmacy' | 'shipment_pickup' | 'accessories' | 'purchase_missing_item' | 'supplier' | 'returns' | 'collection' | 'visit_again' | 'other'
  from_label: string
  to_label: string
  reason: string
  status: 'pending_approval' | 'approved' | 'rejected' | 'completed' | 'cancelled'
  registered_at: string
  prepared_at?: string | null
  ready_at?: string | null
  dispatched_at?: string | null
  picked_up_at?: string | null
  arrived_at?: string | null
  dispatch_by?: string | null
  dispatch_by_name?: string | null
  picked_up_by?: string | null
  picked_up_by_name?: string | null
  dispatch_status?: 'not_ready' | 'ready' | 'dispatched' | 'picked_up' | 'delivered' | 'failed' | string | null
  dispatch_notes?: string | null
  pickup_notes?: string | null
  delivery_duration_minutes?: number | null
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  notes: string | null
  has_invoice_reference: boolean
  related_invoice_number: string | null
  trip_rate: number
  trip_multiplier: number
  trip_earning: number
  needs_review: boolean
  review_reason: string | null
  created_at: string
  updated_at: string
}

export interface ImportBatch {
  id: string
  file_name: string
  imported_by: string
  period_start: string
  period_end: string
  rows_count: number
  created_at: string
}

export interface BConnectInvoice {
  id: string
  import_batch_id: string
  invoice_number: string
  customer_code: string
  customer_name: string
  phone: string
  address: string
  branch_code: string
  invoice_date: string
  invoice_amount: number
  raw_data: Record<string, unknown>
  created_at: string
}

export interface ReconciliationResult {
  id: string
  period_start: string
  period_end: string
  delivery_order_id: string | null
  bconnect_invoice_id: string | null
  rider_id: string | null
  invoice_number: string
  match_status: 'matched' | 'invoice_not_found' | 'not_registered_by_rider' | 'customer_mismatch' | 'branch_mismatch' | 'pending'
  match_reason: string
  created_at: string
  updated_at: string
}

export interface MonthlyPayroll {
  id: string
  period_start: string
  period_end: string
  rider_id: string
  level_snapshot: string
  hourly_rate_snapshot: number
  order_rate_snapshot: number
  trip_rate_snapshot: number
  monthly_incentive_base_snapshot: number
  total_work_minutes: number
  total_work_hours: number
  delivered_orders_count: number
  matched_orders_count: number
  approved_trips_count: number
  hours_amount: number
  orders_amount: number
  trips_amount: number
  incentive_amount: number
  bonuses_amount: number
  penalties_amount: number
  net_total: number
  status: 'draft' | 'pending_review' | 'approved' | 'paid'
  created_at: string
  updated_at: string
}

export interface Incident {
  id: string
  rider_id: string
  order_id: string | null
  trip_id: string | null
  incident_date: string
  incident_type: 'late_order' | 'missing_order_registration' | 'wrong_customer_code' | 'wrong_invoice_number' | 'customer_complaint' | 'unjustified_trip' | 'late_return' | 'bad_behavior' | 'other'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  status: 'open' | 'in_review' | 'resolved' | 'dismissed'
  created_by: string
  created_at: string
  resolved_by: string | null
  resolved_at: string | null
}

export interface PerformanceScore {
  id: string
  period_start: string
  period_end: string
  rider_id: string
  invoice_match_score: number
  registration_score: number
  timing_score: number
  trips_score: number
  behavior_score: number
  attendance_score: number
  total_score: number
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  recipient_profile_id: string | null
  rider_id: string | null
  title: string
  message: string
  severity: 'info' | 'success' | 'warning' | 'danger'
  status: 'unread' | 'read' | 'resolved'
  action_url: string | null
  created_at: string
  read_at: string | null
}

export interface AuditLog {
  id: string
  actor_profile_id: string
  action: string
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
}

export interface OperationalPeriod {
  start: string
  end: string
}

export interface RiderScheduleTemplate {
  id: string
  rider_id: string
  branch_id: string
  branch_name: string | null
  day_of_week: number
  day_name_ar: string
  is_day_off: boolean
  shift_start: string | null
  shift_end: string | null
  planned_hours: number
  crosses_midnight: boolean
  effective_from: string
  effective_to: string | null
  status: 'active' | 'inactive'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RiderScheduleException {
  id: string
  rider_id: string
  branch_id: string
  exception_date: string
  exception_type: 'leave' | 'permission' | 'sick_leave' | 'absence' | 'schedule_change' | 'holiday' | 'emergency'
  original_shift_start: string | null
  original_shift_end: string | null
  new_shift_start: string | null
  new_shift_end: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  requested_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface RiderPerformanceDaily {
  id: string
  rider_id: string
  branch_id: string
  performance_date: string
  orders_count: number
  delivered_count: number
  failed_count: number
  internal_trips_count: number
  approved_trips_count: number
  duplicate_invoices_count: number
  late_minutes: number
  absence_count: number
  incidents_count: number
  rewards_amount: number
  penalties_amount: number
  estimated_earnings: number
  performance_score: number
  created_at: string
  updated_at: string
}

export interface RiderRewardPenalty {
  id: string
  rider_id: string
  branch_id: string
  event_date: string
  type: 'reward' | 'penalty'
  category: 'late' | 'absence' | 'duplicate_invoice' | 'customer_complaint' | 'excellent_performance' | 'high_orders' | 'approved_extra_trip' | 'manual'
  amount: number | null
  points: number
  reason: string
  related_order_id: string | null
  related_trip_id: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface RiderImportBatch {
  id: string
  file_name: string
  imported_by: string | null
  rows_count: number
  success_count: number
  update_count: number
  error_count: number
  warning_count: number
  created_at: string
}

export interface RiderImportError {
  id: string
  batch_id: string
  row_number: number | null
  rider_name: string | null
  branch_name: string | null
  error_message: string
  raw_data: Record<string, unknown> | null
  created_at: string
}

export interface QuickDestination {
  id: string
  quick_code: string
  name: string
  destination_type: string | null
  branch_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface DeliveryAuditLog {
  id: string
  module_name: string | null
  action: string
  record_id: string | null
  actor_id: string | null
  actor_name: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  notes: string | null
  created_at: string
}

export interface GeneratedAccount {
  rider_name: string
  username: string
  pin: string
  branch_name: string
  status: 'new' | 'updated'
}
