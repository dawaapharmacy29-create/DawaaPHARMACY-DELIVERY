import { supabase } from './supabase'

// ── Dev logger (silent in production) ───────────────────────────────────────
const isDev = import.meta.env.DEV
const devLog = isDev ? console.error.bind(console) : () => {}
import { getOperationalPeriod } from './helpers'
import { Attendance, Customer, DeliveryOrder, InternalTrip, Notification, Rider, RiderScheduleTemplate, RiderScheduleException, RiderPerformanceDaily, RiderRewardPenalty, RiderImportBatch, RiderImportError, UserProfile, Branch, QuickDestination } from './types'

export type AppUserContext = {
  profile: UserProfile | null
  rider: Rider | null
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

export async function getAppUserContext(): Promise<AppUserContext> {
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData.session?.user
  if (!user) return { profile: null, rider: null }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, auth_user_id, username, email, display_name, role, status, branch_id, created_at, updated_at')
    .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
    .maybeSingle()

  let rider: Rider | null = null

  if (profile) {
    const { data: linkedRider } = await supabase
      .from('riders')
      .select('*')
      .or(`auth_user_id.eq.${user.id},username.eq.${profile.username}`)
      .maybeSingle()
    rider = linkedRider as Rider | null
  }

  if (!rider && profile?.role !== 'rider') {
    const { data: firstRider } = await supabase
      .from('riders')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    rider = firstRider as Rider | null
  }

  return { profile: profile as UserProfile | null, rider }
}

export async function getTodayAttendance(riderId: string) {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('rider_id', riderId)
    .eq('work_date', todayIso())
    .maybeSingle()
  if (error) {
    devLog('Error fetching attendance:', error)
    return null
  }
  return data as Attendance | null
}

export async function checkIn(rider: Rider) {
  const { data, error } = await supabase
    .from('attendance')
    .upsert({
      rider_id: rider.id,
      branch_id: rider.branch_id,
      work_date: todayIso(),
      check_in_at: new Date().toISOString(),
      status: 'present'
    }, { onConflict: 'rider_id,work_date' })
    .select('*')
    .single()
  if (error) throw error
  return data as Attendance
}

export async function checkOut(attendance: Attendance) {
  const now = new Date()
  const start = attendance.check_in_at ? new Date(attendance.check_in_at) : now
  const minutes = Math.max(0, Math.round((now.getTime() - start.getTime()) / 60000))
  const { data, error } = await supabase
    .from('attendance')
    .update({ check_out_at: now.toISOString(), total_minutes: minutes, status: 'present' })
    .eq('id', attendance.id)
    .select('*')
    .single()
  if (error) throw error
  return data as Attendance
}

export async function searchCustomers(term: string) {
  const q = term.trim()
  if (q.length < 2) return [] as Customer[]
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('active', true)
    .or(`customer_code.ilike.%${q}%,customer_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(20)
  if (error) {
    devLog('Error searching customers:', error)
    return [] as Customer[]
  }
  return (data ?? []) as Customer[]
}

export async function checkDuplicateInvoice(invoiceNumber: string, _riderId: string): Promise<DeliveryOrder | null> {
  const { data, error } = await supabase
    .from('delivery_orders')
    .select('*')
    .eq('invoice_number', invoiceNumber.trim())
    .order('registered_at', { ascending: true })
    .limit(1)
  if (error) {
    devLog('Error checking duplicate invoice:', error)
    return null
  }
  return Array.isArray(data) ? (data[0] as DeliveryOrder | null) : null
}

export async function createDeliveryOrder(params: {
  rider: Rider
  customer: Customer | null
  manualCustomerText: string
  invoiceNumber: string
  invoiceAmount?: number | null
  notes?: string | null
  isDuplicate?: boolean
  duplicateReason?: string
  duplicateNote?: string
  orderMultiplier?: number
  multiplierReason?: string | null
}) {
  const manual = !params.customer
  const fallback = params.manualCustomerText.trim() || 'عميل غير محدد'
  
  // Check for duplicate invoice
  const existingOrder = await checkDuplicateInvoice(params.invoiceNumber, params.rider.id)
  
  const multiplier = params.orderMultiplier || 1
  const orderRate = params.rider.order_rate || 10
  const orderEarning = orderRate * multiplier
  
  let payload: Record<string, unknown> = {
    rider_id: params.rider.id,
    branch_id: params.rider.branch_id,
    customer_id: params.customer?.id ?? null,
    delivery_date: todayIso(),
    invoice_number: params.invoiceNumber.trim(),
    invoice_amount: params.invoiceAmount ?? null,
    customer_code_snapshot: params.customer?.customer_code ?? (manual ? fallback : ''),
    customer_name_snapshot: params.customer?.customer_name ?? fallback,
    customer_phone_snapshot: params.customer?.phone ?? '',
    customer_address_snapshot: params.customer?.address ?? '',
    status: 'registered',
    bconnect_match_status: 'pending',
    registered_at: new Date().toISOString(),
    notes: params.notes || null,
    source: 'rider_app',
    is_duplicate_invoice: false,
    duplicate_review_status: 'not_required',
    needs_review: manual,
    review_reason: manual ? 'عميل اتسجل يدوي ومحتاج مراجعة' : null,
    order_multiplier: multiplier,
    order_rate: orderRate,
    order_earning: orderEarning,
    multiplier_reason: params.multiplierReason || null
  }

  // If duplicate and reason provided
  if (existingOrder && params.isDuplicate && params.duplicateReason && params.duplicateNote) {
    payload = {
      ...payload,
      is_duplicate_invoice: true,
      duplicate_reason: params.duplicateReason,
      duplicate_note: params.duplicateNote,
      original_order_id: existingOrder.id,
      duplicate_review_status: 'pending',
      needs_review: true,
      review_reason: 'duplicate_invoice'
    }
  } else if (existingOrder) {
    throw new Error('DUPLICATE_INVOICE')
  }

  const { data, error } = await supabase.from('delivery_orders').insert(payload).select('*').single()
  if (error) throw error
  return data as DeliveryOrder
}

export async function createInternalTrip(params: {
  rider: Rider
  tripType: InternalTrip['trip_type']
  fromLabel: string
  toLabel: string
  reason: string
  notes?: string | null
  hasInvoiceReference?: boolean
  relatedInvoiceNumber?: string | null
}) {
  const payload = {
    rider_id: params.rider.id,
    branch_id: params.rider.branch_id,
    trip_date: todayIso(),
    trip_type: params.tripType,
    from_label: params.fromLabel,
    to_label: params.toLabel,
    reason: params.reason,
    status: 'pending_approval',
    registered_at: new Date().toISOString(),
    notes: params.notes || null,
    has_invoice_reference: params.hasInvoiceReference ?? true,
    related_invoice_number: params.relatedInvoiceNumber ?? null,
    needs_review: !params.hasInvoiceReference,
    review_reason: !params.hasInvoiceReference ? 'trip_without_invoice' : null,
    trip_rate: params.rider.trip_rate || 10,
    trip_multiplier: 1,
    trip_earning: params.rider.trip_rate || 10
  }
  const { data, error } = await supabase.from('internal_trips').insert(payload).select('*').single()
  if (error) throw error
  return data as InternalTrip
}

export async function getTodayOrders(riderId?: string) {
  let query = supabase.from('delivery_orders').select('*').eq('delivery_date', todayIso()).order('registered_at', { ascending: false })
  if (riderId) query = query.eq('rider_id', riderId)
  const { data, error } = await query
  if (error) {
    devLog('Error fetching today orders:', error)
    return [] as DeliveryOrder[]
  }
  return (data ?? []) as DeliveryOrder[]
}

export async function getTodayTrips(riderId?: string) {
  let query = supabase.from('internal_trips').select('*').eq('trip_date', todayIso()).order('registered_at', { ascending: false })
  if (riderId) query = query.eq('rider_id', riderId)
  const { data, error } = await query
  if (error) {
    devLog('Error fetching today trips:', error)
    return [] as InternalTrip[]
  }
  return (data ?? []) as InternalTrip[]
}

export async function updateOrderStatus(orderId: string, status: 'delivered' | 'failed', reason?: string) {
  const payload: Record<string, unknown> = { status }
  if (status === 'delivered') payload.delivered_at = new Date().toISOString()
  if (status === 'failed') payload.failed_reason = reason || 'سبب غير محدد'
  const { data, error } = await supabase.from('delivery_orders').update(payload).eq('id', orderId).select('*').single()
  if (error) throw error
  return data as DeliveryOrder
}

export type DeliveryTripReviewCandidate = {
  id: string
  rider_id: string
  branch_id?: string | null
  status?: string | null
  started_at?: string | null
  ended_at?: string | null
  start_lat?: number | null
  start_lng?: number | null
  start_accuracy?: number | null
  return_lat?: number | null
  return_lng?: number | null
  return_accuracy?: number | null
  needs_review?: boolean | null
  review_reason?: string | null
  manual_return_reason?: string | null
  total_orders_count?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export async function findStaleTripForReview(riderId: string, thresholdHours = 12): Promise<DeliveryTripReviewCandidate | null> {
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('delivery_trips')
    .select('id, rider_id, branch_id, status, started_at, ended_at, start_lat, start_lng, start_accuracy, return_lat, return_lng, return_accuracy, needs_review, review_reason, manual_return_reason, total_orders_count, created_at, updated_at')
    .eq('rider_id', riderId)
    .eq('status', 'active')
    .is('ended_at', null)
    .lt('started_at', cutoff)
    .order('started_at', { ascending: false })
    .limit(5)

  if (error) {
    devLog('Error finding stale trip:', error)
    return null
  }

  return ((data ?? [])[0] as DeliveryTripReviewCandidate | null) ?? null
}

export async function reviewTripAsStale(tripId: string, _reason = 'stale_open_trip', manualReason?: string) {
  const nowIso = new Date().toISOString()
  const { data: currentTrip, error: fetchError } = await supabase
    .from('delivery_trips')
    .select('review_reason, manual_return_reason, ended_at, updated_at, created_at')
    .eq('id', tripId)
    .maybeSingle()

  if (fetchError) throw fetchError

  const existingReviewReason = String((currentTrip as any)?.review_reason || '').trim()
  const resolvedReviewReason = existingReviewReason || 'مشوار مفتوح قديم يحتاج مراجعة إدارية'
  const resolvedManualReason = String((currentTrip as any)?.manual_return_reason || '').trim() || manualReason || 'تم تحويل المشوار للمراجعة لأنه ظل مفتوحًا أكثر من 12 ساعة'
  const resolvedEndedAt = String((currentTrip as any)?.ended_at || (currentTrip as any)?.updated_at || (currentTrip as any)?.created_at || nowIso)

  const { data, error } = await supabase
    .from('delivery_trips')
    .update({
      status: 'review',
      ended_at: resolvedEndedAt,
      needs_review: true,
      review_reason: resolvedReviewReason,
      manual_return_reason: resolvedManualReason,
      updated_at: nowIso,
    })
    .eq('id', tripId)
    .select('*')
    .single()

  if (error) {
    devLog('Error reviewing stale trip:', error)
    throw error
  }

  return data as DeliveryTripReviewCandidate
}

export async function logOrderEdit(params: {
  orderId: string
  riderId: string
  reason: string
  patch: Record<string, unknown>
}) {
  try {
    await supabase.from('delivery_order_edit_logs').insert({
      order_id: params.orderId,
      rider_id: params.riderId,
      edit_reason: params.reason,
      patch: params.patch,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    devLog('Error logging order edit:', error)
  }
}

export async function getNotifications(riderId?: string, profileId?: string) {
  let query = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)
  if (riderId && profileId) query = query.or(`rider_id.eq.${riderId},recipient_profile_id.eq.${profileId}`)
  else if (riderId) query = query.eq('rider_id', riderId)
  else if (profileId) query = query.eq('recipient_profile_id', profileId)
  const { data, error } = await query
  if (error) {
    devLog('Error fetching notifications:', error)
    return [] as Notification[]
  }
  return (data ?? []) as Notification[]
}

export async function getAdminStats(branchId?: string | null) {
  const period = getOperationalPeriod()
  const today = todayIso()
  const ridersQuery = supabase.from('riders').select('*').eq('status', 'active')
  const todayOrdersQuery = supabase.from('delivery_orders').select('*').gte('delivery_date', today).lte('delivery_date', today)
  const todayTripsQuery = supabase.from('internal_trips').select('*').gte('trip_date', today).lte('trip_date', today)
  const branchesQuery = supabase.from('branches').select('*').eq('active', true)
  const attendanceQuery = supabase.from('attendance').select('*').eq('work_date', today)
  const cycleOrdersQuery = supabase.from('delivery_orders').select('*').gte('delivery_date', period.start).lte('delivery_date', period.end)
  const cycleTripsQuery = supabase.from('internal_trips').select('*').gte('trip_date', period.start).lte('trip_date', period.end)

  if (branchId) {
    ridersQuery.eq('branch_id', branchId)
    todayOrdersQuery.eq('branch_id', branchId)
    todayTripsQuery.eq('branch_id', branchId)
    branchesQuery.eq('id', branchId)
    attendanceQuery.eq('branch_id', branchId)
    cycleOrdersQuery.eq('branch_id', branchId)
    cycleTripsQuery.eq('branch_id', branchId)
  }

  const results = await Promise.allSettled([
    ridersQuery,
    todayOrdersQuery,
    todayTripsQuery,
    supabase.from('incidents').select('*').eq('status', 'open'),
    supabase.from('performance_scores').select('*').order('total_score', { ascending: false }).limit(20),
    branchesQuery,
    attendanceQuery,
    cycleOrdersQuery,
    cycleTripsQuery
  ])

  const ridersRes = results[0].status === 'fulfilled' ? results[0].value : { data: null, error: results[0].reason }
  const ordersRes = results[1].status === 'fulfilled' ? results[1].value : { data: null, error: results[1].reason }
  const tripsRes = results[2].status === 'fulfilled' ? results[2].value : { data: null, error: results[2].reason }
  const incidentsRes = results[3].status === 'fulfilled' ? results[3].value : { data: null, error: results[3].reason }
  const scoresRes = results[4].status === 'fulfilled' ? results[4].value : { data: null, error: results[4].reason }
  const branchesRes = results[5].status === 'fulfilled' ? results[5].value : { data: null, error: results[5].reason }
  const attendanceRes = results[6].status === 'fulfilled' ? results[6].value : { data: null, error: results[6].reason }
  const cycleOrdersRes = results[7].status === 'fulfilled' ? results[7].value : { data: null, error: results[7].reason }
  const cycleTripsRes = results[8].status === 'fulfilled' ? results[8].value : { data: null, error: results[8].reason }

  // Log errors but don't throw
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      devLog(`Admin stats query ${index} failed:`, result.reason)
    }
  })

  return {
    riders: (ridersRes.data ?? []) as Rider[],
    orders: (ordersRes.data ?? []) as DeliveryOrder[],
    trips: (tripsRes.data ?? []) as InternalTrip[],
    incidents: (incidentsRes.data ?? []) as any[],
    scores: (scoresRes.data ?? []) as any[],
    branches: (branchesRes.data ?? []) as any[],
    attendance: (attendanceRes.data ?? []) as Attendance[],
    cycleOrders: (cycleOrdersRes.data ?? []) as DeliveryOrder[],
    cycleTrips: (cycleTripsRes.data ?? []) as InternalTrip[]
  }
}

// Rider Schedule Templates
export async function getRiderScheduleTemplates(riderId?: string) {
  let query = supabase.from('rider_schedule_templates').select('*').eq('status', 'active').order('day_of_week', { ascending: true })
  if (riderId) query = query.eq('rider_id', riderId)
  const { data, error } = await query
  if (error) {
    devLog('Error fetching rider schedule templates:', error)
    return [] as RiderScheduleTemplate[]
  }
  return (data ?? []) as RiderScheduleTemplate[]
}

export async function upsertRiderScheduleTemplate(template: Partial<RiderScheduleTemplate>) {
  const { data, error } = await supabase.from('rider_schedule_templates').upsert(template).select('*').single()
  if (error) {
    devLog('Error upserting rider schedule template:', error)
    throw error
  }
  return data as RiderScheduleTemplate
}

// Rider Schedule Exceptions
export async function getRiderScheduleExceptions(riderId?: string, startDate?: string, endDate?: string) {
  let query = supabase.from('rider_schedule_exceptions').select('*').order('exception_date', { ascending: true })
  if (riderId) query = query.eq('rider_id', riderId)
  if (startDate) query = query.gte('exception_date', startDate)
  if (endDate) query = query.lte('exception_date', endDate)
  const { data, error } = await query
  if (error) {
    devLog('Error fetching rider schedule exceptions:', error)
    return [] as RiderScheduleException[]
  }
  return (data ?? []) as RiderScheduleException[]
}

export async function createRiderScheduleException(exception: Partial<RiderScheduleException>) {
  const { data, error } = await supabase.from('rider_schedule_exceptions').insert(exception).select('*').single()
  if (error) {
    devLog('Error creating rider schedule exception:', error)
    throw error
  }
  return data as RiderScheduleException
}

export async function approveRiderScheduleException(exceptionId: string, approvedBy: string) {
  const { data, error } = await supabase
    .from('rider_schedule_exceptions')
    .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', exceptionId)
    .select('*')
    .single()
  if (error) {
    devLog('Error approving rider schedule exception:', error)
    throw error
  }
  return data as RiderScheduleException
}

// Rider Performance Daily
export async function getRiderPerformanceDaily(riderId?: string, startDate?: string, endDate?: string) {
  let query = supabase.from('rider_performance_daily').select('*').order('performance_date', { ascending: false })
  if (riderId) query = query.eq('rider_id', riderId)
  if (startDate) query = query.gte('performance_date', startDate)
  if (endDate) query = query.lte('performance_date', endDate)
  const { data, error } = await query
  if (error) {
    devLog('Error fetching rider performance daily:', error)
    return [] as RiderPerformanceDaily[]
  }
  return (data ?? []) as RiderPerformanceDaily[]
}

export async function upsertRiderPerformanceDaily(performance: Partial<RiderPerformanceDaily>) {
  const { data, error } = await supabase.from('rider_performance_daily').upsert(performance).select('*').single()
  if (error) {
    devLog('Error upserting rider performance daily:', error)
    throw error
  }
  return data as RiderPerformanceDaily
}

// Rider Rewards and Penalties
export async function getRiderRewardsPenalties(riderId?: string, startDate?: string, endDate?: string) {
  let query = supabase.from('rider_rewards_penalties').select('*').order('event_date', { ascending: false })
  if (riderId) query = query.eq('rider_id', riderId)
  if (startDate) query = query.gte('event_date', startDate)
  if (endDate) query = query.lte('event_date', endDate)
  const { data, error } = await query
  if (error) {
    devLog('Error fetching rider rewards penalties:', error)
    return [] as RiderRewardPenalty[]
  }
  return (data ?? []) as RiderRewardPenalty[]
}

export async function createRiderRewardPenalty(rewardPenalty: Partial<RiderRewardPenalty>) {
  const { data, error } = await supabase.from('rider_rewards_penalties').insert(rewardPenalty).select('*').single()
  if (error) {
    devLog('Error creating rider reward penalty:', error)
    throw error
  }
  return data as RiderRewardPenalty
}

export async function approveRiderRewardPenalty(penaltyId: string, approvedBy: string) {
  const { data, error } = await supabase
    .from('rider_rewards_penalties')
    .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', penaltyId)
    .select('*')
    .single()
  if (error) {
    devLog('Error approving rider reward penalty:', error)
    throw error
  }
  return data as RiderRewardPenalty
}

// Rider Import Batches
export async function createRiderImportBatch(fileName: string, importedBy: string | null) {
  const { data, error } = await supabase
    .from('rider_import_batches')
    .insert({ file_name: fileName, imported_by: importedBy, rows_count: 0 })
    .select('*')
    .single()
  if (error) {
    devLog('Error creating rider import batch:', error)
    throw error
  }
  return data as RiderImportBatch
}

export async function updateRiderImportBatch(batchId: string, updates: Partial<RiderImportBatch>) {
  const { data, error } = await supabase
    .from('rider_import_batches')
    .update(updates)
    .eq('id', batchId)
    .select('*')
    .single()
  if (error) {
    devLog('Error updating rider import batch:', error)
    throw error
  }
  return data as RiderImportBatch
}

export async function getRiderImportBatches(limit = 20) {
  const { data, error } = await supabase
    .from('rider_import_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    devLog('Error fetching rider import batches:', error)
    return [] as RiderImportBatch[]
  }
  return (data ?? []) as RiderImportBatch[]
}

// Rider Import Errors
export async function createRiderImportError(importError: Partial<RiderImportError>) {
  const { data, error } = await supabase.from('rider_import_errors').insert(importError).select('*').single()
  if (error) {
    devLog('Error creating rider import error:', error)
    throw error
  }
  return data as RiderImportError
}

export async function getRiderImportErrors(batchId: string) {
  const { data, error } = await supabase
    .from('rider_import_errors')
    .select('*')
    .eq('batch_id', batchId)
    .order('row_number', { ascending: true })
  if (error) {
    devLog('Error fetching rider import errors:', error)
    return [] as RiderImportError[]
  }
  return (data ?? []) as RiderImportError[]
}

// Get today's schedule for a rider
export async function getTodayRiderSchedule(riderId: string) {
  const today = new Date().getDay()
  const { data, error } = await supabase
    .from('rider_schedule_templates')
    .select('*')
    .eq('rider_id', riderId)
    .eq('day_of_week', today)
    .eq('status', 'active')
    .maybeSingle()
  if (error) {
    devLog('Error fetching today rider schedule:', error)
    return null
  }
  return data as RiderScheduleTemplate | null
}

// Check if rider has exception for today
export async function getTodayRiderException(riderId: string) {
  const { data, error } = await supabase
    .from('rider_schedule_exceptions')
    .select('*')
    .eq('rider_id', riderId)
    .eq('exception_date', todayIso())
    .maybeSingle()
  if (error) {
    devLog('Error fetching today rider exception:', error)
    return null
  }
  return data as RiderScheduleException | null
}

export async function getRiders(): Promise<Rider[]> {
  const { data, error } = await supabase
    .from('riders')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
    devLog('Error fetching riders:', error)
    return []
  }
  return data as Rider[]
}

export async function getBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('name', { ascending: true })
  if (error) {
    devLog('Error fetching branches:', error)
    return []
  }
  return data as Branch[]
}

export async function logAuditEvent(params: {
  userId: string
  action: string
  entityType: string
  entityId: string
  details?: Record<string, unknown>
  ipAddress?: string
}) {
  try {
    const { error } = await supabase.from('audit_log').insert({
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      details: params.details || null,
      ip_address: params.ipAddress || null,
      created_at: new Date().toISOString()
    })
    if (error) throw error
  } catch (error) {
    devLog('Error logging audit event:', error)
    // Don't throw - audit logging should not break the main flow
  }
}

export async function getQuickDestinations(): Promise<QuickDestination[]> {
  const { data, error } = await supabase
    .from('quick_destinations')
    .select('*')
    .eq('active', true)
    .order('quick_code', { ascending: true })
  if (error) {
    devLog('Error fetching quick destinations:', error)
    return []
  }
  return data as QuickDestination[]
}

export async function getQuickDestinationByCode(code: string): Promise<QuickDestination | null> {
  const { data, error } = await supabase
    .from('quick_destinations')
    .select('*')
    .eq('quick_code', code)
    .eq('active', true)
    .maybeSingle()
  if (error) {
    devLog('Error fetching quick destination:', error)
    return null
  }
  return data as QuickDestination | null
}

export async function getTripsWithoutInvoice(): Promise<InternalTrip[]> {
  const { data, error } = await supabase
    .from('internal_trips')
    .select('*')
    .eq('has_invoice_reference', false)
    .eq('needs_review', true)
    .order('registered_at', { ascending: false })
  if (error) {
    devLog('Error fetching trips without invoice:', error)
    return []
  }
  return data as InternalTrip[]
}

export async function approveTrip(tripId: string, note?: string) {
  const { data, error } = await supabase
    .from('internal_trips')
    .update({
      status: 'approved',
      review_status: 'approved',
      approved_at: new Date().toISOString(),
      needs_review: false,
      review_reason: null,
      notes: note
    })
    .eq('id', tripId)
    .select('*')
    .single()
  if (error) throw error
  return data as InternalTrip
}

export async function rejectTrip(tripId: string, reason: string) {
  const { data, error } = await supabase
    .from('internal_trips')
    .update({
      status: 'rejected',
      review_status: 'rejected',
      rejection_reason: reason,
      needs_review: false,
      review_reason: null
    })
    .eq('id', tripId)
    .select('*')
    .single()
  if (error) throw error
  return data as InternalTrip
}

export async function approveDuplicateInvoice(orderId: string) {
  const { data, error } = await supabase
    .from('delivery_orders')
    .update({
      duplicate_review_status: 'approved',
      needs_review: false
    })
    .eq('id', orderId)
    .select('*')
    .single()
  if (error) throw error
  return data as DeliveryOrder
}

export async function rejectDuplicateInvoice(orderId: string, reason: string) {
  const { data, error } = await supabase
    .from('delivery_orders')
    .update({
      duplicate_review_status: 'rejected',
      duplicate_rejection_reason: reason,
      needs_review: false
    })
    .eq('id', orderId)
    .select('*')
    .single()
  if (error) throw error
  return data as DeliveryOrder
}
